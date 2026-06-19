import "server-only";

import { FieldPath, type Query } from "firebase-admin/firestore";
import { REQUIREMENT_KEYS, RENEWAL_REQUIREMENT_KEYS } from "../../shared/student";
import type {
  StudentRequirementKey,
  StudentRequirementMap,
  StudentRenewalRequirementKey,
  StudentRenewalRequirementMap,
  StudentSemesterRecord,
  Student,
  StudentInput,
  StudentRenewalHistoryEntry,
  StudentYearLevelHistoryEntry
} from "../../shared/student";
import { COLLECTIONS } from "../../shared/collections";
import { getAdminDb } from "../firebase-admin";
import { HttpError } from "../../shared/http";
import {
  getStudentCyclePayoutType,
  hasStudentPayrollRecord,
  isStudentForRenewal,
  isStudentInitialPayoutQualified,
  isStudentPayrolledForCycle,
  isStudentQualifiedForPayrollCycle
} from "../../models/student";
import { isAdminRole } from "../../shared/roles";
import type { SessionUser } from "../../shared/user";
import type { CurrentCycleConfig } from "../../shared/current-cycle";

const db = getAdminDb();
const DEFAULT_STUDENT_PAGE_SIZE = 75;
const MAX_STUDENT_PAGE_SIZE = 250;

type StudentPageFilters = {
  query?: string;
  school?: string;
  barangay?: string;
  batch?: string;
  status?: string;
  cycle?: Pick<CurrentCycleConfig, "cycle_key" | "school_year" | "sem_number">;
  requirementsTab?: "not-renewal" | "renewal";
  payrollTab?: "new" | "renewal";
};

function normalizeBoolean(value: unknown) {
  return value === true;
}

function emptyRequirementMap(): StudentRequirementMap {
  return {
    certificate_of_residency: false,
    pagpapatunay_form: false,
    picture_of_the_house: false,
    good_moral_certificate: false,
    original_certificate_of_grades: false,
    proof_of_enrollment: false
  };
}

function normalizeRequirementMap(
  requirementSource: unknown,
  legacySource: Partial<Record<StudentRequirementKey, unknown>> = {}
): StudentRequirementMap {
  const requirementMap = emptyRequirementMap();
  const requirements =
    requirementSource && typeof requirementSource === "object"
      ? (requirementSource as Partial<Record<StudentRequirementKey, unknown>>)
      : {};

  for (const key of REQUIREMENT_KEYS) {
    requirementMap[key] = normalizeBoolean(requirements[key] ?? legacySource[key]);
  }

  return requirementMap;
}

function mergeRequirementMaps(...maps: Array<Partial<StudentRequirementMap> | undefined>) {
  const requirements = emptyRequirementMap();

  for (const map of maps) {
    for (const key of REQUIREMENT_KEYS) {
      requirements[key] = requirements[key] || map?.[key] === true;
    }
  }

  return requirements;
}

function normalizeSemesterInitialRequirementSnapshots(value: unknown) {
  if (!Array.isArray(value)) return emptyRequirementMap();

  return mergeRequirementMaps(
    ...value.map((entry) => {
      if (!entry || typeof entry !== "object") return emptyRequirementMap();
      return normalizeRequirementMap((entry as Partial<StudentSemesterRecord>).initial_payout_requirements);
    })
  );
}

function emptyRenewalRequirementMap(): StudentRenewalRequirementMap {
  return {
    liquidation: false,
    proof_of_enrollment: false,
    latest_grades: false
  };
}

function normalizeRenewalRequirementMap(
  value: unknown,
  legacySource: Partial<Record<StudentRenewalRequirementKey, unknown>> = {}
): StudentRenewalRequirementMap {
  const requirements = emptyRenewalRequirementMap();
  const source =
    value && typeof value === "object"
      ? (value as Partial<Record<StudentRenewalRequirementKey, unknown>>)
      : {};

  for (const key of RENEWAL_REQUIREMENT_KEYS) {
    requirements[key] = normalizeBoolean(source[key] ?? legacySource[key]);
  }

  return requirements;
}

function requirementMapComplete(requirements: StudentRequirementMap) {
  return REQUIREMENT_KEYS.every((key) => requirements[key]);
}

function requirementMapHasAny(requirements: StudentRequirementMap) {
  return REQUIREMENT_KEYS.some((key) => requirements[key]);
}

function renewalRequirementMapComplete(requirements: StudentRenewalRequirementMap) {
  return RENEWAL_REQUIREMENT_KEYS.every((key) => requirements[key]);
}

function normalizePayoutType(value: unknown, renewalRequirements: StudentRenewalRequirementMap) {
  if (value === "initial" || value === "renewal") return value;
  return RENEWAL_REQUIREMENT_KEYS.some((key) => renewalRequirements[key]) ? "renewal" : "initial";
}

function normalizeSemesterRecords(value: unknown, fallbackInitialRequirements: StudentRequirementMap = emptyRequirementMap()): StudentSemesterRecord[] {
  if (!Array.isArray(value)) return [];

  return value.reduce<StudentSemesterRecord[]>((records, entry) => {
    if (!entry || typeof entry !== "object") return records;
    const record = entry as Partial<StudentSemesterRecord>;
    const schoolYear = String(record.school_year ?? "").trim();
    const semNumberRaw = Number(record.sem_number ?? 0);
    const cycleKey = String(record.cycle_key ?? "").trim();

    if (!schoolYear || !Number.isFinite(semNumberRaw) || semNumberRaw <= 0 || !cycleKey) return records;
    const initialPayoutRequirements = normalizeRequirementMap(
      record.initial_payout_requirements,
      fallbackInitialRequirements
    );
    const renewalRequirements = normalizeRenewalRequirementMap(record.renewal_requirements ?? record.requirements);
    const payoutType = normalizePayoutType(record.payout_type, renewalRequirements);
    const legacyRenewalStatus =
      record.renewal_status === "renewed" || record.renewal_status === "payrolled"
        ? record.renewal_status
        : "pending";
    const payrollStatus =
      record.payroll_status === "payrolled" || legacyRenewalStatus === "payrolled"
        ? "payrolled"
        : (payoutType === "initial"
            ? requirementMapComplete(initialPayoutRequirements)
            : renewalRequirementMapComplete(renewalRequirements))
          ? "qualified"
          : "not_qualified";

    records.push({
      school_year: schoolYear,
      sem_number: semNumberRaw,
      cycle_key: cycleKey,
      payout_type: payoutType,
      payroll_status: payrollStatus,
      renewal_status: legacyRenewalStatus,
      payroll_id: String(record.payroll_id ?? "").trim(),
      payroll_record_type: String(record.payroll_record_type ?? "").trim(),
      payrolled_at: String(record.payrolled_at ?? "").trim(),
      payrolled_by_uid: String(record.payrolled_by_uid ?? "").trim(),
      payrolled_by_email: String(record.payrolled_by_email ?? "").trim(),
      initial_payout_requirements: initialPayoutRequirements,
      renewal_requirements: renewalRequirements,
      requirements: renewalRequirements,
      created_at: String(record.created_at ?? record.updated_at ?? new Date().toISOString()).trim(),
      updated_at: String(record.updated_at ?? record.created_at ?? new Date().toISOString()).trim(),
      updated_by_uid: String(record.updated_by_uid ?? "").trim(),
      updated_by_email: String(record.updated_by_email ?? "").trim(),
      notes: String(record.notes ?? "").trim()
    });
    return records;
  }, []);
}

function normalizeYearLevelHistory(value: unknown): StudentYearLevelHistoryEntry[] {
  if (!Array.isArray(value)) return [];

  return value.reduce<StudentYearLevelHistoryEntry[]>((entries, entry) => {
      if (!entry || typeof entry !== "object") return entries;
      const record = entry as Partial<StudentYearLevelHistoryEntry>;
      const changedAt = String(record.changed_at ?? "").trim();
      const toYearLevel = String(record.to_year_level ?? "").trim();

      if (!changedAt || !toYearLevel) return entries;

      entries.push({
        from_year_level: String(record.from_year_level ?? "").trim(),
        to_year_level: toYearLevel,
        changed_at: changedAt,
        changed_by_uid: String(record.changed_by_uid ?? "").trim(),
        changed_by_email: String(record.changed_by_email ?? "").trim(),
        reason: String(record.reason ?? "").trim()
      });
      return entries;
    }, []);
}

function normalizeRenewalHistory(value: unknown): StudentRenewalHistoryEntry[] {
  if (!Array.isArray(value)) return [];

  return value.reduce<StudentRenewalHistoryEntry[]>((entries, entry) => {
    if (!entry || typeof entry !== "object") return entries;
    const record = entry as Partial<StudentRenewalHistoryEntry>;
    const changedAt = String(record.changed_at ?? "").trim();
    const status = record.status === "pending" ? "pending" : record.status === "renewed" ? "renewed" : "";

    if (!changedAt || !status) return entries;

    entries.push({
      status,
      changed_at: changedAt,
      school_year: String(record.school_year ?? "").trim(),
      sem_number: Number.isFinite(Number(record.sem_number ?? 0)) ? Number(record.sem_number ?? 0) : undefined,
      cycle_key: String(record.cycle_key ?? "").trim(),
      requirements_snapshot: normalizeRequirementMap(record.requirements_snapshot),
      renewal_requirements_snapshot: normalizeRenewalRequirementMap(record.renewal_requirements_snapshot),
      changed_by_uid: String(record.changed_by_uid ?? "").trim(),
      changed_by_email: String(record.changed_by_email ?? "").trim(),
      reason: String(record.reason ?? "").trim()
    });
    return entries;
  }, []);
}

function buildYearLevelHistoryEntry({
  fromYearLevel,
  toYearLevel,
  actor,
  changedAt,
  reason = "Year level updated from student registry."
}: {
  fromYearLevel: string;
  toYearLevel: string;
  actor?: SessionUser | null;
  changedAt: string;
  reason?: string;
}): StudentYearLevelHistoryEntry {
  return {
    from_year_level: fromYearLevel,
    to_year_level: toYearLevel,
    changed_at: changedAt,
    changed_by_uid: actor?.uid || "",
    changed_by_email: actor?.email || "",
    reason
  };
}

function buildRenewalHistoryEntry({
  renewed,
  actor,
  changedAt,
  reason,
  requirementsSnapshot,
  schoolYear,
  semNumber,
  cycleKey,
  renewalRequirementsSnapshot
}: {
  renewed: boolean;
  actor?: SessionUser | null;
  changedAt: string;
  reason: string;
  requirementsSnapshot: StudentRequirementMap;
  schoolYear?: string;
  semNumber?: number;
  cycleKey?: string;
  renewalRequirementsSnapshot?: StudentRenewalRequirementMap;
}): StudentRenewalHistoryEntry {
  return {
    status: renewed ? "renewed" : "pending",
    changed_at: changedAt,
    school_year: String(schoolYear ?? "").trim(),
    sem_number: semNumber,
    cycle_key: String(cycleKey ?? "").trim(),
    requirements_snapshot: requirementsSnapshot,
    renewal_requirements_snapshot: renewalRequirementsSnapshot ?? emptyRenewalRequirementMap(),
    changed_by_uid: actor?.uid || "",
    changed_by_email: actor?.email || "",
    reason
  };
}

function canMutatePayrollState(actor?: SessionUser | null) {
  return actor?.claims.admin === true || isAdminRole(actor?.claims.role);
}

function isRequirementsOnlyUpdate(input: StudentInput) {
  const allowedFields = new Set<keyof StudentInput>(["requirements", "semester_records", "payrolled", "payrolled_at"]);
  return Object.keys(input).every((key) => allowedFields.has(key as keyof StudentInput));
}

function preservePayrollFieldsForEncoder(input: StudentInput, existing: Student): StudentInput {
  const sanitized: StudentInput = { ...input };
  delete sanitized.renewed;
  delete sanitized.renewed_at;

  if (hasStudentPayrollRecord(existing)) {
    sanitized.payrolled = existing.payrolled;
    sanitized.payrolled_at = existing.payrolled_at;
  }

  if (Array.isArray(input.semester_records)) {
    const existingByCycle = new Map(
      normalizeSemesterRecords(existing.semester_records, existing.requirements).map((record) => [record.cycle_key, record])
    );

    sanitized.semester_records = input.semester_records.map((record) => {
      const existingRecord = existingByCycle.get(record.cycle_key);
      if (!existingRecord) {
        const { payroll_id, payroll_record_type, payrolled_at, payrolled_by_uid, payrolled_by_email, ...nextRecord } = record;
        return {
          ...nextRecord,
          payroll_status: record.payroll_status === "payrolled" ? "not_qualified" : record.payroll_status,
          renewal_status: record.renewal_status === "payrolled" ? "pending" : record.renewal_status
        };
      }

      return {
        ...record,
        payroll_status: existingRecord.payroll_status,
        renewal_status: existingRecord.renewal_status,
        payroll_id: existingRecord.payroll_id,
        payroll_record_type: existingRecord.payroll_record_type,
        payrolled_at: existingRecord.payrolled_at,
        payrolled_by_uid: existingRecord.payrolled_by_uid,
        payrolled_by_email: existingRecord.payrolled_by_email
      };
    });
  }

  return sanitized;
}

export function normalizeStudentRecord(
  input: StudentInput = {},
  overrides: Partial<Student> = {}
): Student {
  const renewalHistorySource = overrides.renewal_history ?? input.renewal_history;
  const renewalHistory = normalizeRenewalHistory(renewalHistorySource);
  const renewed = normalizeBoolean(overrides.renewed ?? input.renewed);
  const renewedAt = String(overrides.renewed_at ?? input.renewed_at ?? "").trim();
  const explicitRequirements = normalizeRequirementMap(overrides.requirements ?? input.requirements, {
    certificate_of_residency: overrides.certificate_of_residency ?? input.certificate_of_residency,
    pagpapatunay_form: overrides.pagpapatunay_form ?? input.pagpapatunay_form,
    picture_of_the_house: overrides.picture_of_the_house ?? input.picture_of_the_house,
    good_moral_certificate: overrides.good_moral_certificate ?? input.good_moral_certificate,
    original_certificate_of_grades: overrides.original_certificate_of_grades ?? input.original_certificate_of_grades,
    proof_of_enrollment: overrides.proof_of_enrollment ?? input.proof_of_enrollment
  });
  const requirements = requirementMapHasAny(explicitRequirements)
    ? explicitRequirements
    : normalizeSemesterInitialRequirementSnapshots(overrides.semester_records ?? input.semester_records);

  return {
    student_id: String(overrides.student_id ?? input.student_id ?? "").trim(),
    full_name: String(overrides.full_name ?? input.full_name ?? "").trim(),
    student_number: String(overrides.student_number ?? input.student_number ?? "").trim(),
    barangay: String(overrides.barangay ?? input.barangay ?? "").trim(),
    address: String(overrides.address ?? input.address ?? "").trim(),
    school_address: String(overrides.school_address ?? input.school_address ?? "").trim(),
    phone_number: String(overrides.phone_number ?? input.phone_number ?? "").trim(),
    school_course: String(overrides.school_course ?? input.school_course ?? "").trim(),
    year_level: String(overrides.year_level ?? input.year_level ?? "").trim(),
    year_level_history: normalizeYearLevelHistory(overrides.year_level_history ?? input.year_level_history),
    batch: String(overrides.batch ?? input.batch ?? "").trim(),
    requirements,
    semester_records: normalizeSemesterRecords(overrides.semester_records ?? input.semester_records, requirements),
    certificate_of_residency: requirements.certificate_of_residency,
    pagpapatunay_form: requirements.pagpapatunay_form,
    picture_of_the_house: requirements.picture_of_the_house,
    good_moral_certificate: requirements.good_moral_certificate,
    original_certificate_of_grades: requirements.original_certificate_of_grades,
    proof_of_enrollment: requirements.proof_of_enrollment,
    claimed: normalizeBoolean(overrides.claimed ?? input.claimed),
    renewed,
    payrolled: normalizeBoolean(overrides.payrolled ?? input.payrolled),
    claimed_at: String(overrides.claimed_at ?? input.claimed_at ?? "").trim(),
    renewed_at: renewedAt,
    renewal_history: renewalHistory.length
      ? renewalHistory
      : renewed
        ? [
            {
              status: "renewed",
              changed_at: renewedAt || String(overrides.created_at ?? input.created_at ?? new Date().toISOString()).trim(),
              school_year: "",
              sem_number: undefined,
              cycle_key: "",
              requirements_snapshot: requirements,
              renewal_requirements_snapshot: emptyRenewalRequirementMap(),
              changed_by_uid: "",
              changed_by_email: "",
              reason: "Legacy renewed state inferred from the student record."
            }
          ]
        : [],
    payrolled_at: String(overrides.payrolled_at ?? input.payrolled_at ?? "").trim(),
    migration_source: String(overrides.migration_source ?? input.migration_source ?? "").trim(),
    migration_source_sheet: String(overrides.migration_source_sheet ?? input.migration_source_sheet ?? "").trim(),
    migration_source_row: String(overrides.migration_source_row ?? input.migration_source_row ?? "").trim(),
    migration_source_no: String(overrides.migration_source_no ?? input.migration_source_no ?? "").trim(),
    migration_source_key: String(overrides.migration_source_key ?? input.migration_source_key ?? "").trim(),
    migration_group: String(overrides.migration_group ?? input.migration_group ?? "").trim(),
    created_at: String(overrides.created_at ?? input.created_at ?? new Date().toISOString()).trim(),
    deleted_at: String(overrides.deleted_at ?? input.deleted_at ?? "").trim()
  };
}

export async function listStudents() {
  const snapshot = await db.collection(COLLECTIONS.students).get();
  return snapshot.docs.map((docSnap) => normalizeStudentRecord(docSnap.data() as Student, { student_id: docSnap.id }));
}

export async function getStudentStats(cycle?: Pick<CurrentCycleConfig, "cycle_key" | "school_year" | "sem_number">) {
  const snapshot = await db.collection(COLLECTIONS.students).get();
  const students = snapshot.docs.map((docSnap) =>
    normalizeStudentRecord(docSnap.data() as Student, { student_id: docSnap.id })
  );

  return {
    total: students.length,
    claimed: students.filter((student) => student.claimed).length,
    payrollCandidates: cycle
      ? students.filter((student) => isQualifiedForPayroll(student, cycle)).length
      : 0
  };
}

function normalizedPageLimit(value: unknown) {
  const limit = Number(value || DEFAULT_STUDENT_PAGE_SIZE);
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_STUDENT_PAGE_SIZE;
  return Math.min(Math.floor(limit), MAX_STUDENT_PAGE_SIZE);
}

function normalizedFilterValue(value?: string) {
  return String(value || "").trim().toLocaleLowerCase();
}

function isPayrolledForCycle(
  student: Student,
  cycle?: Pick<CurrentCycleConfig, "cycle_key" | "school_year" | "sem_number">
) {
  return cycle?.cycle_key ? isStudentPayrolledForCycle(student, cycle) : false;
}

function isInitialPayoutQualified(student: Student) {
  return isStudentInitialPayoutQualified(student);
}

function isQualifiedForPayroll(
  student: Student,
  cycle?: Pick<CurrentCycleConfig, "cycle_key" | "school_year" | "sem_number">
) {
  return cycle?.cycle_key ? isStudentQualifiedForPayrollCycle(student, cycle) : isInitialPayoutQualified(student);
}

function matchesStudentFilters(student: Student, filters: StudentPageFilters) {
  const query = normalizedFilterValue(filters.query);
  const school = normalizedFilterValue(filters.school);
  const barangay = normalizedFilterValue(filters.barangay);

  if (query) {
    const haystack = [student.full_name, student.student_id, student.student_number]
      .join(" ")
      .toLocaleLowerCase();
    if (!haystack.includes(query)) return false;
  }

  if (school && !String(student.school_address || "").toLocaleLowerCase().includes(school)) return false;
  if (barangay && !String(student.barangay || "").toLocaleLowerCase().includes(barangay)) return false;
  if (filters.batch && filters.batch !== "all" && student.batch !== filters.batch) return false;

  if (filters.requirementsTab === "renewal" && !isStudentForRenewal(student)) return false;
  if (filters.requirementsTab === "not-renewal" && isStudentForRenewal(student)) return false;

  if (filters.payrollTab) {
    const payoutType = filters.payrollTab === "renewal" ? "renewal" : "initial";
    if (!filters.cycle?.cycle_key) return false;
    if (getStudentCyclePayoutType(student, filters.cycle) !== payoutType) return false;
  }

  switch (filters.status) {
    case "complete":
      return isInitialPayoutQualified(student);
    case "incomplete":
      return !isInitialPayoutQualified(student);
    case "payrolled":
      return isPayrolledForCycle(student, filters.cycle);
    case "unpayrolled":
      return !isPayrolledForCycle(student, filters.cycle);
    case "renewed":
    case "qualified":
      return isQualifiedForPayroll(student, filters.cycle) || isPayrolledForCycle(student, filters.cycle);
    case "unrenewed":
    case "not_qualified":
      return !isQualifiedForPayroll(student, filters.cycle) && !isPayrolledForCycle(student, filters.cycle);
    case "payroll_candidates":
      return isQualifiedForPayroll(student, filters.cycle);
    case "all":
    case "":
    case undefined:
      return true;
    default:
      return true;
  }
}

function hasStudentPageFilters(filters?: StudentPageFilters) {
  if (!filters) return false;
  return Boolean(
    filters.query ||
      filters.school ||
      filters.barangay ||
      (filters.batch && filters.batch !== "all") ||
      (filters.status && filters.status !== "all") ||
      filters.requirementsTab ||
      filters.payrollTab
  );
}

export async function listStudentsPage({
  cursor,
  limit,
  filters
}: {
  cursor?: string | null;
  limit?: number;
  filters?: StudentPageFilters;
} = {}) {
  const pageLimit = normalizedPageLimit(limit);

  if (hasStudentPageFilters(filters)) {
    const snapshot = await db.collection(COLLECTIONS.students).get();
    const students = snapshot.docs
      .map((docSnap) => normalizeStudentRecord(docSnap.data() as Student, { student_id: docSnap.id }))
      .filter((student) => matchesStudentFilters(student, filters || {}))
      .sort((left, right) =>
        left.student_id.localeCompare(right.student_id, undefined, { numeric: true, sensitivity: "base" })
      );
    const startIndex = cursor
      ? Math.max(students.findIndex((student) => student.student_id === cursor) + 1, 0)
      : 0;
    const pageStudents = students.slice(startIndex, startIndex + pageLimit);
    const nextCursor =
      startIndex + pageStudents.length < students.length
        ? pageStudents[pageStudents.length - 1]?.student_id ?? null
        : null;

    return {
      students: pageStudents,
      nextCursor,
      hasMore: Boolean(nextCursor),
      limit: pageLimit,
      total: students.length
    };
  }

  const totalSnapshot = await db.collection(COLLECTIONS.students).count().get();
  const total = totalSnapshot.data().count;

  let query: Query = db
    .collection(COLLECTIONS.students)
    .orderBy(FieldPath.documentId())
    .limit(pageLimit + 1);

  if (cursor) {
    query = query.startAfter(cursor);
  }

  const snapshot = await query.get();
  const pageDocs = snapshot.docs.slice(0, pageLimit);
  const students = pageDocs.map((docSnap) =>
    normalizeStudentRecord(docSnap.data() as Student, { student_id: docSnap.id })
  );
  const lastDocument = pageDocs[pageDocs.length - 1];

  return {
    students,
    nextCursor: snapshot.size > pageLimit && lastDocument ? lastDocument.id : null,
    hasMore: snapshot.size > pageLimit,
    limit: pageLimit,
    total
  };
}

export async function listTrash() {
  const snapshot = await db.collection(COLLECTIONS.trash).get();
  return snapshot.docs.map((docSnap) => normalizeStudentRecord(docSnap.data() as Student, { student_id: docSnap.id }));
}

export async function nextStudentId() {
  const snapshot = await db
    .collection(COLLECTIONS.students)
    .orderBy("student_id", "desc")
    .limit(1)
    .get();

  const currentId = snapshot.docs[0]?.data()?.student_id;
  const numeric = Number.parseInt(String(currentId ?? "").replace(/^STU/i, ""), 10);
  const next = Number.isFinite(numeric) ? numeric + 1 : 1;
  return `STU${String(next).padStart(3, "0")}`;
}

export async function createStudent(input: StudentInput, actor?: SessionUser | null) {
  const sanitizedInput = canMutatePayrollState(actor)
    ? input
    : preservePayrollFieldsForEncoder(input, normalizeStudentRecord({}));
  const studentId = String(sanitizedInput.student_id ?? "").trim() || await nextStudentId();
  const createdAt = sanitizedInput.created_at || new Date().toISOString();
  const yearLevel = String(sanitizedInput.year_level ?? "").trim();
  const initialRequirementSnapshot = normalizeRequirementMap(sanitizedInput.requirements, {
    certificate_of_residency: sanitizedInput.certificate_of_residency,
    pagpapatunay_form: sanitizedInput.pagpapatunay_form,
    picture_of_the_house: sanitizedInput.picture_of_the_house,
    good_moral_certificate: sanitizedInput.good_moral_certificate,
    original_certificate_of_grades: sanitizedInput.original_certificate_of_grades,
    proof_of_enrollment: sanitizedInput.proof_of_enrollment
  });
  const student = normalizeStudentRecord(sanitizedInput, {
    student_id: studentId,
    created_at: createdAt,
    year_level_history: yearLevel
      ? [
          buildYearLevelHistoryEntry({
            fromYearLevel: "",
            toYearLevel: yearLevel,
            actor,
            changedAt: createdAt,
            reason: "Initial year level recorded when the student was created."
          })
        ]
      : [],
    renewal_history: sanitizedInput.renewed
      ? [
          buildRenewalHistoryEntry({
            renewed: true,
            actor,
            changedAt: createdAt,
            reason: "Initial renewal state recorded when the student was created.",
            requirementsSnapshot: initialRequirementSnapshot
          })
        ]
      : [],
    deleted_at: ""
  });

  await db.collection(COLLECTIONS.students).doc(studentId).set(student);
  return student;
}

export async function updateStudent(studentId: string, input: StudentInput, actor?: SessionUser | null) {
  const studentRef = db.collection(COLLECTIONS.students).doc(studentId);
  let updatedStudent: Student | undefined;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(studentRef);
    if (!snapshot.exists) {
      throw new HttpError(404, "Student record not found.");
    }

    const existing = normalizeStudentRecord(snapshot.data() as Student, { student_id: studentId });
    const canManageStudent = canMutatePayrollState(actor);
    if (!canManageStudent && !isRequirementsOnlyUpdate(input)) {
      throw new HttpError(403, "This action requires the admin role.");
    }

    const sanitizedInput = canManageStudent ? input : preservePayrollFieldsForEncoder(input, existing);
    const nextStudent = normalizeStudentRecord({ ...existing, ...sanitizedInput }, {
      student_id: studentId,
      created_at: existing.created_at || sanitizedInput.created_at || new Date().toISOString(),
      deleted_at: ""
    });

    const previousYearLevel = String(existing.year_level || "").trim();
    const nextYearLevel = String(nextStudent.year_level || "").trim();

    if (previousYearLevel !== nextYearLevel) {
      nextStudent.year_level_history = [
        ...normalizeYearLevelHistory(existing.year_level_history),
        buildYearLevelHistoryEntry({
          fromYearLevel: previousYearLevel,
          toYearLevel: nextYearLevel,
          actor,
          changedAt: new Date().toISOString()
        })
      ];
    }

    if (Object.prototype.hasOwnProperty.call(sanitizedInput, "renewed") && existing.renewed !== nextStudent.renewed) {
      const latestSemesterRecord = normalizeSemesterRecords(sanitizedInput.semester_records ?? nextStudent.semester_records, nextStudent.requirements)
        .slice()
        .sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")))[0];

      nextStudent.renewal_history = [
        ...normalizeRenewalHistory(existing.renewal_history),
        buildRenewalHistoryEntry({
          renewed: Boolean(nextStudent.renewed),
          actor,
          changedAt: new Date().toISOString(),
          schoolYear: latestSemesterRecord?.school_year,
          semNumber: latestSemesterRecord?.sem_number,
          cycleKey: latestSemesterRecord?.cycle_key,
          reason: nextStudent.renewed
            ? "Student was marked renewed. Renewal count is informational and not limit-enforced."
            : "Student was moved back to pending renewal.",
          requirementsSnapshot: nextStudent.requirements || emptyRequirementMap(),
          renewalRequirementsSnapshot: latestSemesterRecord?.renewal_requirements || latestSemesterRecord?.requirements || emptyRenewalRequirementMap()
        })
      ];
    }

    transaction.set(studentRef, nextStudent);
    updatedStudent = nextStudent;
  });

  if (!updatedStudent) {
    throw new HttpError(500, "Student update did not complete.");
  }

  return updatedStudent;
}

export async function moveStudentToTrash(studentId: string) {
  const studentRef = db.collection(COLLECTIONS.students).doc(studentId);
  const trashRef = db.collection(COLLECTIONS.trash).doc(studentId);

  let movedStudent: Student | null = null;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(studentRef);
    if (!snapshot.exists) {
      throw new HttpError(404, "Student record not found.");
    }

    movedStudent = normalizeStudentRecord(snapshot.data() as Student, {
      student_id: studentId,
      deleted_at: new Date().toISOString()
    });
    transaction.set(trashRef, movedStudent);
    transaction.delete(studentRef);
  });

  return movedStudent;
}

export async function restoreStudent(studentId: string) {
  const studentRef = db.collection(COLLECTIONS.students).doc(studentId);
  const trashRef = db.collection(COLLECTIONS.trash).doc(studentId);

  let restoredStudent: Student | null = null;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(trashRef);
    if (!snapshot.exists) {
      throw new HttpError(404, "Trash record not found.");
    }

    restoredStudent = normalizeStudentRecord(snapshot.data() as Student, {
      student_id: studentId,
      deleted_at: ""
    });
    transaction.set(studentRef, restoredStudent);
    transaction.delete(trashRef);
  });

  return restoredStudent;
}

export async function deleteTrashStudent(studentId: string) {
  await db.collection(COLLECTIONS.trash).doc(studentId).delete();
  return { studentId, deleted: true };
}
