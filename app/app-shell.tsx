"use client";

import {
  ClipboardList,
  ListChecks,
  FileDown,
  LayoutDashboard,
  LogOut,
  Menu,
  RotateCcw,
  ShieldUser,
  SlidersHorizontal,
  Trash2,
  UserRound,
  UserRoundPlus,
  X
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { updateEmail, updatePassword, updateProfile } from "firebase/auth";
import { useAuth } from "./auth-provider";
import { firebaseAuth } from "./lib/firebase-client";
import {
  buildStudentTimelineDebugRows,
  getStudentCyclePayrollStatus,
  getStudentCyclePayoutType,
  getStudentInitialPayoutRequirements,
  getStudentSemesterRecordForCycle,
  hasPermanentPayroll,
  hasStudentPayrollRecord,
  isStudentForRenewal,
  isStudentInitialPayoutQualified,
  isStudentPayrolledForCycle,
  isStudentPayrollCandidateForCycle,
  isStudentQualifiedForPayrollCycle,
  studentPayrollQualificationLabel
} from "./lib/models/student";
import { APP_VIEWS, isAdminOnlyView, labelForView, routeForView, type AppViewName } from "./lib/shared/views";
import {
  createManagedUser,
  createStudent,
  deleteManagedUser,
  deleteOption,
  deleteTrashStudent,
  getCurrentCycleConfig,
  getOptions,
  getStudentPage,
  getTrash,
  listManagedUsers,
  moveStudentToTrash,
  restoreStudent,
  saveCurrentCycleConfig,
  saveOption,
  saveOperationLog,
  savePayoutRecord,
  updateManagedUser,
  updateStudent,
  type AppInitialData,
  type OperationLog,
  type PayoutRecord,
  type Student
} from "./lib/student-store";
import { cycleKeyFor, type CurrentCycleConfig } from "./lib/shared/current-cycle";
import type { OptionRecord } from "./lib/shared/options";
import type { OperationLogInput } from "./lib/shared/operation-log";
import type { PayrollExportMetadata } from "./lib/payroll-export";
import {
  REQUIREMENT_KEYS,
  REQUIREMENT_LABELS,
  RENEWAL_REQUIREMENT_KEYS,
  RENEWAL_REQUIREMENT_LABELS,
  type StudentRequirementKey,
  type StudentRequirementMap,
  type StudentRenewalRequirementKey,
  type StudentRenewalRequirementMap,
  type StudentSemesterRecord
} from "./lib/shared/student";

type OptionCollectionName = "barangays" | "schools" | "courses" | "batches";

type OptionBuckets = {
  barangays: OptionRecord[];
  schools: OptionRecord[];
  courses: OptionRecord[];
  batches: OptionRecord[];
};

type ManagedUser = {
  uid: string;
  email: string;
  displayName: string;
  disabled: boolean;
  role: string | null;
};

type StudentDraft = {
  student_id: string;
  full_name: string;
  student_number: string;
  barangay: string;
  address: string;
  school_address: string;
  phone_number: string;
  school_course: string;
  year_level: string;
  batch: string;
  for_renewal: boolean;
  requirements: StudentRequirementMap;
};

type ManagedUserDraft = {
  uid: string;
  email: string;
  password: string;
  displayName: string;
  role: string;
};

type ProfileDraft = {
  displayName: string;
  email: string;
  newPassword: string;
  confirmPassword: string;
};

type CurrentCycleDraft = {
  school_year: string;
  sem_number: string;
  status: CurrentCycleConfig["status"];
};

type RenewalRecordDraft = {
  payout_type: StudentSemesterRecord["payout_type"];
  for_renewal: boolean;
  initial_payout_requirements: StudentRequirementMap;
  renewal_requirements: StudentRenewalRequirementMap;
  notes: string;
};

type PayrollMetadataDraft = PayrollExportMetadata;
type RequirementsTab = "not-renewal" | "renewal";
type PayrollTab = "new" | "renewal";
type StudentLoadState = "idle" | "loading" | "loading-more" | "ready" | "error";
type ConfirmationRequest = {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (confirmed: boolean) => void;
};

type ValidationDialogRequest = {
  title: string;
  message: string;
  fields: string[];
  acknowledgeLabel?: string;
};

const adminRecordStatusFilters = new Set(["renewed", "unrenewed", "payrolled", "unpayrolled"]);
const lazyStudentViews = new Set<AppViewName>(["register", "requirements", "records"]);
const studentBackedViews = new Set<AppViewName>(["dashboard", "register", "requirements", "records", "payrolls"]);
const studentPageSize = 75;
const dataTableEstimatedRowSize = 64;

type PersistedShellState = {
  version: 3;
  catalogCollection: OptionCollectionName;
  catalogDraftName: string;
  catalogEditId: string | null;
  studentDraft: StudentDraft;
  studentEditId: string | null;
  managedUserDraft: ManagedUserDraft;
  managedUserEditId: string | null;
  currentCycleDraft: CurrentCycleDraft;
  renewalRecordStudentId: string;
  renewalRecordCycle: CurrentCycleConfig | null;
  renewalRecordDraft: RenewalRecordDraft;
  requirementsSchoolYear: string;
  requirementsSemester: string;
  requirementsTab: RequirementsTab;
  requirementsNameFilter: string;
  requirementsSchoolFilter: string;
  requirementsBarangayFilter: string;
  requirementsBatchFilter: string;
  selectedPayrollIds: string[];
  payrollTab: PayrollTab;
  payrollSchoolYear: string;
  payrollSemester: string;
  payrollNameFilter: string;
  payrollSchoolFilter: string;
  payrollBarangayFilter: string;
  payrollStatusFilter: string;
  payrollBatchFilter: string;
  payrollMetadataDraft: PayrollMetadataDraft;
  payrollHistoryStudentId: string;
  payrollHistoryQuery: string;
  payrollHistorySchoolFilter: string;
  payrollHistoryBarangayFilter: string;
  payrollHistoryBatchFilter: string;
  search: string;
  studentSchoolFilter: string;
  studentBarangayFilter: string;
  statusFilter: string;
  batchFilter: string;
};

const navIcons: Record<AppViewName, React.ComponentType<{ size?: number }>> = {
  dashboard: LayoutDashboard,
  catalogs: SlidersHorizontal,
  register: UserRoundPlus,
  requirements: ListChecks,
  records: ClipboardList,
  profiles: UserRound,
  users: ShieldUser,
  payrolls: FileDown,
  trash: Trash2
};

const requirementFields = REQUIREMENT_KEYS;
const renewalRequirementFields = RENEWAL_REQUIREMENT_KEYS;

const catalogDefinitions: Array<{ collection: OptionCollectionName; label: string; singular: string }> = [
  { collection: "barangays", label: "Barangays", singular: "barangay" },
  { collection: "schools", label: "Schools", singular: "school" },
  { collection: "courses", label: "Courses", singular: "course" },
  { collection: "batches", label: "Batches", singular: "batch" }
];

const requiredStudentFieldLabels: Array<[keyof StudentDraft, string]> = [
  ["full_name", "Full Name"],
  ["student_number", "Student Number"],
  ["barangay", "Barangay"],
  ["address", "Address"],
  ["school_address", "School"],
  ["school_course", "Course"],
  ["year_level", "Year Level"],
  ["batch", "Batch"],
  ["phone_number", "Phone"]
];

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

function emptyRenewalRequirementMap(): StudentRenewalRequirementMap {
  return {
    liquidation: false,
    proof_of_enrollment: false,
    latest_grades: false
  };
}

function requirementMapFromLegacySource(value: unknown): StudentRequirementMap {
  const source = value && typeof value === "object" ? (value as Partial<Record<StudentRequirementKey, unknown>>) : {};
  const requirements = emptyRequirementMap();

  for (const field of requirementFields) {
    requirements[field] = source[field] === true;
  }

  return requirements;
}

function mergeRequirementMaps(...maps: Array<Partial<StudentRequirementMap> | undefined>) {
  const requirements = emptyRequirementMap();

  for (const map of maps) {
    for (const field of requirementFields) {
      requirements[field] = requirements[field] || map?.[field] === true;
    }
  }

  return requirements;
}

function initialRequirementsFromSemesterSnapshots(records: unknown) {
  if (!Array.isArray(records)) return emptyRequirementMap();

  return mergeRequirementMaps(
    ...records.map((record) => {
      if (!record || typeof record !== "object") return emptyRequirementMap();
      return requirementMapFromLegacySource((record as Partial<StudentSemesterRecord>).initial_payout_requirements);
    })
  );
}

function renewalRequirementMapFromAny(value: unknown): StudentRenewalRequirementMap {
  const source =
    value && typeof value === "object"
      ? (value as Partial<Record<StudentRenewalRequirementKey, unknown>>)
      : {};
  const requirements = emptyRenewalRequirementMap();

  for (const field of renewalRequirementFields) {
    requirements[field] = source[field] === true;
  }

  return requirements;
}

function emptyStudentDraft(): StudentDraft {
  return {
    student_id: "",
    full_name: "",
    student_number: "",
    barangay: "",
    address: "",
    school_address: "",
    phone_number: "",
    school_course: "",
    year_level: "",
    batch: "",
    for_renewal: false,
    requirements: emptyRequirementMap()
  };
}

function emptyManagedUserDraft(): ManagedUserDraft {
  return {
    uid: "",
    email: "",
    password: "",
    displayName: "",
    role: "encoder"
  };
}

function profileDraftFromUser(user: { name?: string; email?: string } | null | undefined): ProfileDraft {
  return {
    displayName: String(user?.name ?? "").trim(),
    email: String(user?.email ?? "").trim(),
    newPassword: "",
    confirmPassword: ""
  };
}

function currentCycleDraftFromConfig(config: CurrentCycleConfig): CurrentCycleDraft {
  return {
    school_year: config.school_year,
    sem_number: String(config.sem_number),
    status: config.status
  };
}

function cycleConfigFromParts(schoolYear: string, semNumber: number): CurrentCycleConfig {
  return {
    school_year: schoolYear,
    sem_number: semNumber,
    cycle_key: cycleKeyFor(schoolYear, semNumber),
    status: "open",
    updated_at: "",
    updated_by: ""
  };
}

function schoolYearStart(schoolYear: string) {
  const match = schoolYear.match(/\d{4}/);
  return match ? Number(match[0]) : new Date().getFullYear();
}

function schoolYearLabelFromStart(startYear: number) {
  return `${startYear}-${startYear + 1}`;
}

function generateSchoolYearOptions(anchorSchoolYear: string) {
  const anchor = schoolYearStart(anchorSchoolYear);
  const firstYear = anchor - 1;
  return Array.from({ length: 10 }, (_, index) => schoolYearLabelFromStart(firstYear + index));
}

function emptyRenewalRecordDraft(): RenewalRecordDraft {
  return {
    payout_type: "initial",
    for_renewal: false,
    initial_payout_requirements: emptyRequirementMap(),
    renewal_requirements: emptyRenewalRequirementMap(),
    notes: ""
  };
}

function emptyPayrollMetadataDraft(): PayrollMetadataDraft {
  return {
    date_of_filing: "",
    school_year: "",
    sem_number: ""
  };
}

function isAdminUser(
  user:
    | {
        role?: string;
        claims?: { admin?: boolean; role?: string | null };
      }
    | null
    | undefined
) {
  return user?.claims?.admin === true || user?.claims?.role === "admin" || user?.role === "admin";
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "SJ"
  );
}

function missingStudentFields(draft: StudentDraft) {
  return requiredStudentFieldLabels
    .filter(([field]) => String(draft[field] ?? "").trim().length === 0)
    .map(([, label]) => label);
}

function invalidCurrentCycleFields(draft: CurrentCycleDraft) {
  const fields: string[] = [];
  if (!draft.school_year.trim()) fields.push("School Year");

  const semNumber = Number(draft.sem_number);
  if (!draft.sem_number.trim() || !Number.isFinite(semNumber) || semNumber <= 0) {
    fields.push("Semester Number");
  }

  return fields;
}

function invalidManagedUserFields(draft: ManagedUserDraft, isEditing: boolean) {
  const fields: string[] = [];
  const email = draft.email.trim();
  const password = draft.password.trim();
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!email) fields.push("Email");
  else if (!emailLooksValid) fields.push("Valid Email");

  if (!isEditing && !password) fields.push("Password");
  if (!draft.role.trim()) fields.push("Role");

  return fields;
}

function invalidProfileFields(draft: ProfileDraft) {
  const fields: string[] = [];
  const email = draft.email.trim();
  const password = draft.newPassword;

  if (!draft.displayName.trim()) fields.push("Name");
  if (!email || !email.includes("@")) fields.push("Email");
  if (password && password.length < 6) fields.push("Password must be at least 6 characters");
  if (password !== draft.confirmPassword) fields.push("Password confirmation");

  return fields;
}

function profileUpdateErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return error instanceof Error ? error.message : "Unable to update profile.";
  }

  const code = (error as { code?: string }).code;
  if (code === "auth/requires-recent-login") {
    return "For security, sign out and sign back in before changing your email or password.";
  }
  if (code === "auth/email-already-in-use") return "That email address is already used by another account.";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/weak-password") return "Choose a stronger password.";
  if (code === "auth/network-request-failed") return "Firebase Auth could not be reached. Check your connection and try again.";

  return error instanceof Error ? error.message : "Unable to update profile.";
}

function getStudentRequirements(
  student: Pick<Student, "requirements"> & Partial<Pick<Student, "semester_records">> & Partial<Record<StudentRequirementKey, boolean>>
) {
  const globalRequirements = mergeRequirementMaps(
    requirementMapFromLegacySource(student.requirements),
    Object.fromEntries(requirementFields.map((field) => [field, student[field] === true])) as StudentRequirementMap
  );
  return hasAnyInitialRequirement(globalRequirements)
    ? globalRequirements
    : initialRequirementsFromSemesterSnapshots(student.semester_records);
}

function getSemesterRecords(student: Student) {
  return Array.isArray(student.semester_records) ? student.semester_records : [];
}

function getSemesterRecordForCycle(student: Student, currentCycle: CurrentCycleConfig) {
  return getStudentSemesterRecordForCycle(student, currentCycle);
}

function getInitialPayoutRequirements(student: Student) {
  return getStudentInitialPayoutRequirements(student);
}

function getSemesterRenewalRequirements(record: StudentSemesterRecord | null) {
  return renewalRequirementMapFromAny(record?.renewal_requirements ?? record?.requirements);
}

function hasInitialPayroll(student: Student) {
  return hasPermanentPayroll(student);
}

function hasLockedPayrollHistory(student: Student) {
  return hasStudentPayrollRecord(student);
}

function isForRenewalStudent(student: Student) {
  return isStudentForRenewal(student);
}

function isForRenewalDraft(student: Student, draft: RenewalRecordDraft) {
  return hasLockedPayrollHistory(student) || draft.for_renewal;
}

function getSemesterPayoutType(student: Student, record: StudentSemesterRecord | null): StudentSemesterRecord["payout_type"] {
  if (record?.payout_type === "initial" || record?.payout_type === "renewal") return record.payout_type;
  return isForRenewalStudent(student) ? "renewal" : "initial";
}

function getSemesterPayrollStatus(student: Student, cycle: CurrentCycleConfig): StudentSemesterRecord["payroll_status"] {
  return getStudentCyclePayrollStatus(student, cycle);
}

function isInitialPayoutQualified(student: Student) {
  return isStudentInitialPayoutQualified(student);
}

function isRenewalPayoutQualified(record: StudentSemesterRecord | null) {
  return renewalRequirementCompletionCount(getSemesterRenewalRequirements(record)) === renewalRequirementFields.length;
}

function isQualifiedForPayroll(student: Student, cycle: CurrentCycleConfig) {
  return isStudentQualifiedForPayrollCycle(student, cycle);
}

function isPayrollCandidateForCycle(student: Student, cycle: CurrentCycleConfig) {
  return isStudentPayrollCandidateForCycle(student, cycle);
}

function isPayoutTypeForCycle(student: Student, cycle: CurrentCycleConfig, payoutType: StudentSemesterRecord["payout_type"]) {
  return getStudentCyclePayoutType(student, cycle) === payoutType;
}

function payoutRecordTypeForCycle(student: Student, cycle: CurrentCycleConfig) {
  return getStudentCyclePayoutType(student, cycle) === "renewal" ? "renewal_payroll" : "initial_payout_payroll";
}

function payoutTypeLabelForCycle(student: Student, cycle: CurrentCycleConfig) {
  return getStudentCyclePayoutType(student, cycle) === "renewal" ? "Renewal" : "Initial payout";
}

function getSemesterPayrollStatusFromRecord(record: StudentSemesterRecord | null): StudentSemesterRecord["payroll_status"] {
  if (record?.payroll_status === "payrolled") return "payrolled";
  if (record?.renewal_status === "payrolled") return "payrolled";
  return "not_qualified";
}

function qualificationLabel(student: Student, cycle: CurrentCycleConfig) {
  return studentPayrollQualificationLabel(student, cycle);
}

function payrollStatusForDraft(student: Student, existingRecord: StudentSemesterRecord | null, draft: RenewalRecordDraft) {
  if (getSemesterPayrollStatusFromRecord(existingRecord) === "payrolled") return "payrolled";
  const initialComplete = requirementCompletionCount(draft.initial_payout_requirements) === requirementFields.length;
  const renewalComplete = renewalRequirementCompletionCount(draft.renewal_requirements) === renewalRequirementFields.length;
  return draft.payout_type === "renewal"
    ? isForRenewalDraft(student, draft) && renewalComplete
      ? "qualified"
      : "not_qualified"
    : initialComplete
      ? "qualified"
      : "not_qualified";
}

function qualificationLabelForDraft(student: Student, existingRecord: StudentSemesterRecord | null, draft: RenewalRecordDraft) {
  const status = payrollStatusForDraft(student, existingRecord, draft);
  if (status === "payrolled") return "payrolled";
  if (draft.payout_type === "renewal") {
    if (!isForRenewalDraft(student, draft)) return "needs initial payroll";
    return status === "qualified" ? "renewal qualified" : "missing renewal requirements";
  }
  return status === "qualified" ? "initial payout qualified" : "missing initial requirements";
}

function legacyRenewalStatusForPayrollStatus(
  student: Student,
  payrollStatus: StudentSemesterRecord["payroll_status"],
  forRenewal = isForRenewalStudent(student)
): NonNullable<StudentSemesterRecord["renewal_status"]> {
  if (payrollStatus === "payrolled") return "payrolled";
  if (payrollStatus === "qualified" && forRenewal) return "renewed";
  return "pending";
}

function buildSemesterRecordForCycle(
  student: Student,
  currentCycle: CurrentCycleConfig,
  draft: RenewalRecordDraft,
  actor: { uid?: string; email?: string } | null
) {
  const existingRecord = getSemesterRecordForCycle(student, currentCycle);
  const now = new Date().toISOString();
  const payrollStatus = payrollStatusForDraft(student, existingRecord, draft);

  return {
    school_year: currentCycle.school_year,
    sem_number: currentCycle.sem_number,
    cycle_key: currentCycle.cycle_key,
    payout_type: draft.payout_type,
    payroll_status: payrollStatus,
    renewal_status: legacyRenewalStatusForPayrollStatus(student, payrollStatus, isForRenewalDraft(student, draft)),
    initial_payout_requirements: draft.initial_payout_requirements,
    renewal_requirements: draft.renewal_requirements,
    requirements: draft.renewal_requirements,
    created_at: existingRecord?.created_at || now,
    updated_at: now,
    updated_by_uid: actor?.uid || "",
    updated_by_email: actor?.email || "",
    notes: draft.notes.trim()
  } satisfies StudentSemesterRecord;
}

function replaceSemesterRecord(records: StudentSemesterRecord[], nextRecord: StudentSemesterRecord) {
  const withoutCurrent = records.filter((record) => record.cycle_key !== nextRecord.cycle_key);
  return [...withoutCurrent, nextRecord].sort((left, right) => {
    if (left.school_year !== right.school_year) return right.school_year.localeCompare(left.school_year);
    return right.sem_number - left.sem_number;
  });
}

function renewalRequirementCompletionCount(requirements: StudentRenewalRequirementMap) {
  return renewalRequirementFields.filter((field) => requirements[field]).length;
}

function semesterLabel(config: Pick<CurrentCycleConfig, "school_year" | "sem_number">) {
  const suffix =
    config.sem_number === 1 ? "1st" : config.sem_number === 2 ? "2nd" : config.sem_number === 3 ? "3rd" : `${config.sem_number}th`;
  return `${config.school_year}, ${suffix} Semester`;
}

function loadedOfTotalText(loadedCount: number, totalCount: number, singularNoun: string) {
  const total = Math.max(totalCount, loadedCount);
  return `${loadedCount} ${singularNoun}${loadedCount === 1 ? "" : "s"} loaded of ${total} total`;
}

function isRenewedForCycle(student: Student, currentCycle: CurrentCycleConfig) {
  const status = getSemesterPayrollStatus(student, currentCycle);
  return status === "qualified" || status === "payrolled";
}

function isPayrolledForCycle(student: Student, currentCycle: CurrentCycleConfig) {
  const record = getSemesterRecordForCycle(student, currentCycle);
  return getSemesterPayrollStatusFromRecord(record) === "payrolled";
}

function completionStatus(student: Student) {
  const requirements = getStudentRequirements(student);
  const completed = requirementFields.filter((field) => Boolean(requirements[field])).length;
  return completed === requirementFields.length ? "Complete" : `Incomplete (${completed}/${requirementFields.length})`;
}

function parseSortableNumber(value?: string) {
  const match = value?.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function getLastName(fullName: string) {
  const [beforeComma] = fullName.split(",");
  const parts = beforeComma.trim().split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] || fullName).toLocaleLowerCase();
}

function compareBatchValues(left?: string, right?: string) {
  const leftNumber = parseSortableNumber(left);
  const rightNumber = parseSortableNumber(right);
  if (leftNumber !== rightNumber) return leftNumber - rightNumber;
  return (left || "").localeCompare(right || "", undefined, { numeric: true, sensitivity: "base" });
}

function comparePayrollStudents(left: Student, right: Student) {
  const yearDiff = parseSortableNumber(left.year_level) - parseSortableNumber(right.year_level);
  if (yearDiff !== 0) return yearDiff;

  const lastNameDiff = getLastName(left.full_name).localeCompare(getLastName(right.full_name), undefined, {
    numeric: true,
    sensitivity: "base"
  });
  if (lastNameDiff !== 0) return lastNameDiff;

  return left.full_name.localeCompare(right.full_name, undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function formatDateTime(value?: string) {
  if (!value) return "None";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short"
  });
}

function yearLevelLabel(value?: string) {
  return String(value || "").trim() || "Not set";
}

function renewalHistoryCount(student: Student) {
  const semesterRenewals = getSemesterRecords(student).filter((record) => record.payroll_status === "qualified" || record.payroll_status === "payrolled" || record.renewal_status === "renewed" || record.renewal_status === "payrolled").length;
  return Math.max(student.renewal_history?.filter((entry) => entry.status === "renewed").length || 0, semesterRenewals);
}

function downloadTextFile(filename: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportStudentsCsv(students: Student[]) {
  const headers = [
    "Student ID",
    "Full Name",
    "Student Number",
    "Barangay",
    "Address",
    "School",
    "Phone",
    "Course",
    "Year Level",
    "Batch",
    "Initial Payroll Recorded",
    "Claimed"
  ];
  const rows = students.map((student) => [
    student.student_id,
    student.full_name,
    student.student_number,
    student.barangay,
    student.address,
    student.school_address,
    student.phone_number,
    student.school_course,
    student.year_level,
    student.batch,
    student.payrolled ? "Yes" : "No",
    student.claimed ? "Yes" : "No"
  ]);

  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  downloadTextFile("students-export.csv", "text/csv;charset=utf-8", csv);
}

function mergeStudentRecords(current: Student[], incoming: Student[], reset = false) {
  const byId = new Map<string, Student>();
  const base = reset ? [] : current;

  for (const student of base) {
    byId.set(student.student_id, student);
  }

  for (const student of incoming) {
    byId.set(student.student_id, student);
  }

  return [...byId.values()].sort((left, right) =>
    left.student_id.localeCompare(right.student_id, undefined, { numeric: true, sensitivity: "base" })
  );
}

function shellStateStorageKey(uid: string) {
  return `sis-next:app-shell-state:${uid}`;
}

function scrollStorageKey(uid: string, pathname: string) {
  return `sis-next:scroll:${uid}:${pathname}`;
}

function truthyDocumentLabels(student: StudentDraft) {
  return requirementFields
    .filter((field) => student.requirements[field])
    .map((field) => REQUIREMENT_LABELS[field]);
}

function requirementCompletionCount(requirements: StudentRequirementMap) {
  return requirementFields.filter((field) => requirements[field]).length;
}

function hasAnyInitialRequirement(requirements: StudentRequirementMap) {
  return requirementCompletionCount(requirements) > 0;
}

function studentDraftFromAny(value: unknown): StudentDraft {
  const source = value && typeof value === "object"
    ? (value as Partial<StudentDraft> & Partial<Student> & Partial<Record<StudentRequirementKey, unknown>>)
    : {};
  return {
    student_id: String(source.student_id ?? "").trim(),
    full_name: String(source.full_name ?? "").trim(),
    student_number: String(source.student_number ?? "").trim(),
    barangay: String(source.barangay ?? "").trim(),
    address: String(source.address ?? "").trim(),
    school_address: String(source.school_address ?? "").trim(),
    phone_number: String(source.phone_number ?? "").trim(),
    school_course: String(source.school_course ?? "").trim(),
    year_level: String(source.year_level ?? "").trim(),
    batch: String(source.batch ?? "").trim(),
    for_renewal: source.for_renewal === true || source.payrolled === true || Boolean(source.payrolled_at),
    requirements: requirementMapFromLegacySource({
      ...source.requirements,
      certificate_of_residency: source.requirements?.certificate_of_residency ?? source.certificate_of_residency,
      pagpapatunay_form: source.requirements?.pagpapatunay_form ?? source.pagpapatunay_form,
      picture_of_the_house: source.requirements?.picture_of_the_house ?? source.picture_of_the_house,
      good_moral_certificate: source.requirements?.good_moral_certificate ?? source.good_moral_certificate,
      original_certificate_of_grades: source.requirements?.original_certificate_of_grades ?? source.original_certificate_of_grades,
      proof_of_enrollment: source.requirements?.proof_of_enrollment ?? source.proof_of_enrollment
    })
  };
}

export function AppShell({
  initialData,
  initialView
}: {
  initialData: AppInitialData;
  initialView: AppViewName;
}) {
  const { user, refreshSession, signOutUser } = useAuth();
  const pathname = usePathname();
  const currentUser = user || initialData.user;
  const isAdmin = isAdminUser(currentUser);
  const signedOutMessageKey = "sis-next:signed-out-message";
  const persistedStateKey = shellStateStorageKey(currentUser.uid);
  const persistedScrollKey = scrollStorageKey(currentUser.uid, pathname);
  const hydratedShellStateKeyRef = useRef<string | null>(null);
  const hydratedScrollKeyRef = useRef<string | null>(null);

  const [activeView, setActiveView] = useState<AppViewName>(initialView);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [students, setStudents] = useState<Student[]>(initialData.students);
  const [studentLoadState, setStudentLoadState] = useState<StudentLoadState>(() =>
    initialData.students.length ? "ready" : "idle"
  );
  const [studentPageCursor, setStudentPageCursor] = useState<string | null>(null);
  const [studentHasMore, setStudentHasMore] = useState(false);
  const [studentLoadError, setStudentLoadError] = useState("");
  const [studentTotalCount, setStudentTotalCount] = useState(initialData.stats.studentsTotal);
  const studentLoadRequestRef = useRef(0);
  const studentPageFilterKeyRef = useRef("");
  const [trash, setTrash] = useState<Student[]>(initialData.trash);
  const [payoutRecords, setPayoutRecords] = useState<PayoutRecord[]>(initialData.payoutRecords);
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>(initialData.operationLogs);
  const [options, setOptions] = useState<OptionBuckets>(initialData.options);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [currentCycle, setCurrentCycle] = useState<CurrentCycleConfig>(initialData.currentCycle);
  const [currentCycleDraft, setCurrentCycleDraft] = useState<CurrentCycleDraft>(() => currentCycleDraftFromConfig(initialData.currentCycle));
  const [renewalRecordStudentId, setRenewalRecordStudentId] = useState("");
  const [renewalRecordCycle, setRenewalRecordCycle] = useState<CurrentCycleConfig | null>(null);
  const [renewalRecordDraft, setRenewalRecordDraft] = useState<RenewalRecordDraft>(() => emptyRenewalRecordDraft());
  const [requirementsSchoolYear, setRequirementsSchoolYear] = useState(initialData.currentCycle.school_year);
  const [requirementsSemester, setRequirementsSemester] = useState(String(initialData.currentCycle.sem_number));
  const [requirementsTab, setRequirementsTab] = useState<RequirementsTab>("not-renewal");
  const [requirementsNameFilter, setRequirementsNameFilter] = useState("");
  const [requirementsSchoolFilter, setRequirementsSchoolFilter] = useState("");
  const [requirementsBarangayFilter, setRequirementsBarangayFilter] = useState("");
  const [requirementsBatchFilter, setRequirementsBatchFilter] = useState("all");
  const [catalogCollection, setCatalogCollection] = useState<OptionCollectionName>("barangays");
  const [catalogDraftName, setCatalogDraftName] = useState("");
  const [catalogEditId, setCatalogEditId] = useState<string | null>(null);
  const [studentDraft, setStudentDraft] = useState<StudentDraft>(() => emptyStudentDraft());
  const [studentEditId, setStudentEditId] = useState<string | null>(null);
  const [managedUserDraft, setManagedUserDraft] = useState<ManagedUserDraft>(() => emptyManagedUserDraft());
  const [managedUserEditId, setManagedUserEditId] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(() => profileDraftFromUser(initialData.user));
  const [selectedPayrollIds, setSelectedPayrollIds] = useState<Set<string>>(() => new Set());
  const [payrollTab, setPayrollTab] = useState<PayrollTab>("new");
  const [payrollSchoolYear, setPayrollSchoolYear] = useState(initialData.currentCycle.school_year);
  const [payrollSemester, setPayrollSemester] = useState(String(initialData.currentCycle.sem_number));
  const [payrollNameFilter, setPayrollNameFilter] = useState("");
  const [payrollSchoolFilter, setPayrollSchoolFilter] = useState("");
  const [payrollBarangayFilter, setPayrollBarangayFilter] = useState("");
  const [payrollStatusFilter, setPayrollStatusFilter] = useState("payroll_candidates");
  const [payrollBatchFilter, setPayrollBatchFilter] = useState("all");
  const [payrollMetadataDraft, setPayrollMetadataDraft] = useState<PayrollMetadataDraft>(() => emptyPayrollMetadataDraft());
  const [payrollHistoryStudentId, setPayrollHistoryStudentId] = useState("");
  const [payrollHistoryQuery, setPayrollHistoryQuery] = useState("");
  const [payrollHistorySchoolFilter, setPayrollHistorySchoolFilter] = useState("");
  const [payrollHistoryBarangayFilter, setPayrollHistoryBarangayFilter] = useState("");
  const [payrollHistoryBatchFilter, setPayrollHistoryBatchFilter] = useState("all");
  const [payrollHistoryMenuOpen, setPayrollHistoryMenuOpen] = useState(false);
  const [actionsStudentId, setActionsStudentId] = useState("");
  const [search, setSearch] = useState("");
  const [studentSchoolFilter, setStudentSchoolFilter] = useState("");
  const [studentBarangayFilter, setStudentBarangayFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [batchFilter, setBatchFilter] = useState("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [validationDialog, setValidationDialog] = useState<ValidationDialogRequest | null>(null);
  const [studentReviewOpen, setStudentReviewOpen] = useState(false);

  const visibleNavItems = useMemo(() => APP_VIEWS.filter((item) => !item.adminOnly || isAdmin), [isAdmin]);

  useEffect(() => {
    setActiveView(initialView);
    setSidebarOpen(false);
  }, [initialView]);

  useEffect(() => {
    setCurrentCycleDraft(currentCycleDraftFromConfig(currentCycle));
  }, [currentCycle]);

  useEffect(() => {
    setProfileDraft((current) => ({
      ...profileDraftFromUser(currentUser),
      newPassword: current.newPassword,
      confirmPassword: current.confirmPassword
    }));
  }, [currentUser.email, currentUser.name, currentUser.uid]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const saved = window.localStorage.getItem(persistedStateKey);
      if (!saved) return;

      const state = JSON.parse(saved) as {
        version?: number;
        catalogCollection?: OptionCollectionName;
        catalogDraftName?: string;
        catalogEditId?: string | null;
        studentDraft?: unknown;
        studentEditId?: string | null;
        managedUserDraft?: Partial<ManagedUserDraft>;
        managedUserEditId?: string | null;
        currentCycleDraft?: Partial<CurrentCycleDraft>;
        renewalRecordStudentId?: string;
        renewalRecordCycle?: CurrentCycleConfig | null;
        renewalRecordDraft?: Partial<RenewalRecordDraft>;
        requirementsSchoolYear?: string;
        requirementsSemester?: string;
        requirementsTab?: RequirementsTab | "non-payrolled" | "payrolled";
        requirementsNameFilter?: string;
        requirementsSchoolFilter?: string;
        requirementsBarangayFilter?: string;
        requirementsBatchFilter?: string;
        selectedPayrollIds?: string[];
        payrollTab?: PayrollTab | "unpayrolled" | "renewed";
        payrollSchoolYear?: string;
        payrollSemester?: string;
        payrollNameFilter?: string;
        payrollSchoolFilter?: string;
        payrollBarangayFilter?: string;
        payrollStatusFilter?: string;
        payrollBatchFilter?: string;
        payrollMetadataDraft?: Partial<PayrollMetadataDraft>;
        payrollHistoryStudentId?: string;
        payrollHistoryQuery?: string;
        payrollHistorySchoolFilter?: string;
        payrollHistoryBarangayFilter?: string;
        payrollHistoryBatchFilter?: string;
        search?: string;
        studentSchoolFilter?: string;
        studentBarangayFilter?: string;
        statusFilter?: string;
        batchFilter?: string;
      };
      if (state.version !== 1 && state.version !== 2 && state.version !== 3) return;

      if (state.catalogCollection) setCatalogCollection(state.catalogCollection);
      if (typeof state.catalogDraftName === "string") setCatalogDraftName(state.catalogDraftName);
      if (typeof state.catalogEditId === "string" || state.catalogEditId === null) setCatalogEditId(state.catalogEditId ?? null);
      if (state.studentDraft) setStudentDraft(studentDraftFromAny(state.studentDraft));
      if (typeof state.studentEditId === "string" || state.studentEditId === null) setStudentEditId(state.studentEditId ?? null);
      if (state.managedUserDraft) setManagedUserDraft({ ...emptyManagedUserDraft(), ...state.managedUserDraft });
      if (typeof state.managedUserEditId === "string" || state.managedUserEditId === null) {
        setManagedUserEditId(state.managedUserEditId ?? null);
      }
      if (state.currentCycleDraft) {
        setCurrentCycleDraft({
          school_year: String(state.currentCycleDraft.school_year ?? initialData.currentCycle.school_year),
          sem_number: String(state.currentCycleDraft.sem_number ?? initialData.currentCycle.sem_number),
          status:
            state.currentCycleDraft.status === "locked" ||
            state.currentCycleDraft.status === "archived" ||
            state.currentCycleDraft.status === "open"
              ? state.currentCycleDraft.status
              : initialData.currentCycle.status
        });
      }
      if (typeof state.renewalRecordStudentId === "string") setRenewalRecordStudentId(state.renewalRecordStudentId);
      if (state.renewalRecordCycle && typeof state.renewalRecordCycle.school_year === "string") {
        const semNumber = Number(state.renewalRecordCycle.sem_number);
        if (Number.isFinite(semNumber) && semNumber > 0) {
          setRenewalRecordCycle(cycleConfigFromParts(state.renewalRecordCycle.school_year, semNumber));
        }
      }
      if (state.renewalRecordDraft) {
        const renewalDraftState = state.renewalRecordDraft as Partial<RenewalRecordDraft> & { renewed?: boolean };
        setRenewalRecordDraft({
          payout_type: state.renewalRecordDraft.payout_type === "renewal" ? "renewal" : "initial",
          for_renewal: renewalDraftState.for_renewal === true || renewalDraftState.renewed === true,
          initial_payout_requirements: requirementMapFromLegacySource(state.renewalRecordDraft.initial_payout_requirements),
          renewal_requirements: renewalRequirementMapFromAny(
            state.renewalRecordDraft.renewal_requirements ?? (state.renewalRecordDraft as { requirements?: unknown }).requirements
          ),
          notes: String(state.renewalRecordDraft.notes ?? "")
        });
      }
      if (typeof state.requirementsSchoolYear === "string") setRequirementsSchoolYear(state.requirementsSchoolYear);
      if (typeof state.requirementsSemester === "string") setRequirementsSemester(state.requirementsSemester);
      if (state.requirementsTab === "renewal" || state.requirementsTab === "not-renewal") {
        setRequirementsTab(state.requirementsTab);
      } else if (state.requirementsTab === "payrolled") {
        setRequirementsTab("renewal");
      } else if (state.requirementsTab === "non-payrolled") {
        setRequirementsTab("not-renewal");
      }
      if (typeof state.requirementsNameFilter === "string") setRequirementsNameFilter(state.requirementsNameFilter);
      if (typeof state.requirementsSchoolFilter === "string") setRequirementsSchoolFilter(state.requirementsSchoolFilter);
      if (typeof state.requirementsBarangayFilter === "string") setRequirementsBarangayFilter(state.requirementsBarangayFilter);
      if (typeof state.requirementsBatchFilter === "string") setRequirementsBatchFilter(state.requirementsBatchFilter);
      if (Array.isArray(state.selectedPayrollIds)) setSelectedPayrollIds(new Set(state.selectedPayrollIds));
      if (state.payrollTab === "new" || state.payrollTab === "renewal") {
        setPayrollTab(state.payrollTab);
      } else if (state.payrollTab === "renewed") {
        setPayrollTab("renewal");
      } else if (state.payrollTab === "unpayrolled") {
        setPayrollTab("new");
      }
      if (typeof state.payrollSchoolYear === "string") setPayrollSchoolYear(state.payrollSchoolYear);
      if (typeof state.payrollSemester === "string") setPayrollSemester(state.payrollSemester);
      if (typeof state.payrollNameFilter === "string") setPayrollNameFilter(state.payrollNameFilter);
      if (typeof state.payrollSchoolFilter === "string") setPayrollSchoolFilter(state.payrollSchoolFilter);
      if (typeof state.payrollBarangayFilter === "string") setPayrollBarangayFilter(state.payrollBarangayFilter);
      if (typeof state.payrollStatusFilter === "string") {
        setPayrollStatusFilter(
          state.payrollStatusFilter === "payrolled"
            ? "payrolled"
            : "payroll_candidates"
        );
      }
      if (typeof state.payrollBatchFilter === "string") setPayrollBatchFilter(state.payrollBatchFilter);
      if (state.payrollMetadataDraft) {
        setPayrollMetadataDraft({ ...emptyPayrollMetadataDraft(), ...state.payrollMetadataDraft });
      }
      if (typeof state.payrollHistoryStudentId === "string") setPayrollHistoryStudentId(state.payrollHistoryStudentId);
      if (typeof state.payrollHistoryQuery === "string") setPayrollHistoryQuery(state.payrollHistoryQuery);
      if (typeof state.payrollHistorySchoolFilter === "string") setPayrollHistorySchoolFilter(state.payrollHistorySchoolFilter);
      if (typeof state.payrollHistoryBarangayFilter === "string") setPayrollHistoryBarangayFilter(state.payrollHistoryBarangayFilter);
      if (typeof state.payrollHistoryBatchFilter === "string") setPayrollHistoryBatchFilter(state.payrollHistoryBatchFilter);
      if (typeof state.search === "string") setSearch(state.search);
      if (typeof state.studentSchoolFilter === "string") setStudentSchoolFilter(state.studentSchoolFilter);
      if (typeof state.studentBarangayFilter === "string") setStudentBarangayFilter(state.studentBarangayFilter);
      if (typeof state.statusFilter === "string") setStatusFilter(state.statusFilter);
      if (typeof state.batchFilter === "string") setBatchFilter(state.batchFilter);
    } catch {
      window.localStorage.removeItem(persistedStateKey);
    } finally {
      hydratedShellStateKeyRef.current = persistedStateKey;
    }
  }, [persistedStateKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hydratedShellStateKeyRef.current !== persistedStateKey) return;

    const nextState: PersistedShellState = {
      version: 3,
      catalogCollection,
      catalogDraftName,
      catalogEditId,
      studentDraft,
      studentEditId,
      managedUserDraft,
      managedUserEditId,
      currentCycleDraft,
      renewalRecordStudentId,
      renewalRecordCycle,
      renewalRecordDraft,
      requirementsSchoolYear,
      requirementsSemester,
      requirementsTab,
      requirementsNameFilter,
      requirementsSchoolFilter,
      requirementsBarangayFilter,
      requirementsBatchFilter,
      selectedPayrollIds: [...selectedPayrollIds],
      payrollTab,
      payrollSchoolYear,
      payrollSemester,
      payrollNameFilter,
      payrollSchoolFilter,
      payrollBarangayFilter,
      payrollStatusFilter,
      payrollBatchFilter,
      payrollMetadataDraft,
      payrollHistoryStudentId,
      payrollHistoryQuery,
      payrollHistorySchoolFilter,
      payrollHistoryBarangayFilter,
      payrollHistoryBatchFilter,
      search,
      studentSchoolFilter,
      studentBarangayFilter,
      statusFilter,
      batchFilter
    };

    window.localStorage.setItem(persistedStateKey, JSON.stringify(nextState));
  }, [
    batchFilter,
    catalogCollection,
    catalogDraftName,
    catalogEditId,
    managedUserDraft,
    managedUserEditId,
    currentCycleDraft,
    renewalRecordDraft,
    renewalRecordCycle,
    renewalRecordStudentId,
    requirementsSchoolYear,
    requirementsSemester,
    requirementsTab,
    requirementsNameFilter,
    requirementsSchoolFilter,
    requirementsBarangayFilter,
    requirementsBatchFilter,
    payrollHistoryQuery,
    payrollHistoryStudentId,
    payrollHistorySchoolFilter,
    payrollHistoryBarangayFilter,
    payrollHistoryBatchFilter,
    payrollNameFilter,
    payrollSchoolFilter,
    payrollBarangayFilter,
    payrollStatusFilter,
    payrollBatchFilter,
    payrollMetadataDraft,
    payrollSchoolYear,
    payrollSemester,
    payrollTab,
    persistedStateKey,
    search,
    selectedPayrollIds,
    studentSchoolFilter,
    studentBarangayFilter,
    statusFilter,
    studentDraft,
    studentEditId
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const savedScroll = Number(window.sessionStorage.getItem(persistedScrollKey) || "0");
      hydratedScrollKeyRef.current = persistedScrollKey;

      if (!Number.isFinite(savedScroll) || savedScroll <= 0) return;

      window.requestAnimationFrame(() => {
        window.scrollTo({ top: savedScroll, behavior: "auto" });
      });
    } catch {
      window.sessionStorage.removeItem(persistedScrollKey);
      hydratedScrollKeyRef.current = persistedScrollKey;
    }
  }, [persistedScrollKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hydratedScrollKeyRef.current !== persistedScrollKey) return;

    const saveScroll = () => {
      window.sessionStorage.setItem(persistedScrollKey, String(window.scrollY));
    };

    saveScroll();
    window.addEventListener("scroll", saveScroll, { passive: true });

    return () => {
      saveScroll();
      window.removeEventListener("scroll", saveScroll);
    };
  }, [persistedScrollKey]);

  useEffect(() => {
    let cancelled = false;

    async function refreshReferenceData() {
      const [nextCycle, nextOptions, nextTrash] = await Promise.all([
        getCurrentCycleConfig(),
        Promise.all([
          getOptions("barangays"),
          getOptions("schools"),
          getOptions("courses"),
          getOptions("batches")
        ]),
        isAdmin ? getTrash() : Promise.resolve([])
      ]);

      if (cancelled) return;

      setCurrentCycle(nextCycle);
      setOptions({
        barangays: nextOptions[0],
        schools: nextOptions[1],
        courses: nextOptions[2],
        batches: nextOptions[3]
      });
      setTrash(nextTrash);
    }

    refreshReferenceData().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (activeView !== "users" || !isAdmin || usersLoaded) return;

    listManagedUsers()
      .then((records) => {
        setManagedUsers(records);
        setUsersLoaded(true);
      })
      .catch((error) => {
        showNotice(error instanceof Error ? error.message : "Unable to load managed users.", "error");
      });
  }, [activeView, isAdmin, usersLoaded]);

  useEffect(() => {
    if (!isAdmin && adminRecordStatusFilters.has(statusFilter)) {
      setStatusFilter("all");
    }
  }, [isAdmin, statusFilter]);

  useEffect(() => {
    if (isAdminOnlyView(activeView) && !isAdmin) {
      window.location.replace(routeForView("dashboard"));
    }
  }, [activeView, isAdmin]);

  const batchOptions = useMemo(() => {
    const batches = new Set(options.batches.map((item) => item.name).filter(Boolean));
    for (const student of students) {
      if (student.batch) batches.add(student.batch);
    }
    return [...batches].sort(compareBatchValues);
  }, [options.batches, students]);

  const catalogRecords = useMemo(
    () =>
      options[catalogCollection]
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" })),
    [catalogCollection, options]
  );

  const filteredStudents = useMemo(() => {
    const nameFilter = search.trim().toLocaleLowerCase();
    const schoolFilter = studentSchoolFilter.trim().toLocaleLowerCase();
    const barangayFilter = studentBarangayFilter.trim().toLocaleLowerCase();

    return students.filter((student) => {
      const nameHaystack = [student.full_name, student.student_id, student.student_number]
        .join(" ")
        .toLocaleLowerCase();

      if (nameFilter && !nameHaystack.includes(nameFilter)) return false;
      if (schoolFilter && !String(student.school_address || "").toLocaleLowerCase().includes(schoolFilter)) return false;
      if (barangayFilter && !String(student.barangay || "").toLocaleLowerCase().includes(barangayFilter)) return false;
      if (batchFilter !== "all" && student.batch !== batchFilter) return false;
      if (statusFilter === "renewed" && !isRenewedForCycle(student, currentCycle)) return false;
      if (statusFilter === "unrenewed" && isRenewedForCycle(student, currentCycle)) return false;
      if (statusFilter === "payrolled" && !isPayrolledForCycle(student, currentCycle)) return false;
      if (statusFilter === "unpayrolled" && isPayrolledForCycle(student, currentCycle)) return false;
      if (statusFilter === "complete" && completionStatus(student) !== "Complete") return false;
      if (statusFilter === "incomplete" && completionStatus(student) === "Complete") return false;
      return true;
    });
  }, [batchFilter, currentCycle, search, statusFilter, studentBarangayFilter, studentSchoolFilter, students]);

  const selectedPayrollHistoryStudent = useMemo(
    () => students.find((student) => student.student_id === payrollHistoryStudentId) || null,
    [payrollHistoryStudentId, students]
  );
  const payrollHistorySearchResults = useMemo(() => {
    const query = payrollHistoryQuery.trim().toLocaleLowerCase();
    const schoolFilter = payrollHistorySchoolFilter.trim().toLocaleLowerCase();
    const barangayFilter = payrollHistoryBarangayFilter.trim().toLocaleLowerCase();
    const sortedStudents = students
      .slice()
      .sort((left, right) => left.full_name.localeCompare(right.full_name, undefined, { sensitivity: "base" }));

    return sortedStudents
      .filter((student) => {
        const nameHaystack = [student.full_name, student.student_id, student.student_number]
          .join(" ")
          .toLocaleLowerCase();

        if (query && !nameHaystack.includes(query)) return false;
        if (schoolFilter && !String(student.school_address || "").toLocaleLowerCase().includes(schoolFilter)) return false;
        if (barangayFilter && !String(student.barangay || "").toLocaleLowerCase().includes(barangayFilter)) return false;
        if (payrollHistoryBatchFilter !== "all" && student.batch !== payrollHistoryBatchFilter) return false;
        return true;
      })
      .slice(0, 12);
  }, [
    payrollHistoryBarangayFilter,
    payrollHistoryBatchFilter,
    payrollHistoryQuery,
    payrollHistorySchoolFilter,
    students
  ]);
  const actionsStudent = useMemo(
    () => students.find((student) => student.student_id === actionsStudentId) || null,
    [actionsStudentId, students]
  );
  const studentEditRecord = useMemo(
    () => students.find((student) => student.student_id === studentEditId) || null,
    [studentEditId, students]
  );
  const studentRenewalLocked = Boolean(studentEditRecord && hasLockedPayrollHistory(studentEditRecord));
  const renewalRecordStudent = useMemo(
    () => students.find((student) => student.student_id === renewalRecordStudentId) || null,
    [renewalRecordStudentId, students]
  );
  const activeRenewalRecordCycle = renewalRecordCycle || currentCycle;
  const schoolYearOptions = useMemo(
    () => generateSchoolYearOptions(requirementsSchoolYear || currentCycle.school_year),
    [currentCycle.school_year, requirementsSchoolYear]
  );
  const requirementsSemesterNumber = Math.max(1, Math.min(2, Number(requirementsSemester) || currentCycle.sem_number || 1));
  const requirementsCycle = useMemo(
    () => cycleConfigFromParts(requirementsSchoolYear || currentCycle.school_year, requirementsSemesterNumber),
    [currentCycle.school_year, requirementsSchoolYear, requirementsSemesterNumber]
  );
  const payrollSchoolYearOptions = useMemo(
    () => generateSchoolYearOptions(payrollSchoolYear || currentCycle.school_year),
    [currentCycle.school_year, payrollSchoolYear]
  );
  const payrollSemesterNumber = Math.max(1, Math.min(2, Number(payrollSemester) || currentCycle.sem_number || 1));
  const payrollCycle = useMemo(
    () => cycleConfigFromParts(payrollSchoolYear || currentCycle.school_year, payrollSemesterNumber),
    [currentCycle.school_year, payrollSchoolYear, payrollSemesterNumber]
  );
  const activeStudentPageFilters = useMemo(() => {
    if (activeView === "requirements") {
      return {
        query: requirementsNameFilter.trim(),
        school: requirementsSchoolFilter.trim(),
        barangay: requirementsBarangayFilter.trim(),
        batch: requirementsBatchFilter,
        requirementsTab: isAdmin ? requirementsTab : undefined,
        cycle: {
          cycle_key: requirementsCycle.cycle_key,
          school_year: requirementsCycle.school_year,
          sem_number: requirementsCycle.sem_number
        }
      };
    }

    if (activeView === "payrolls") {
      return {
        query: payrollNameFilter.trim(),
        school: payrollSchoolFilter.trim(),
        barangay: payrollBarangayFilter.trim(),
        batch: payrollBatchFilter,
        status: payrollStatusFilter,
        payrollTab,
        cycle: {
          cycle_key: payrollCycle.cycle_key,
          school_year: payrollCycle.school_year,
          sem_number: payrollCycle.sem_number
        }
      };
    }

    if (activeView === "register" || activeView === "records") {
      return {
        query: search.trim(),
        school: studentSchoolFilter.trim(),
        barangay: studentBarangayFilter.trim(),
        batch: batchFilter,
        status: statusFilter,
        cycle: {
          cycle_key: currentCycle.cycle_key,
          school_year: currentCycle.school_year,
          sem_number: currentCycle.sem_number
        }
      };
    }

    return {};
  }, [
    activeView,
    batchFilter,
    currentCycle.cycle_key,
    currentCycle.school_year,
    currentCycle.sem_number,
    isAdmin,
    payrollBarangayFilter,
    payrollBatchFilter,
    payrollCycle,
    payrollNameFilter,
    payrollSchoolFilter,
    payrollStatusFilter,
    payrollTab,
    requirementsBarangayFilter,
    requirementsBatchFilter,
    requirementsCycle,
    requirementsNameFilter,
    requirementsSchoolFilter,
    requirementsTab,
    search,
    statusFilter,
    studentBarangayFilter,
    studentSchoolFilter
  ]);
  const activeStudentPageFilterKey = useMemo(
    () => JSON.stringify(activeStudentPageFilters),
    [activeStudentPageFilters]
  );

  useEffect(() => {
    if (!studentBackedViews.has(activeView)) return;
    if (studentPageFilterKeyRef.current === activeStudentPageFilterKey && students.length) return;

    const timeoutId = window.setTimeout(() => {
      void loadStudentsPage({ reset: true });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [activeView, activeStudentPageFilterKey, students.length]);

  const requirementRows = useMemo(() => {
    const nameFilter = requirementsNameFilter.trim().toLocaleLowerCase();
    const schoolFilter = requirementsSchoolFilter.trim().toLocaleLowerCase();
    const barangayFilter = requirementsBarangayFilter.trim().toLocaleLowerCase();
    const cycleFilteredStudents = students.filter((student) => {
      const nameHaystack = [student.full_name, student.student_id, student.student_number]
        .join(" ")
        .toLocaleLowerCase();

      if (nameFilter && !nameHaystack.includes(nameFilter)) return false;
      if (schoolFilter && !String(student.school_address || "").toLocaleLowerCase().includes(schoolFilter)) return false;
      if (barangayFilter && !String(student.barangay || "").toLocaleLowerCase().includes(barangayFilter)) return false;
      if (requirementsBatchFilter !== "all" && student.batch !== requirementsBatchFilter) return false;
      return true;
    });
    const rows = isAdmin
      ? requirementsTab === "renewal"
        ? cycleFilteredStudents.filter((student) => isForRenewalStudent(student))
        : cycleFilteredStudents.filter((student) => !isForRenewalStudent(student))
      : cycleFilteredStudents;

    return rows.slice().sort(comparePayrollStudents);
  }, [
    isAdmin,
    requirementsBarangayFilter,
    requirementsBatchFilter,
    requirementsCycle,
    requirementsNameFilter,
    requirementsSchoolFilter,
    requirementsTab,
    students
  ]);

  useEffect(() => {
    if (!selectedPayrollHistoryStudent) return;
    setPayrollHistoryQuery(`${selectedPayrollHistoryStudent.full_name} (${selectedPayrollHistoryStudent.student_id})`);
  }, [selectedPayrollHistoryStudent]);

  const payrollSummaryByStudent = useMemo(() => {
    const summary = new Map<string, { count: number; amount: number; latestCreatedAt: string }>();
    for (const record of payoutRecords) {
      const studentId = String(record.student_id || "").trim();
      if (!studentId) continue;

      const current = summary.get(studentId) || { count: 0, amount: 0, latestCreatedAt: "" };
      const createdAt = String(record.created_at || "");
      summary.set(studentId, {
        count: current.count + 1,
        amount: current.amount + Number(record.amount || 0),
        latestCreatedAt: createdAt > current.latestCreatedAt ? createdAt : current.latestCreatedAt
      });
    }
    return summary;
  }, [payoutRecords]);
  const payrollHistoryRows = useMemo(() => {
    if (!payrollHistoryStudentId) return [];
    return payoutRecords
      .filter((record) => record.student_id === payrollHistoryStudentId)
      .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")));
  }, [payrollHistoryStudentId, payoutRecords]);

  const payrollFilteredStudents = useMemo(() => {
    const nameFilter = payrollNameFilter.trim().toLocaleLowerCase();
    const schoolFilter = payrollSchoolFilter.trim().toLocaleLowerCase();
    const barangayFilter = payrollBarangayFilter.trim().toLocaleLowerCase();

    return students.filter((student) => {
      const nameHaystack = [student.full_name, student.student_id, student.student_number]
        .join(" ")
        .toLocaleLowerCase();

      if (nameFilter && !nameHaystack.includes(nameFilter)) return false;
      if (schoolFilter && !String(student.school_address || "").toLocaleLowerCase().includes(schoolFilter)) return false;
      if (barangayFilter && !String(student.barangay || "").toLocaleLowerCase().includes(barangayFilter)) return false;
      if (payrollBatchFilter !== "all" && student.batch !== payrollBatchFilter) return false;
      return true;
    });
  }, [payrollBarangayFilter, payrollBatchFilter, payrollNameFilter, payrollSchoolFilter, students]);

  const payrollRows = useMemo(() => {
    const payoutType = payrollTab === "renewal" ? "renewal" : "initial";
    const rows = payrollFilteredStudents.filter((student) => {
      if (!isPayoutTypeForCycle(student, payrollCycle, payoutType)) return false;
      if (payrollStatusFilter === "payroll_candidates") return isPayrollCandidateForCycle(student, payrollCycle);
      if (payrollStatusFilter === "payrolled") return isPayrolledForCycle(student, payrollCycle);
      if (payrollStatusFilter === "unpayrolled") return !isPayrolledForCycle(student, payrollCycle);
      if (payrollStatusFilter === "not_qualified") {
        return !isPayrolledForCycle(student, payrollCycle) && !isQualifiedForPayroll(student, payrollCycle);
      }
      return isPayrollCandidateForCycle(student, payrollCycle);
    });
    return rows.slice().sort(comparePayrollStudents);
  }, [payrollCycle, payrollFilteredStudents, payrollStatusFilter, payrollTab]);
  const selectedPayrollRows = useMemo(
    () => payrollRows.filter((student) => selectedPayrollIds.has(student.student_id)),
    [payrollRows, selectedPayrollIds]
  );
  const hasInvalidPayrollSelection = useMemo(
    () => selectedPayrollRows.some((student) => !isPayrollCandidateForCycle(student, payrollCycle)),
    [payrollCycle, selectedPayrollRows]
  );

  useEffect(() => {
    const visibleIds = new Set(payrollRows.map((student) => student.student_id));
    setSelectedPayrollIds((current) => {
      const next = new Set([...current].filter((studentId) => visibleIds.has(studentId)));
      return next.size === current.size ? current : next;
    });
  }, [payrollRows]);

  useEffect(() => {
    if (activeView !== "requirements") return;

    const rows = buildStudentTimelineDebugRows("requirements", requirementsCycle, requirementRows);
    console.groupCollapsed(
      `[SIS Requirements Timeline] ${requirementsCycle.cycle_key} | ${rows.length} visible student${rows.length === 1 ? "" : "s"}`
    );
    console.table(rows);
    console.groupEnd();
  }, [activeView, requirementRows, requirementsCycle]);

  useEffect(() => {
    if (activeView !== "payrolls") return;

    const rows = buildStudentTimelineDebugRows("payrolls", payrollCycle, payrollRows);
    console.groupCollapsed(
      `[SIS Payroll Timeline] ${payrollCycle.cycle_key} | ${payrollTab} | ${rows.length} visible student${rows.length === 1 ? "" : "s"}`
    );
    console.table(rows);
    console.groupEnd();
  }, [activeView, payrollCycle, payrollRows, payrollTab]);

  const stats = useMemo(
    () => ({
      total: initialData.stats.studentsTotal,
      claimed: initialData.stats.claimed,
      renewedPending: initialData.stats.payrollCandidates,
      trash: trash.length,
      payrollRecords: payoutRecords.length
    }),
    [initialData.stats.claimed, initialData.stats.payrollCandidates, initialData.stats.studentsTotal, payoutRecords.length, trash.length]
  );

  function showNotice(message: string, type: "success" | "error" | "info" = "success") {
    setNotice({ message, type });
  }

  function showValidationDialog(input: ValidationDialogRequest) {
    setValidationDialog(input);
  }

  function requestConfirmation(input: Omit<ConfirmationRequest, "resolve">) {
    return new Promise<boolean>((resolve) => {
      setConfirmation({ ...input, resolve });
    });
  }

  function resolveConfirmation(confirmed: boolean) {
    setConfirmation((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }

  async function recordOperation(input: OperationLogInput) {
    try {
      const operationLog = await saveOperationLog(input);
      setOperationLogs((current) => [operationLog, ...current].slice(0, 50));
    } catch (error) {
      console.warn("Unable to record operation log.", error);
    }
  }

  function busyMessage() {
    if (!busyKey) return "";
    if (busyKey === "export-payroll") return "Creating payroll files and recording cycle updates.";
    if (busyKey === "profile-update") return "Updating your profile.";
    if (busyKey.includes("delete")) return "Deleting the selected record.";
    if (busyKey.includes("trash")) return "Moving the student record to trash.";
    if (busyKey.includes("restore")) return "Restoring the student record.";
    if (busyKey.includes("save") || busyKey.includes("submit") || busyKey.includes("update")) return "Saving changes.";
    return "Processing operation.";
  }

  function persistShellStateSnapshot(overrides: Partial<PersistedShellState> = {}) {
    if (typeof window === "undefined") return;

    const baseState: PersistedShellState = {
      version: 3,
      catalogCollection,
      catalogDraftName,
      catalogEditId,
      studentDraft,
      studentEditId,
      managedUserDraft,
      managedUserEditId,
      currentCycleDraft,
      renewalRecordStudentId,
      renewalRecordCycle,
      renewalRecordDraft,
      requirementsSchoolYear,
      requirementsSemester,
      requirementsTab,
      requirementsNameFilter,
      requirementsSchoolFilter,
      requirementsBarangayFilter,
      requirementsBatchFilter,
      selectedPayrollIds: [...selectedPayrollIds],
      payrollTab,
      payrollSchoolYear,
      payrollSemester,
      payrollNameFilter,
      payrollSchoolFilter,
      payrollBarangayFilter,
      payrollStatusFilter,
      payrollBatchFilter,
      payrollMetadataDraft,
      payrollHistoryStudentId,
      payrollHistoryQuery,
      payrollHistorySchoolFilter,
      payrollHistoryBarangayFilter,
      payrollHistoryBatchFilter,
      search,
      studentSchoolFilter,
      studentBarangayFilter,
      statusFilter,
      batchFilter
    };
    const nextState = { ...baseState, ...overrides };

    window.localStorage.setItem(persistedStateKey, JSON.stringify(nextState));
    window.sessionStorage.setItem(persistedScrollKey, String(window.scrollY));
  }

  function withBusy<T>(key: string, task: () => Promise<T>) {
    setBusyKey(key);
    return task().finally(() => setBusyKey((current) => (current === key ? null : current)));
  }

  async function loadStudentsPage({ reset = false }: { reset?: boolean } = {}) {
    const requestFilters = activeStudentPageFilters;
    const requestFilterKey = activeStudentPageFilterKey;
    if (
      (studentLoadState === "loading" || studentLoadState === "loading-more") &&
      studentPageFilterKeyRef.current === requestFilterKey
    ) {
      return;
    }

    const resetPage = reset || studentPageFilterKeyRef.current !== requestFilterKey;
    const requestId = studentLoadRequestRef.current + 1;
    studentLoadRequestRef.current = requestId;
    studentPageFilterKeyRef.current = requestFilterKey;
    setStudentLoadError("");
    setStudentLoadState(resetPage || !students.length ? "loading" : "loading-more");
    if (resetPage) {
      setStudents([]);
      setStudentPageCursor(null);
      setStudentHasMore(false);
      setStudentTotalCount(0);
    }

    try {
      const page = await getStudentPage({
        cursor: resetPage ? null : studentPageCursor,
        limit: studentPageSize,
        filters: requestFilters
      });

      if (studentLoadRequestRef.current !== requestId) return;

      setStudents((current) => mergeStudentRecords(current, page.students, resetPage));
      setStudentPageCursor(page.nextCursor);
      setStudentHasMore(page.hasMore);
      setStudentTotalCount(page.total);
      setStudentLoadState("ready");
    } catch (error) {
      if (studentLoadRequestRef.current !== requestId) return;

      setStudentLoadError(error instanceof Error ? error.message : "Unable to load students.");
      setStudentLoadState("error");
    }
  }

  function navigate(view: AppViewName, overrides: Partial<PersistedShellState> = {}) {
    if (isAdminOnlyView(view) && !isAdmin) return;
    persistShellStateSnapshot(overrides);
    setActiveView(view);
    setSidebarOpen(false);
    window.location.assign(routeForView(view));
  }

  async function handleSignOut() {
    if (isSigningOut) return;

    setIsSigningOut(true);

    try {
      window.localStorage.removeItem(persistedStateKey);
      window.sessionStorage.removeItem(persistedScrollKey);
      await signOutUser();
      window.sessionStorage.setItem(signedOutMessageKey, "1");
      window.location.reload();
    } catch (error) {
      setIsSigningOut(false);
      showNotice(error instanceof Error ? error.message : "Unable to sign out right now.", "error");
    }
  }

  function patchStudentDraft(student: Partial<StudentDraft>) {
    setStudentDraft((current) => ({
      ...current,
      ...student,
      requirements: student.requirements ? { ...current.requirements, ...student.requirements } : current.requirements
    }));
  }

  function patchStudentRequirement(field: StudentRequirementKey, checked: boolean) {
    setStudentDraft((current) => ({
      ...current,
      requirements: {
        ...current.requirements,
        [field]: checked
      }
    }));
  }

  function setAllStudentRequirements(checked: boolean) {
    const nextRequirements = Object.fromEntries(
      requirementFields.map((field) => [field, checked])
    ) as StudentRequirementMap;

    setStudentDraft((current) => ({
      ...current,
      requirements: nextRequirements
    }));
  }

  function patchPayrollMetadataDraft(metadata: Partial<PayrollMetadataDraft>) {
    setPayrollMetadataDraft((current) => ({ ...current, ...metadata }));
  }

  function patchCurrentCycleDraft(update: Partial<CurrentCycleDraft>) {
    setCurrentCycleDraft((current) => ({ ...current, ...update }));
  }

  function patchRenewalRecordDraft(update: Partial<RenewalRecordDraft>) {
    setRenewalRecordDraft((current) => ({
      ...current,
      ...update,
      initial_payout_requirements: update.initial_payout_requirements
        ? { ...current.initial_payout_requirements, ...update.initial_payout_requirements }
        : current.initial_payout_requirements,
      renewal_requirements: update.renewal_requirements
        ? { ...current.renewal_requirements, ...update.renewal_requirements }
        : current.renewal_requirements
    }));
  }

  function patchInitialPayoutRequirement(field: StudentRequirementKey, checked: boolean) {
    setRenewalRecordDraft((current) => ({
      ...current,
      initial_payout_requirements: {
        ...current.initial_payout_requirements,
        [field]: checked
      }
    }));
  }

  function setAllInitialPayoutRequirements(checked: boolean) {
    const nextRequirements = Object.fromEntries(
      requirementFields.map((field) => [field, checked])
    ) as StudentRequirementMap;

    setRenewalRecordDraft((current) => ({
      ...current,
      initial_payout_requirements: nextRequirements
    }));
  }

  function patchRenewalRequirement(field: StudentRenewalRequirementKey, checked: boolean) {
    setRenewalRecordDraft((current) => ({
      ...current,
      renewal_requirements: {
        ...current.renewal_requirements,
        [field]: checked
      }
    }));
  }

  function setAllRenewalRequirements(checked: boolean) {
    const nextRequirements = Object.fromEntries(
      renewalRequirementFields.map((field) => [field, checked])
    ) as StudentRenewalRequirementMap;

    setRenewalRecordDraft((current) => ({
      ...current,
      renewal_requirements: nextRequirements
    }));
  }

  function patchRenewalIndicator(checked: boolean) {
    setRenewalRecordDraft((current) => ({
      ...current,
      for_renewal: checked,
      payout_type: checked ? "renewal" : "initial",
      renewal_requirements: checked ? current.renewal_requirements : emptyRenewalRequirementMap()
    }));
  }

  function selectPayrollHistoryStudent(student: Student) {
    setPayrollHistoryStudentId(student.student_id);
    setPayrollHistoryQuery(`${student.full_name} (${student.student_id})`);
    setPayrollHistoryMenuOpen(false);
  }

  function fillStudentDraft(student: Student) {
    const nextDraft = {
      student_id: student.student_id || "",
      full_name: student.full_name || "",
      student_number: student.student_number || "",
      barangay: student.barangay || "",
      address: student.address || "",
      school_address: student.school_address || "",
      phone_number: student.phone_number || "",
      school_course: student.school_course || "",
      year_level: student.year_level || "",
      batch: student.batch || "",
      for_renewal: isForRenewalStudent(student),
      requirements: getStudentRequirements(student)
    };

    setStudentEditId(student.student_id);
    setStudentDraft(nextDraft);
    navigate("register", {
      studentEditId: student.student_id,
      studentDraft: nextDraft
    });
  }

  function resetStudentForm() {
    setStudentReviewOpen(false);
    setStudentEditId(null);
    setStudentDraft(emptyStudentDraft());
  }

  function openRenewalRecord(student: Student, cycle: CurrentCycleConfig = currentCycle) {
    const currentRecord = getSemesterRecordForCycle(student, cycle);
    setRenewalRecordStudentId(student.student_id);
    setRenewalRecordCycle(cycle);
    setRenewalRecordDraft(
      currentRecord
        ? {
            payout_type: getSemesterPayoutType(student, currentRecord),
            for_renewal: isForRenewalStudent(student),
            initial_payout_requirements: getInitialPayoutRequirements(student),
            renewal_requirements: getSemesterRenewalRequirements(currentRecord),
            notes: currentRecord.notes || ""
          }
        : {
            ...emptyRenewalRecordDraft(),
            initial_payout_requirements: getInitialPayoutRequirements(student),
            for_renewal: isForRenewalStudent(student),
            payout_type: isForRenewalStudent(student) ? "renewal" : "initial"
          }
    );
  }

  function closeRenewalRecord() {
    setRenewalRecordStudentId("");
    setRenewalRecordCycle(null);
    setRenewalRecordDraft(emptyRenewalRecordDraft());
  }

  function studentInputFromDraft(draft: StudentDraft, existingStudent: Student | null) {
    const input: Student = {
      student_id: draft.student_id,
      full_name: draft.full_name,
      student_number: draft.student_number,
      barangay: draft.barangay,
      address: draft.address,
      school_address: draft.school_address,
      phone_number: draft.phone_number,
      school_course: draft.school_course,
      year_level: draft.year_level,
      batch: draft.batch,
      requirements: draft.requirements
    };

    if (!existingStudent || !hasLockedPayrollHistory(existingStudent)) {
      input.payrolled = draft.for_renewal;
      input.payrolled_at = draft.for_renewal
        ? existingStudent?.payrolled_at || new Date().toISOString()
        : "";
    }

    return input;
  }

  async function commitStudentSubmit() {
    if (studentEditId && !isAdmin) return;

    try {
      const studentInput = studentInputFromDraft(studentDraft, studentEditRecord);
      const savedStudent = await withBusy("student-submit", () =>
        studentEditId ? updateStudent(studentEditId, studentInput) : createStudent(studentInput)
      );

      setStudents((current) => {
        const exists = current.some((item) => item.student_id === savedStudent.student_id);
        return exists
          ? current.map((item) => (item.student_id === savedStudent.student_id ? savedStudent : item))
          : [savedStudent, ...current];
      });

      resetStudentForm();
      void recordOperation({
        action: studentEditId ? "update" : "insert",
        entity: "student",
        entity_id: savedStudent.student_id,
        summary: `${studentEditId ? "Updated" : "Created"} student ${savedStudent.full_name}.`,
        metadata: { student_id: savedStudent.student_id }
      });
      showNotice(studentEditId ? "Student record updated." : "Student record created.");
      navigate("records", {
        studentEditId: null,
        studentDraft: emptyStudentDraft()
      });
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Unable to save student.", "error");
    }
  }

  function handleStudentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (studentEditId && !isAdmin) return;

    const missingFields = missingStudentFields(studentDraft);
    if (missingFields.length) {
      showValidationDialog({
        title: studentEditId ? "Complete Student Update" : "Complete Student Registration",
        message: "Fill in the missing student fields before saving this record.",
        fields: missingFields,
        acknowledgeLabel: "Review Fields"
      });
      return;
    }

    setStudentReviewOpen(true);
  }

  async function handleSaveCurrentCycle() {
    if (!isAdmin) return;

    const schoolYear = currentCycleDraft.school_year.trim();
    const semNumber = Number(currentCycleDraft.sem_number);

    const invalidFields = invalidCurrentCycleFields(currentCycleDraft);
    if (invalidFields.length) {
      showValidationDialog({
        title: "Complete Current Cycle Details",
        message: "Enter valid current cycle details before saving.",
        fields: invalidFields,
        acknowledgeLabel: "Review Cycle"
      });
      return;
    }

    const confirmed = await requestConfirmation({
      title: "Save Current Cycle",
      message: `Set the current operating cycle to ${schoolYear}, ${semNumber === 1 ? "1st" : semNumber === 2 ? "2nd" : `${semNumber}th`} Semester?`,
      confirmLabel: "Save Cycle"
    });
    if (!confirmed) return;

    try {
      const savedCycle = await withBusy("save-current-cycle", () =>
        saveCurrentCycleConfig({
          school_year: schoolYear,
          sem_number: semNumber,
          status: currentCycleDraft.status
        })
      );
      setCurrentCycle(savedCycle);
      setCurrentCycleDraft(currentCycleDraftFromConfig(savedCycle));
      void recordOperation({
        action: "update",
        entity: "current_cycle",
        entity_id: savedCycle.cycle_key,
        summary: `Updated current cycle to ${semesterLabel(savedCycle)}.`,
        metadata: { school_year: savedCycle.school_year, sem_number: savedCycle.sem_number, status: savedCycle.status }
      });
      showNotice(`Current cycle updated to ${semesterLabel(savedCycle)}.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Unable to save the current cycle.", "error");
    }
  }

  async function handleSaveRenewalRecord() {
    if (!renewalRecordStudent) return;

    if (!isForRenewalDraft(renewalRecordStudent, renewalRecordDraft) && renewalRequirementCompletionCount(renewalRecordDraft.renewal_requirements) > 0) {
      showValidationDialog({
        title: "Mark Student For Renewal",
        message: "Mark this student as for renewal before fulfilling renewal requirements.",
        fields: ["For Renewal"],
        acknowledgeLabel: "Review Record"
      });
      return;
    }

    const nextRecord = buildSemesterRecordForCycle(renewalRecordStudent, activeRenewalRecordCycle, renewalRecordDraft, currentUser);
    const currentRecords = getSemesterRecords(renewalRecordStudent);
    const nextSemesterRecords = replaceSemesterRecord(currentRecords, nextRecord).map((record) => ({
      ...record,
      initial_payout_requirements: renewalRecordDraft.initial_payout_requirements
    }));

    const confirmed = await requestConfirmation({
      title: "Save Requirements",
      message: `Save requirement changes for ${renewalRecordStudent.full_name} in ${semesterLabel(activeRenewalRecordCycle)}?`,
      confirmLabel: "Save Requirements"
    });
    if (!confirmed) return;

    try {
      const updatePayload: Parameters<typeof updateStudent>[1] = {
        requirements: renewalRecordDraft.initial_payout_requirements,
        semester_records: nextSemesterRecords
      };

      if (!hasLockedPayrollHistory(renewalRecordStudent)) {
        updatePayload.payrolled = renewalRecordDraft.for_renewal;
        updatePayload.payrolled_at = renewalRecordDraft.for_renewal
          ? renewalRecordStudent.payrolled_at || new Date().toISOString()
          : "";
      }

      const updatedStudent = await withBusy(`renewal-record-${renewalRecordStudent.student_id}`, () =>
        updateStudent(renewalRecordStudent.student_id, updatePayload)
      );

      setStudents((current) =>
        current.map((student) => (student.student_id === updatedStudent.student_id ? updatedStudent : student))
      );
      closeRenewalRecord();
      void recordOperation({
        action: "update",
        entity: "student_requirements",
        entity_id: updatedStudent.student_id,
        summary: `Updated global initial requirements and semester renewal requirements for ${updatedStudent.full_name} in ${semesterLabel(activeRenewalRecordCycle)}.`,
        metadata: { student_id: updatedStudent.student_id, cycle_key: activeRenewalRecordCycle.cycle_key }
      });
      showNotice(`Renewal record saved for ${updatedStudent.full_name} in ${semesterLabel(activeRenewalRecordCycle)}.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Unable to save the renewal record.", "error");
    }
  }

  async function handleStudentFlagUpdate(student: Student, field: "claimed" | "renewed" | "payrolled") {
    const nextValue = !student[field];
    const confirmed = await requestConfirmation({
      title: "Update Student Flag",
      message: `${nextValue ? "Mark" : "Unmark"} ${student.full_name} as ${field}?`,
      confirmLabel: "Update"
    });
    if (!confirmed) return;

    try {
      const timestampField = `${field}_at` as "claimed_at" | "renewed_at" | "payrolled_at";
      const updatedStudent = await withBusy(`student-flag-${student.student_id}-${field}`, () =>
        updateStudent(student.student_id, {
          [field]: nextValue,
          [timestampField]: nextValue ? new Date().toISOString() : ""
        })
      );

      setStudents((current) =>
        current.map((item) => (item.student_id === updatedStudent.student_id ? updatedStudent : item))
      );
      void recordOperation({
        action: "update",
        entity: "student_flag",
        entity_id: updatedStudent.student_id,
        summary: `${nextValue ? "Enabled" : "Disabled"} ${field} for ${updatedStudent.full_name}.`,
        metadata: { student_id: updatedStudent.student_id, field, value: nextValue }
      });
      showNotice(`${student.full_name} updated.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Unable to update record.", "error");
    }
  }

  async function handleMoveToTrash(student: Student) {
    if (!isAdmin) return;

    const confirmed = await requestConfirmation({
      title: "Move Student To Trash",
      message: `Move ${student.full_name} to trash? This removes them from active records but can still be restored.`,
      confirmLabel: "Move To Trash",
      danger: true
    });
    if (!confirmed) return;

    try {
      const removed = await withBusy(`trash-${student.student_id}`, () => moveStudentToTrash(student.student_id));
      setStudents((current) => current.filter((item) => item.student_id !== student.student_id));
      if (removed) {
        setTrash((current) => [removed, ...current.filter((item) => item.student_id !== removed.student_id)]);
      }
      void recordOperation({
        action: "delete",
        entity: "student",
        entity_id: student.student_id,
        summary: `Moved ${student.full_name} to trash.`,
        metadata: { student_id: student.student_id }
      });
      showNotice(`${student.full_name} moved to trash.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Unable to move student to trash.", "error");
    }
  }

  async function handleRestoreStudent(student: Student) {
    const confirmed = await requestConfirmation({
      title: "Restore Student",
      message: `Restore ${student.full_name} to active records?`,
      confirmLabel: "Restore"
    });
    if (!confirmed) return;

    try {
      const restored = await withBusy(`restore-${student.student_id}`, () => restoreStudent(student.student_id));
      setTrash((current) => current.filter((item) => item.student_id !== student.student_id));
      setStudents((current) => [restored, ...current.filter((item) => item.student_id !== restored.student_id)]);
      void recordOperation({
        action: "restore",
        entity: "student",
        entity_id: restored.student_id,
        summary: `Restored ${restored.full_name} from trash.`,
        metadata: { student_id: restored.student_id }
      });
      showNotice(`${student.full_name} restored.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Unable to restore student.", "error");
    }
  }

  async function handlePermanentDelete(student: Student) {
    const confirmed = await requestConfirmation({
      title: "Permanently Delete Student",
      message: `Permanently delete ${student.full_name}? This action cannot be undone.`,
      confirmLabel: "Delete Permanently",
      danger: true
    });
    if (!confirmed) return;

    try {
      await withBusy(`delete-trash-${student.student_id}`, () => deleteTrashStudent(student.student_id));
      setTrash((current) => current.filter((item) => item.student_id !== student.student_id));
      void recordOperation({
        action: "delete",
        entity: "trash_student",
        entity_id: student.student_id,
        summary: `Permanently deleted ${student.full_name}.`,
        metadata: { student_id: student.student_id }
      });
      showNotice(`${student.full_name} permanently deleted from trash.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Unable to delete trash record.", "error");
    }
  }

  async function handleProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const invalidFields = invalidProfileFields(profileDraft);
    if (invalidFields.length) {
      showValidationDialog({
        title: "Complete Profile Details",
        message: "Review the profile fields before saving your account changes.",
        fields: invalidFields,
        acknowledgeLabel: "Review Profile"
      });
      return;
    }

    const authUser = firebaseAuth.currentUser;
    if (!authUser) {
      showNotice("Your Firebase session is not ready. Sign in again before updating your profile.", "error");
      return;
    }

    const displayName = profileDraft.displayName.trim();
    const email = profileDraft.email.trim();
    const password = profileDraft.newPassword;
    const emailChanged = email !== String(authUser.email || "").trim();
    const passwordChanged = Boolean(password);
    const changes = [
      displayName !== String(authUser.displayName || "").trim() ? "name" : "",
      emailChanged ? "email" : "",
      passwordChanged ? "password" : ""
    ].filter(Boolean);

    if (!changes.length) {
      showNotice("No profile changes to save.", "info");
      return;
    }

    const confirmed = await requestConfirmation({
      title: "Update Profile",
      message:
        emailChanged || passwordChanged
          ? `Save changes to your ${changes.join(", ")}? You will be signed out and asked to sign in again.`
          : `Save changes to your ${changes.join(", ")}?`,
      confirmLabel: "Save Profile"
    });
    if (!confirmed) return;

    try {
      await withBusy("profile-update", async () => {
        if (displayName !== String(authUser.displayName || "").trim()) {
          await updateProfile(authUser, { displayName });
        }
        if (emailChanged) {
          await updateEmail(authUser, email);
        }
        if (passwordChanged) {
          await updatePassword(authUser, password);
        }

        if (emailChanged || passwordChanged) {
          window.sessionStorage.setItem(
            signedOutMessageKey,
            emailChanged && passwordChanged
              ? "Email and password updated. Please sign in again with your updated credentials."
              : emailChanged
                ? "Email updated. Please sign in again with your new email."
                : "Password updated. Please sign in again."
          );
          window.localStorage.removeItem(persistedStateKey);
          window.sessionStorage.removeItem(persistedScrollKey);
          await signOutUser();
          window.location.assign("/login");
          return;
        }

        const idToken = await authUser.getIdToken(true);
        const response = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken })
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(data.message || "Profile saved, but the session could not refresh.");
        }

        await refreshSession();
      });

      if (emailChanged || passwordChanged) return;

      setProfileDraft((current) => ({
        ...current,
        displayName,
        email,
        newPassword: "",
        confirmPassword: ""
      }));
      showNotice("Profile updated.");
    } catch (error) {
      showNotice(profileUpdateErrorMessage(error), "error");
    }
  }

  async function handleManagedUserSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;

    const invalidFields = invalidManagedUserFields(managedUserDraft, Boolean(managedUserEditId));
    if (invalidFields.length) {
      showValidationDialog({
        title: managedUserEditId ? "Complete User Update" : "Complete User Creation",
        message: "Fill in the required user details before saving this account.",
        fields: invalidFields,
        acknowledgeLabel: "Review User"
      });
      return;
    }

    const confirmed = await requestConfirmation({
      title: managedUserEditId ? "Update User" : "Create User",
      message: `${managedUserEditId ? "Update" : "Create"} the managed user ${managedUserDraft.email}?`,
      confirmLabel: managedUserEditId ? "Update User" : "Create User"
    });
    if (!confirmed) return;

    try {
      if (managedUserEditId) {
        const updated = await withBusy("managed-user-update", () =>
          updateManagedUser(managedUserEditId, {
            displayName: managedUserDraft.displayName,
            password: managedUserDraft.password
          })
        );
        setManagedUsers((current) => current.map((item) => (item.uid === updated.uid ? updated : item)));
        void recordOperation({
          action: "update",
          entity: "managed_user",
          entity_id: updated.uid,
          summary: `Updated managed user ${updated.email}.`,
          metadata: { uid: updated.uid, email: updated.email }
        });
        showNotice("Managed user updated.");
      } else {
        const created = await withBusy("managed-user-create", () =>
          createManagedUser({
            email: managedUserDraft.email,
            password: managedUserDraft.password,
            displayName: managedUserDraft.displayName,
            role: managedUserDraft.role
          })
        );
        setManagedUsers((current) => [created, ...current]);
        void recordOperation({
          action: "insert",
          entity: "managed_user",
          entity_id: created.uid,
          summary: `Created managed user ${created.email}.`,
          metadata: { uid: created.uid, email: created.email, role: created.role }
        });
        showNotice("Managed user created.");
      }

      setManagedUserDraft(emptyManagedUserDraft());
      setManagedUserEditId(null);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Unable to save managed user.", "error");
    }
  }

  function fillManagedUserDraft(userRecord: ManagedUser) {
    const nextDraft = {
      uid: userRecord.uid,
      email: userRecord.email,
      password: "",
      displayName: userRecord.displayName || "",
      role: userRecord.role || "encoder"
    };

    setManagedUserEditId(userRecord.uid);
    setManagedUserDraft(nextDraft);
    navigate("users", {
      managedUserEditId: userRecord.uid,
      managedUserDraft: nextDraft
    });
  }

  async function handleDeleteManagedUser(userRecord: ManagedUser) {
    const confirmed = await requestConfirmation({
      title: "Delete User",
      message: `Delete managed user ${userRecord.email}? This removes their Firebase Auth account.`,
      confirmLabel: "Delete User",
      danger: true
    });
    if (!confirmed) return;

    try {
      await withBusy(`delete-user-${userRecord.uid}`, () => deleteManagedUser(userRecord.uid));
      setManagedUsers((current) => current.filter((item) => item.uid !== userRecord.uid));
      void recordOperation({
        action: "delete",
        entity: "managed_user",
        entity_id: userRecord.uid,
        summary: `Deleted managed user ${userRecord.email}.`,
        metadata: { uid: userRecord.uid, email: userRecord.email }
      });
      showNotice(`${userRecord.email} removed.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Unable to delete user.", "error");
    }
  }

  function resetCatalogEditor() {
    setCatalogEditId(null);
    setCatalogDraftName("");
  }

  function beginCatalogEdit(collection: OptionCollectionName, record: OptionRecord) {
    setCatalogCollection(collection);
    setCatalogEditId(record.id);
    setCatalogDraftName(record.name);
  }

  async function handleSaveOption(collection: OptionCollectionName = catalogCollection) {
    const name = catalogDraftName.trim();
    if (!name) return;

    const confirmed = await requestConfirmation({
      title: catalogEditId ? "Update Catalog Record" : "Add Catalog Record",
      message: `${catalogEditId ? "Update" : "Add"} "${name}" in ${collection}?`,
      confirmLabel: catalogEditId ? "Update" : "Add"
    });
    if (!confirmed) return;

    try {
      const saved = await withBusy(`option-${collection}-save`, () =>
        saveOption(collection, { id: catalogEditId || undefined, name })
      );
      setOptions((current) => ({
        ...current,
        [collection]: [...current[collection].filter((item) => item.id !== saved.id), saved].sort((left, right) =>
          left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
        )
      }));
      resetCatalogEditor();
      void recordOperation({
        action: catalogEditId ? "update" : "insert",
        entity: collection,
        entity_id: saved.id,
        summary: `${catalogEditId ? "Updated" : "Added"} ${saved.name} in ${collection}.`,
        metadata: { collection, id: saved.id, name: saved.name }
      });
      showNotice(`${saved.name} ${catalogEditId ? "updated" : "added"} in ${collection}.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Unable to save option.", "error");
    }
  }

  async function handleDeleteOption(collection: OptionCollectionName, record: OptionRecord) {
    const confirmed = await requestConfirmation({
      title: "Delete Catalog Record",
      message: `Delete "${record.name}" from ${collection}?`,
      confirmLabel: "Delete",
      danger: true
    });
    if (!confirmed) return;

    try {
      await withBusy(`option-${collection}-${record.id}`, () => deleteOption(collection, record.id));
      setOptions((current) => ({
        ...current,
        [collection]: current[collection].filter((item) => item.id !== record.id)
      }));
      if (catalogEditId === record.id && catalogCollection === collection) {
        resetCatalogEditor();
      }
      void recordOperation({
        action: "delete",
        entity: collection,
        entity_id: record.id,
        summary: `Deleted ${record.name} from ${collection}.`,
        metadata: { collection, id: record.id, name: record.name }
      });
      showNotice(`${record.name} removed.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Unable to delete option.", "error");
    }
  }

  async function handleExportPayroll() {
    if (payrollStatusFilter === "payrolled") {
      showValidationDialog({
        title: "Received Payroll View",
        message: "Switch to Not Yet Received before creating payroll files.",
        fields: ["Payroll Status"],
        acknowledgeLabel: "Review Payroll View"
      });
      return;
    }

    if (!selectedPayrollRows.length) {
      showValidationDialog({
        title: "Select Students For Payroll",
        message: "Choose at least one student before creating payroll files.",
        fields: ["Student Selection"],
        acknowledgeLabel: "Select Students"
      });
      return;
    }

    if (hasInvalidPayrollSelection) {
      showValidationDialog({
        title: "Review Payroll Selection",
        message: "Only qualified unpaid candidates for the selected semester can be included in this payroll.",
        fields: ["Qualified Student Selection"],
        acknowledgeLabel: "Adjust Selection"
      });
      return;
    }

    if (!payrollMetadataDraft.date_of_filing.trim()) {
      showValidationDialog({
        title: "Complete Payroll Details",
        message: "Fill in the missing payroll field before creating payroll files.",
        fields: ["Date Of Filing"],
        acknowledgeLabel: "Add Date"
      });
      return;
    }

    const confirmed = await requestConfirmation({
      title: "Create Payroll Files",
      message: `Create payroll files for ${selectedPayrollRows.length} ${payrollTab === "new" ? "new" : "renewal"} student${selectedPayrollRows.length === 1 ? "" : "s"} in ${semesterLabel(payrollCycle)}?`,
      confirmLabel: "Create Payroll"
    });
    if (!confirmed) return;

    try {
      const payrollId = `payroll-${new Date().toISOString().slice(0, 10)}-${Date.now()}`;
      const createdAt = new Date().toISOString();
      const exportMetadata: PayrollMetadataDraft = {
        ...payrollMetadataDraft,
        school_year: payrollCycle.school_year,
        sem_number: String(payrollCycle.sem_number)
      };
      const groupCount = await withBusy("export-payroll", async () => {
        const { exportPayrollFiles } = await import("./lib/payroll-export");
        const exportedGroupCount = await exportPayrollFiles(selectedPayrollRows, exportMetadata, payrollId);
        const [createdRecords, updatedStudents] = await Promise.all([
          Promise.all(
            selectedPayrollRows.map((student) => {
              const payoutTypeLabel = payoutTypeLabelForCycle(student, payrollCycle);
              return savePayoutRecord({
                payroll_id: payrollId,
                student_id: student.student_id,
                student_name: student.full_name,
                student_number: student.student_number,
                school: student.school_address,
                course: student.school_course,
                year_level: student.year_level,
                batch: student.batch,
                type: payoutRecordTypeForCycle(student, payrollCycle),
                status: "generated",
                amount: 5000,
                payroll_group_count: exportedGroupCount,
                payroll_student_count: selectedPayrollRows.length,
                notes: `${payoutTypeLabel} payroll generated from ${semesterLabel(payrollCycle)} requirement qualification on ${createdAt}.`
              });
            })
          ),
          Promise.all(
            selectedPayrollRows.map((student) => {
              const existingCycleRecord = getSemesterRecordForCycle(student, payrollCycle);
              const payoutType = getSemesterPayoutType(student, existingCycleRecord);
              const nextCycleRecord: StudentSemesterRecord = {
                school_year: payrollCycle.school_year,
                sem_number: payrollCycle.sem_number,
                cycle_key: payrollCycle.cycle_key,
                payout_type: payoutType,
                payroll_status: "payrolled",
                renewal_status: "payrolled",
                payroll_id: payrollId,
                payroll_record_type: payoutRecordTypeForCycle(student, payrollCycle),
                payrolled_at: createdAt,
                payrolled_by_uid: currentUser.uid,
                payrolled_by_email: currentUser.email,
                initial_payout_requirements: getInitialPayoutRequirements(student),
                renewal_requirements: getSemesterRenewalRequirements(existingCycleRecord),
                requirements: getSemesterRenewalRequirements(existingCycleRecord),
                created_at: existingCycleRecord?.created_at || createdAt,
                updated_at: createdAt,
                updated_by_uid: currentUser.uid,
                updated_by_email: currentUser.email,
                notes: existingCycleRecord?.notes || ""
              };

                    return updateStudent(student.student_id, {
                      payrolled: hasInitialPayroll(student) || payoutType === "initial",
                      payrolled_at: student.payrolled_at || createdAt,
                      semester_records: replaceSemesterRecord(getSemesterRecords(student), nextCycleRecord)
                    });
            })
          )
        ]);

        setPayoutRecords((current) => [...createdRecords, ...current]);
        setStudents((current) =>
          current.map((student) => updatedStudents.find((updated) => updated.student_id === student.student_id) || student)
        );
        setSelectedPayrollIds(new Set());
        return exportedGroupCount;
      });
      void recordOperation({
        action: "export",
        entity: "payroll",
        entity_id: payrollId,
        summary: `Created ${payrollTab === "new" ? "new" : "renewal"} payroll ${payrollId} for ${selectedPayrollRows.length} student${selectedPayrollRows.length === 1 ? "" : "s"}.`,
        metadata: {
          payroll_id: payrollId,
          cycle_key: payrollCycle.cycle_key,
          school_year: payrollCycle.school_year,
          sem_number: payrollCycle.sem_number,
          student_count: selectedPayrollRows.length,
          group_count: groupCount,
          student_ids: selectedPayrollRows.map((student) => student.student_id)
        }
      });
      showNotice(`Created payroll ${payrollId} for ${selectedPayrollRows.length} student${selectedPayrollRows.length === 1 ? "" : "s"} across ${groupCount} file group${groupCount === 1 ? "" : "s"}.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Unable to create payroll.", "error");
    }
  }

  const studentInitialLoadPending =
    studentBackedViews.has(activeView) &&
    students.length === 0 &&
    (studentLoadState === "idle" || studentLoadState === "loading");
  const studentPageLoading = studentLoadState === "loading" || studentLoadState === "loading-more";

  function renderCurrentView() {
    switch (activeView) {
      case "dashboard":
        return (
          <div className="content-stack">
            <SectionHeader
              eyebrow="Overview"
              title="Student Information System"
              description={
                isAdmin
                  ? "A flat operational workspace for scholarship records, renewals, payroll preparation, and user maintenance."
                  : "A focused workspace for scholarship records, registration, and semester requirements."
              }
            />
            <div className="stat-grid">
              <StatCard label="Total Scholars" value={stats.total} note="Active student records" />
              <StatCard label="Claimed" value={stats.claimed} note="Students with released subsidy" />
              {isAdmin ? <StatCard label="Payroll Candidates" value={stats.renewedPending} note="Qualified and unpaid for the current cycle" /> : null}
              {isAdmin ? <StatCard label="Trash" value={stats.trash} note="Archived records awaiting restore or deletion" /> : null}
            </div>
            <Surface
              title="Recent Operations"
              subtitle={
                isAdmin
                  ? "Latest tracked inserts, updates, deletes, restores, and payroll exports."
                  : "Latest tracked inserts, updates, deletes, and restores available to your role."
              }
            >
              <DataTable
                columns={[
                  { key: "action", label: "Action", render: (record) => record.action.toUpperCase() },
                  { key: "target", label: "Target", render: (record) => record.entity },
                  { key: "summary", label: "Summary", render: (record) => record.summary },
                  { key: "actor", label: "By", render: (record) => record.actor_email || record.actor_name || "Unknown" },
                  { key: "created", label: "When", render: (record) => formatDateTime(record.created_at) }
                ]}
                rows={operationLogs.slice(0, 8)}
                getRowKey={(record) => record.id}
              />
            </Surface>
            <Surface title="Recent Students" subtitle="The latest student records currently visible in the system.">
              <DataTable
                columns={[
                  { key: "id", label: "ID", render: (student) => student.student_id },
                  { key: "name", label: "Student", render: (student) => student.full_name },
                  { key: "school", label: "School", render: (student) => student.school_address || "—" },
                  { key: "course", label: "Course", render: (student) => student.school_course || "—" },
                  { key: "requirements", label: "Requirements", render: (student) => completionStatus(student) }
                ]}
                rows={students.slice(0, 8)}
                getRowKey={(student) => student.student_id}
              />
            </Surface>
          </div>
        );
      case "register":
        return (
          <div className="content-stack">
            <SectionHeader
              eyebrow="Registry"
              title={studentEditId ? "Edit Student" : "Register Student"}
              description={studentEditId ? "Update scholarship student records without leaving the rail layout." : "Create scholarship student records without leaving the rail layout."}
            />
            <Surface
              title={studentEditId ? "Student Details" : "New Student"}
              subtitle="This form captures the student profile and the full requirements checklist used to review eligibility."
              actions={
                <div className="button-row">
                  {studentEditId ? (
                    <button type="button" className="secondary-button" onClick={resetStudentForm}>
                      Reset Form
                    </button>
                  ) : null}
                  <button type="button" className="secondary-button" onClick={resetStudentForm}>
                    Clear Draft
                  </button>
                </div>
              }
            >
              <form className="form-grid" onSubmit={handleStudentSubmit} noValidate>
                <Field label="Full Name">
                  <input value={studentDraft.full_name} onChange={(event) => patchStudentDraft({ full_name: event.currentTarget.value })} />
                </Field>
                <Field label="Student Number">
                  <input value={studentDraft.student_number} onChange={(event) => patchStudentDraft({ student_number: event.currentTarget.value })} />
                </Field>
                <Field label="Barangay">
                  <select value={studentDraft.barangay} onChange={(event) => patchStudentDraft({ barangay: event.currentTarget.value })}>
                    <option value="">Select barangay</option>
                    {options.barangays.map((option) => (
                      <option key={option.id} value={option.name}>{option.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Address">
                  <input value={studentDraft.address} onChange={(event) => patchStudentDraft({ address: event.currentTarget.value })} />
                </Field>
                <Field label="School">
                  <select value={studentDraft.school_address} onChange={(event) => patchStudentDraft({ school_address: event.currentTarget.value })}>
                    <option value="">Select school</option>
                    {options.schools.map((option) => (
                      <option key={option.id} value={option.name}>{option.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Course">
                  <select value={studentDraft.school_course} onChange={(event) => patchStudentDraft({ school_course: event.currentTarget.value })}>
                    <option value="">Select course</option>
                    {options.courses.map((option) => (
                      <option key={option.id} value={option.name}>{option.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Year Level">
                  <input value={studentDraft.year_level} onChange={(event) => patchStudentDraft({ year_level: event.currentTarget.value })} />
                </Field>
                <Field label="Batch">
                  <select value={studentDraft.batch} onChange={(event) => patchStudentDraft({ batch: event.currentTarget.value })}>
                    <option value="">Select batch</option>
                    {batchOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Phone">
                  <input value={studentDraft.phone_number} onChange={(event) => patchStudentDraft({ phone_number: event.currentTarget.value })} />
                </Field>
                <div className="field full">
                  <span>Renewal Status</span>
                  <label className="document-check compact-check">
                    <input
                      type="checkbox"
                      checked={studentDraft.for_renewal}
                      disabled={studentRenewalLocked}
                      onChange={(event) => patchStudentDraft({ for_renewal: event.currentTarget.checked })}
                    />
                    <span>For Renewal</span>
                  </label>
                  {studentRenewalLocked ? (
                    <div className="inline-warning">
                      Payroll history already places this student in the renewal group.
                    </div>
                  ) : null}
                </div>
                <RequirementsChecklist
                  draft={studentDraft}
                  onRequirementChange={patchStudentRequirement}
                  onSetAllRequirements={setAllStudentRequirements}
                />
                <div className="form-actions">
                  <button type="submit" className="primary-button" disabled={busyKey === "student-submit"}>
                    {busyKey === "student-submit" ? "Saving..." : studentEditId ? "Update Student" : "Create Student"}
                  </button>
                  <button type="button" className="secondary-button" onClick={resetStudentForm}>
                    Clear
                  </button>
                </div>
              </form>
            </Surface>
            <FilterBar
              name={search}
              school={studentSchoolFilter}
              barangay={studentBarangayFilter}
              status={statusFilter}
              batch={batchFilter}
              batchOptions={batchOptions}
              showAdminStatusFilters={isAdmin}
              onNameChange={setSearch}
              onSchoolChange={setStudentSchoolFilter}
              onBarangayChange={setStudentBarangayFilter}
              onStatusChange={setStatusFilter}
              onBatchChange={setBatchFilter}
            />
            <Surface
              title="Student List"
              subtitle={
                studentInitialLoadPending
                  ? "Loading the first batch of active student records."
                  : `${loadedOfTotalText(filteredStudents.length, studentTotalCount, "active student record")} ${filteredStudents.length === 1 ? "matches" : "match"} the current filters.`
              }
            >
              {studentInitialLoadPending ? (
                <StudentLoadingPanel />
              ) : (
                <>
                  <DataTable
                    columns={[
                      { key: "id", label: "ID", render: (student) => student.student_id },
                      { key: "name", label: "Student", render: (student) => student.full_name },
                      { key: "number", label: "Student No.", render: (student) => student.student_number || "—" },
                      { key: "school", label: "School", render: (student) => student.school_address || "—" },
                      { key: "course", label: "Course", render: (student) => student.school_course || "—" },
                      { key: "batch", label: "Batch", render: (student) => student.batch || "—" },
                      { key: "requirements", label: "Requirements", render: (student) => completionStatus(student) },
                      ...(isAdmin
                        ? [
                            {
                              key: "actions",
                              label: "Actions",
                              render: (student: Student) => (
                                <div className="row-actions">
                                  <button type="button" className="action-button" onClick={() => fillStudentDraft(student)}>
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="action-button danger"
                                    onClick={() => handleMoveToTrash(student)}
                                    disabled={busyKey === `trash-${student.student_id}`}
                                  >
                                    {busyKey === `trash-${student.student_id}` ? "Moving..." : "Move To Trash"}
                                  </button>
                                </div>
                              )
                            }
                          ]
                        : [])
                    ]}
                    rows={filteredStudents}
                    getRowKey={(student) => student.student_id}
                    endReachedEnabled={studentHasMore && !studentPageLoading}
                    onEndReached={() => {
                      void loadStudentsPage();
                    }}
                  />
                  <StudentLoadControls
                    error={studentLoadError}
                    hasMore={studentHasMore}
                    isLoading={studentPageLoading}
                    loadedCount={students.length}
                    totalCount={studentTotalCount}
                    onRetry={() => {
                      void loadStudentsPage({ reset: true });
                    }}
                  />
                </>
              )}
            </Surface>
          </div>
        );
      case "records":
        return (
          <div className="content-stack">
            <SectionHeader eyebrow="Records" title="Scholarship Listing" description="Search, filter, edit, and recycle scholarship records from one flat workspace." />
            <FilterBar
              name={search}
              school={studentSchoolFilter}
              barangay={studentBarangayFilter}
              status={statusFilter}
              batch={batchFilter}
              batchOptions={batchOptions}
              showAdminStatusFilters={isAdmin}
              onNameChange={setSearch}
              onSchoolChange={setStudentSchoolFilter}
              onBarangayChange={setStudentBarangayFilter}
              onStatusChange={setStatusFilter}
              onBatchChange={setBatchFilter}
            />
            <Surface
              title="Student Records"
              subtitle={
                studentInitialLoadPending
                  ? "Loading the first batch of student records."
                  : `${loadedOfTotalText(filteredStudents.length, studentTotalCount, "record")} ${filteredStudents.length === 1 ? "matches" : "match"} the current filters.`
              }
            >
              {studentInitialLoadPending ? (
                <StudentLoadingPanel />
              ) : (
                <>
                  <DataTable
                    columns={[
                      { key: "id", label: "ID", render: (student) => student.student_id },
                      { key: "name", label: "Student", render: (student) => student.full_name },
                      { key: "school", label: "School", render: (student) => student.school_address || "—" },
                      { key: "course", label: "Course", render: (student) => student.school_course || "—" },
                      { key: "batch", label: "Batch", render: (student) => student.batch || "—" },
                      { key: "completion", label: "Requirements", render: (student) => completionStatus(student) },
                      {
                        key: "renewals",
                        label: "Renewals",
                        render: (student) => renewalHistoryCount(student)
                      },
                      {
                        key: "requirements_count",
                        label: "Ready",
                        render: (student) => {
                          const requirements = getStudentRequirements(student);
                          return `${requirementCompletionCount(requirements)}/${requirementFields.length}`;
                        }
                      },
                      ...(isAdmin
                        ? [
                            {
                              key: "payrolls",
                              label: "Payrolls",
                              render: (student: Student) => {
                                const summary = payrollSummaryByStudent.get(student.student_id);
                                return (
                                  <div className="payroll-summary-cell">
                                    <strong>{summary?.count || 0}</strong>
                                    <span>{summary?.amount ? `PHP ${summary.amount.toLocaleString()}` : "No payroll yet"}</span>
                                  </div>
                                );
                              }
                            }
                          ]
                        : []),
                      {
                        key: "actions",
                        label: "Actions",
                        render: (student) => (
                          <button type="button" className="action-button" onClick={() => setActionsStudentId(student.student_id)}>
                            Actions
                          </button>
                        )
                      }
                    ]}
                    rows={filteredStudents}
                    getRowKey={(student) => student.student_id}
                    endReachedEnabled={studentHasMore && !studentPageLoading}
                    onEndReached={() => {
                      void loadStudentsPage();
                    }}
                  />
                  <StudentLoadControls
                    error={studentLoadError}
                    hasMore={studentHasMore}
                    isLoading={studentPageLoading}
                    loadedCount={students.length}
                    totalCount={studentTotalCount}
                    onRetry={() => {
                      void loadStudentsPage({ reset: true });
                    }}
                  />
                </>
              )}
            </Surface>
            {isAdmin ? (
              <Surface
                title="Payroll History Lookup"
                subtitle={
                  selectedPayrollHistoryStudent
                    ? `${payrollHistoryRows.length} payroll record${payrollHistoryRows.length === 1 ? "" : "s"} for ${selectedPayrollHistoryStudent.full_name}.`
                    : "Select a student to review payroll traces after confirming the requirements and renewal flow."
                }
              >
                <div className="requirements-filter-grid">
                  <Field label="Student Name">
                    <div className="search-select">
                      <input
                        type="search"
                        value={payrollHistoryQuery}
                        placeholder="Search name or ID"
                        onFocus={() => setPayrollHistoryMenuOpen(true)}
                        onBlur={() => {
                          window.setTimeout(() => setPayrollHistoryMenuOpen(false), 120);
                        }}
                        onChange={(event) => {
                          setPayrollHistoryQuery(event.currentTarget.value);
                          setPayrollHistoryStudentId("");
                          setPayrollHistoryMenuOpen(true);
                        }}
                      />
                      {payrollHistoryMenuOpen ? (
                        <div className="search-select-menu" role="listbox" aria-label="Payroll history students">
                          {payrollHistorySearchResults.length ? (
                            payrollHistorySearchResults.map((student) => (
                              <button
                                key={student.student_id}
                                type="button"
                                className="search-select-option"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => selectPayrollHistoryStudent(student)}
                              >
                                <strong>{student.full_name}</strong>
                                <span>
                                  {student.student_id}
                                  {student.barangay ? ` • ${student.barangay}` : ""}
                                  {student.batch ? ` • Batch ${student.batch}` : ""}
                                  {student.school_course ? ` • ${student.school_course}` : ""}
                                </span>
                              </button>
                            ))
                          ) : (
                            <div className="search-select-empty">No students matched those filters.</div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </Field>
                  <Field label="School">
                    <input
                      type="search"
                      value={payrollHistorySchoolFilter}
                      placeholder="Search school"
                      onChange={(event) => {
                        setPayrollHistorySchoolFilter(event.currentTarget.value);
                        setPayrollHistoryStudentId("");
                      }}
                    />
                  </Field>
                  <Field label="Barangay">
                    <input
                      type="search"
                      value={payrollHistoryBarangayFilter}
                      placeholder="Search barangay"
                      onChange={(event) => {
                        setPayrollHistoryBarangayFilter(event.currentTarget.value);
                        setPayrollHistoryStudentId("");
                      }}
                    />
                  </Field>
                  <Field label="Batch">
                    <select
                      value={payrollHistoryBatchFilter}
                      onChange={(event) => {
                        setPayrollHistoryBatchFilter(event.currentTarget.value);
                        setPayrollHistoryStudentId("");
                      }}
                    >
                      <option value="all">All batches</option>
                      {batchOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </Field>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setPayrollHistoryStudentId("");
                      setPayrollHistoryQuery("");
                      setPayrollHistorySchoolFilter("");
                      setPayrollHistoryBarangayFilter("");
                      setPayrollHistoryBatchFilter("all");
                      setPayrollHistoryMenuOpen(false);
                    }}
                  >
                    Clear
                  </button>
                </div>
                <DataTable
                  columns={[
                    { key: "created", label: "Created", render: (record) => formatDateTime(record.created_at) },
                    { key: "payroll", label: "Payroll", render: (record) => record.payroll_id || record.id },
                    { key: "batch", label: "Batch", render: (record) => record.batch || "—" },
                    { key: "amount", label: "Amount", render: (record) => Number(record.amount || 0).toLocaleString() }
                  ]}
                  rows={payrollHistoryRows}
                  getRowKey={(record) => record.id}
                />
              </Surface>
            ) : null}
          </div>
        );
      case "requirements":
        return (
          <div className="content-stack">
            <SectionHeader
              eyebrow="Requirements"
              title="Requirements Timeline"
              description={
                isAdmin
                  ? "Manage initial and renewal requirements by school year and semester."
                  : "Manage student requirements by school year and semester from one focused workspace."
              }
            />
            <Surface
              title="School Year Timeline"
              subtitle="Scroll sideways to move through generated school years."
            >
              <div className="requirements-timeline-shell">
                <div className="school-year-timeline" aria-label="School year selector">
                  {schoolYearOptions.map((schoolYear, index) => (
                    <div key={schoolYear} className="school-year-step">
                      <button
                        type="button"
                        className={schoolYear === requirementsCycle.school_year ? "active" : ""}
                        onClick={() => setRequirementsSchoolYear(schoolYear)}
                      >
                        {schoolYear}
                      </button>
                      {index < schoolYearOptions.length - 1 ? <span aria-hidden="true" /> : null}
                    </div>
                  ))}
                </div>
                <div className="semester-spinner" aria-label="Semester selector">
                  <label htmlFor="requirementsSemesterSelect">Semester</label>
                  <select
                    id="requirementsSemesterSelect"
                    value={String(requirementsSemesterNumber)}
                    onChange={(event) => setRequirementsSemester(event.currentTarget.value)}
                  >
                    <option value="1">1st Semester</option>
                    <option value="2">2nd Semester</option>
                  </select>
                </div>
              </div>
            </Surface>
            <Surface
              title="Requirement Management"
              subtitle={
                studentInitialLoadPending
                  ? `Loading students for ${semesterLabel(requirementsCycle)}.`
                  : isAdmin
                    ? `${loadedOfTotalText(requirementRows.length, studentTotalCount, `${requirementsTab === "renewal" ? "renewal" : "not-renewal"} student`)} for ${semesterLabel(requirementsCycle)}.`
                    : `${loadedOfTotalText(requirementRows.length, studentTotalCount, "student")} for ${semesterLabel(requirementsCycle)}.`
              }
              actions={
                isAdmin ? (
                  <div className="segmented-control" role="tablist" aria-label="Requirement student type">
                    <button
                      type="button"
                      className={requirementsTab === "not-renewal" ? "active" : ""}
                      onClick={() => setRequirementsTab("not-renewal")}
                      role="tab"
                      aria-selected={requirementsTab === "not-renewal"}
                    >
                      Not-Renewal
                    </button>
                    <button
                      type="button"
                      className={requirementsTab === "renewal" ? "active" : ""}
                      onClick={() => setRequirementsTab("renewal")}
                      role="tab"
                      aria-selected={requirementsTab === "renewal"}
                    >
                      Renewal
                    </button>
                  </div>
                ) : null
              }
            >
              <div className="requirements-filter-grid">
                <Field label="Student Name">
                  <input
                    type="search"
                    value={requirementsNameFilter}
                    placeholder="Search name"
                    onChange={(event) => setRequirementsNameFilter(event.currentTarget.value)}
                  />
                </Field>
                <Field label="School">
                  <input
                    type="search"
                    value={requirementsSchoolFilter}
                    placeholder="Search school"
                    onChange={(event) => setRequirementsSchoolFilter(event.currentTarget.value)}
                  />
                </Field>
                <Field label="Barangay">
                  <input
                    type="search"
                    value={requirementsBarangayFilter}
                    placeholder="Search barangay"
                    onChange={(event) => setRequirementsBarangayFilter(event.currentTarget.value)}
                  />
                </Field>
                <Field label="Batch">
                  <select value={requirementsBatchFilter} onChange={(event) => setRequirementsBatchFilter(event.currentTarget.value)}>
                    <option value="all">All batches</option>
                    {batchOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </Field>
                <div className="requirements-filter-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setRequirementsNameFilter("");
                      setRequirementsSchoolFilter("");
                      setRequirementsBarangayFilter("");
                      setRequirementsBatchFilter("all");
                    }}
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
              {studentInitialLoadPending ? (
                <StudentLoadingPanel detail="Fetching the first batch for requirement management." />
              ) : (
                <>
                  <DataTable
                    columns={[
                      { key: "id", label: "ID", render: (student) => student.student_id },
                      { key: "name", label: "Student", render: (student) => student.full_name },
                      { key: "school", label: "School", render: (student) => student.school_address || "—" },
                      { key: "batch", label: "Batch", render: (student) => student.batch || "—" },
                      {
                        key: "for_renewal",
                        label: "For Renewal",
                        render: (student) => (
                          <FlagPill
                            active={isForRenewalStudent(student)}
                            label={isForRenewalStudent(student) ? "For renewal" : "Initial"}
                          />
                        )
                      },
                      {
                        key: "initial_payout_requirements",
                        label: "Initial Requirements",
                        render: (student) => {
                          const requirements = getInitialPayoutRequirements(student);
                          return `${requirementCompletionCount(requirements)}/${requirementFields.length}`;
                        }
                      },
                      {
                        key: "renewal_requirements",
                        label: "Renewal",
                        render: (student) => {
                          const record = getSemesterRecordForCycle(student, requirementsCycle);
                          return record
                            ? `${renewalRequirementCompletionCount(getSemesterRenewalRequirements(record))}/${renewalRequirementFields.length}`
                            : `0/${renewalRequirementFields.length}`;
                        }
                      },
                      ...(isAdmin
                        ? [
                            {
                              key: "status",
                              label: "Payroll Qualification",
                              render: (student: Student) => {
                                const status = getSemesterPayrollStatus(student, requirementsCycle);
                                return <FlagPill active={status === "qualified" || status === "payrolled"} label={qualificationLabel(student, requirementsCycle)} />;
                              }
                            }
                          ]
                        : []),
                      {
                        key: "actions",
                        label: "Actions",
                        render: (student) => (
                          <button type="button" className="action-button" onClick={() => openRenewalRecord(student, requirementsCycle)}>
                            Manage Requirements
                          </button>
                        )
                      }
                    ]}
                    rows={requirementRows}
                    getRowKey={(student) => student.student_id}
                    endReachedEnabled={studentHasMore && !studentPageLoading}
                    onEndReached={() => {
                      void loadStudentsPage();
                    }}
                  />
                  <StudentLoadControls
                    error={studentLoadError}
                    hasMore={studentHasMore}
                    isLoading={studentPageLoading}
                    loadedCount={students.length}
                    totalCount={studentTotalCount}
                    onRetry={() => {
                      void loadStudentsPage({ reset: true });
                    }}
                  />
                </>
              )}
            </Surface>
          </div>
        );
      case "profiles":
        return (
          <div className="content-stack">
            <SectionHeader
              eyebrow="Profiles"
              title="Account Profile"
              description="Update your account name, email address, and password from your signed-in session."
            />
            <Surface
              title="Your Profile"
              subtitle={`Signed in as ${currentUser.email || currentUser.name}.`}
            >
              <form className="form-grid" onSubmit={handleProfileSubmit} noValidate>
                <Field label="Name">
                  <input
                    value={profileDraft.displayName}
                    autoComplete="name"
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setProfileDraft((current) => ({ ...current, displayName: value }));
                    }}
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    value={profileDraft.email}
                    autoComplete="email"
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setProfileDraft((current) => ({ ...current, email: value }));
                    }}
                  />
                </Field>
                <Field label="New Password">
                  <input
                    type="password"
                    value={profileDraft.newPassword}
                    autoComplete="new-password"
                    placeholder="Leave blank to keep current password"
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setProfileDraft((current) => ({ ...current, newPassword: value }));
                    }}
                  />
                </Field>
                <Field label="Confirm Password">
                  <input
                    type="password"
                    value={profileDraft.confirmPassword}
                    autoComplete="new-password"
                    placeholder="Repeat new password"
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setProfileDraft((current) => ({ ...current, confirmPassword: value }));
                    }}
                  />
                </Field>
                <div className="form-actions">
                  <button type="submit" className="primary-button" disabled={busyKey === "profile-update"}>
                    {busyKey === "profile-update" ? "Saving..." : "Save Profile"}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setProfileDraft(profileDraftFromUser(currentUser))}
                  >
                    Reset
                  </button>
                </div>
              </form>
            </Surface>
          </div>
        );
      case "users":
        return (
          <div className="content-stack">
            <SectionHeader eyebrow="Users" title="Managed Users" description="Create, update, and remove Firebase Auth users with the same admin role model used by the legacy app." />
            <Surface title={managedUserEditId ? "Update User" : "Create User"} subtitle="Admin claims are applied in the backend when users are created.">
              <form className="form-grid" onSubmit={handleManagedUserSubmit} noValidate>
                <Field label="Email">
                  <input
                    type="email"
                    value={managedUserDraft.email}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setManagedUserDraft((current) => ({ ...current, email: value }));
                    }}
                    disabled={Boolean(managedUserEditId)}
                  />
                </Field>
                <Field label="Display Name">
                  <input
                    value={managedUserDraft.displayName}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setManagedUserDraft((current) => ({ ...current, displayName: value }));
                    }}
                  />
                </Field>
                <Field label={managedUserEditId ? "New Password" : "Password"}>
                  <input
                    type="password"
                    value={managedUserDraft.password}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setManagedUserDraft((current) => ({ ...current, password: value }));
                    }}
                  />
                </Field>
                <Field label="Role">
                  <select
                    value={managedUserDraft.role}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setManagedUserDraft((current) => ({ ...current, role: value }));
                    }}
                    disabled={Boolean(managedUserEditId)}
                  >
                    <option value="encoder">Encoder</option>
                    <option value="admin">Admin</option>
                  </select>
                </Field>
                <div className="form-actions">
                  <button type="submit" className="primary-button" disabled={busyKey === "managed-user-create" || busyKey === "managed-user-update"}>
                    {busyKey === "managed-user-create" || busyKey === "managed-user-update"
                      ? "Saving..."
                      : managedUserEditId
                        ? "Update User"
                        : "Create User"}
                  </button>
                  {managedUserEditId ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setManagedUserDraft(emptyManagedUserDraft());
                        setManagedUserEditId(null);
                      }}
                    >
                      Cancel Edit
                    </button>
                  ) : null}
                </div>
              </form>
            </Surface>
            <Surface title="Current Users" subtitle={`${managedUsers.length} users currently loaded from Firebase Auth.`}>
              <DataTable
                columns={[
                  { key: "email", label: "Email", render: (userRecord) => userRecord.email },
                  { key: "displayName", label: "Display Name", render: (userRecord) => userRecord.displayName || "—" },
                  { key: "role", label: "Role", render: (userRecord) => userRecord.role || "—" },
                  {
                    key: "actions",
                    label: "Actions",
                    render: (userRecord) => (
                      <div className="row-actions">
                        <button type="button" className="action-button" onClick={() => fillManagedUserDraft(userRecord)}>
                          Edit
                        </button>
                        <button type="button" className="action-button danger" onClick={() => handleDeleteManagedUser(userRecord)}>
                          Delete
                        </button>
                      </div>
                    )
                  }
                ]}
                rows={managedUsers}
                getRowKey={(userRecord) => userRecord.uid}
              />
            </Surface>
          </div>
        );
      case "catalogs":
        return (
          <div className="content-stack">
            <SectionHeader
              eyebrow="Catalogs"
              title="Reference Records"
              description="Manage barangays, schools, courses, and batches from one unified admin surface."
            />
            <div className="stat-grid">
              <StatCard label="Barangays" value={options.barangays.length} note="Resident source list" />
              <StatCard label="Schools" value={options.schools.length} note="School choices in registry" />
              <StatCard label="Courses" value={options.courses.length} note="Course choices in registry" />
              <StatCard label="Batches" value={options.batches.length} note="Batch options for scholars" />
            </div>
            <Surface
              title="Catalog Manager"
              subtitle="Switch collections, add new records, edit existing names, and remove outdated entries."
              actions={
                <div className="segmented-control" role="tablist" aria-label="Catalog collections">
                  {catalogDefinitions.map(({ collection, label }) => (
                    <button
                      key={collection}
                      type="button"
                      className={catalogCollection === collection ? "active" : ""}
                      onClick={() => {
                        setCatalogCollection(collection);
                        resetCatalogEditor();
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              }
            >
              <div className="catalog-manager">
                <div className="catalog-editor">
                  <label className="field full">
                    <span>{catalogEditId ? "Update record" : "Add record"}</span>
                    <input
                      value={catalogDraftName}
                      onChange={(event) => setCatalogDraftName(event.currentTarget.value)}
                      placeholder={`Enter ${
                        catalogDefinitions.find((item) => item.collection === catalogCollection)?.singular || "record"
                      } name`}
                    />
                  </label>
                  <div className="form-actions">
                    <button type="button" className="primary-button" onClick={() => handleSaveOption()} disabled={!catalogDraftName.trim()}>
                      {catalogEditId ? "Update" : "Add"}
                    </button>
                    <button type="button" className="secondary-button" onClick={resetCatalogEditor}>
                      Clear
                    </button>
                  </div>
                </div>
                <DataTable
                  columns={[
                    { key: "name", label: "Name", render: (record) => record.name },
                    {
                      key: "added",
                      label: "Added",
                      render: (record) => (record.added_at ? new Date(record.added_at).toLocaleDateString() : "—")
                    },
                    {
                      key: "actions",
                      label: "Actions",
                      render: (record) => (
                        <div className="row-actions">
                          <button type="button" className="action-button" onClick={() => beginCatalogEdit(catalogCollection, record)}>
                            Edit
                          </button>
                          <button type="button" className="action-button danger" onClick={() => handleDeleteOption(catalogCollection, record)}>
                            Delete
                          </button>
                        </div>
                      )
                    }
                  ]}
                  rows={catalogRecords}
                  getRowKey={(record) => record.id}
                />
              </div>
            </Surface>
          </div>
        );
      case "payrolls":
        return (
          <div className="content-stack">
            <SectionHeader eyebrow="Payrolls" title="Payrolls" description="Generate payroll files and record each payroll as its own preparation event." />
            <Surface
              title="Payout Timeline"
              subtitle="Choose the school year and semester for payroll qualification and document generation."
            >
              <div className="requirements-timeline-shell">
                <div className="school-year-timeline" aria-label="Payroll school year selector">
                  {payrollSchoolYearOptions.map((schoolYear, index) => (
                    <div key={schoolYear} className="school-year-step">
                      <button
                        type="button"
                        className={schoolYear === payrollCycle.school_year ? "active" : ""}
                        onClick={() => setPayrollSchoolYear(schoolYear)}
                      >
                        {schoolYear}
                      </button>
                      {index < payrollSchoolYearOptions.length - 1 ? <span aria-hidden="true" /> : null}
                    </div>
                  ))}
                </div>
                <div className="semester-spinner" aria-label="Payroll semester selector">
                  <label htmlFor="payrollSemesterSelect">Semester</label>
                  <select
                    id="payrollSemesterSelect"
                    value={String(payrollSemesterNumber)}
                    onChange={(event) => setPayrollSemester(event.currentTarget.value)}
                  >
                    <option value="1">1st Semester</option>
                    <option value="2">2nd Semester</option>
                  </select>
                </div>
              </div>
            </Surface>
            <Surface
              title="Payroll Scope"
              subtitle={`${stats.payrollRecords} payroll records are currently loaded.`}
            >
              <div className="payroll-scope-grid">
                <div className="payroll-scope-group">
                  <span className="payroll-scope-label">Student Type</span>
                  <div className="segmented-control payroll-tabs" role="tablist" aria-label="Payroll student scope">
                    <button
                      type="button"
                      className={payrollTab === "new" ? "active" : ""}
                      onClick={() => setPayrollTab("new")}
                      role="tab"
                      aria-selected={payrollTab === "new"}
                    >
                      New
                    </button>
                    <button
                      type="button"
                      className={payrollTab === "renewal" ? "active" : ""}
                      onClick={() => setPayrollTab("renewal")}
                      role="tab"
                      aria-selected={payrollTab === "renewal"}
                    >
                      Renewal
                    </button>
                  </div>
                </div>
                <div className="payroll-scope-group">
                  <span className="payroll-scope-label">Semester Payroll</span>
                  <div className="segmented-control payroll-tabs" role="tablist" aria-label="Payroll receipt status">
                    <button
                      type="button"
                      className={payrollStatusFilter === "payroll_candidates" ? "active" : ""}
                      onClick={() => setPayrollStatusFilter("payroll_candidates")}
                      role="tab"
                      aria-selected={payrollStatusFilter === "payroll_candidates"}
                    >
                      Not Yet Received
                    </button>
                    <button
                      type="button"
                      className={payrollStatusFilter === "payrolled" ? "active" : ""}
                      onClick={() => setPayrollStatusFilter("payrolled")}
                      role="tab"
                      aria-selected={payrollStatusFilter === "payrolled"}
                    >
                      Received
                    </button>
                  </div>
                </div>
              </div>
            </Surface>
            <Surface
              title={`${payrollTab === "new" ? "New" : "Renewal"} Payroll`}
              subtitle={
                payrollStatusFilter === "payrolled"
                  ? `${loadedOfTotalText(payrollRows.length, studentTotalCount, "student")} ${payrollRows.length === 1 ? "has" : "have"} received ${payrollTab === "new" ? "new" : "renewal"} payroll for ${semesterLabel(payrollCycle)}.`
                  : `${selectedPayrollRows.length} students selected from ${loadedOfTotalText(payrollRows.length, studentTotalCount, `qualified unpaid ${payrollTab === "new" ? "new" : "renewal"} record`)} for ${semesterLabel(payrollCycle)}.`
              }
              actions={
                <div className="button-row">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleExportPayroll}
                    disabled={payrollStatusFilter === "payrolled" || busyKey === "export-payroll" || hasInvalidPayrollSelection}
                  >
                    {busyKey === "export-payroll" ? "Creating..." : "Create Payroll Files"}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => exportStudentsCsv(payrollRows)}>
                    Export Student CSV
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setSelectedPayrollIds(new Set(payrollRows.map((student) => student.student_id)))}
                    disabled={payrollStatusFilter === "payrolled"}
                  >
                    Select All
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setSelectedPayrollIds(new Set())}>
                    Clear Selection
                  </button>
                </div>
              }
            >
              <div className="requirements-filter-grid payroll-filter-grid">
                <Field label="Student Name">
                  <input
                    type="search"
                    value={payrollNameFilter}
                    placeholder="Search name"
                    onChange={(event) => setPayrollNameFilter(event.currentTarget.value)}
                  />
                </Field>
                <Field label="School">
                  <input
                    type="search"
                    value={payrollSchoolFilter}
                    placeholder="Search school"
                    onChange={(event) => setPayrollSchoolFilter(event.currentTarget.value)}
                  />
                </Field>
                <Field label="Barangay">
                  <input
                    type="search"
                    value={payrollBarangayFilter}
                    placeholder="Search barangay"
                    onChange={(event) => setPayrollBarangayFilter(event.currentTarget.value)}
                  />
                </Field>
                <Field label="Batch">
                  <select value={payrollBatchFilter} onChange={(event) => setPayrollBatchFilter(event.currentTarget.value)}>
                    <option value="all">All batches</option>
                    {batchOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </Field>
                <div className="requirements-filter-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setPayrollNameFilter("");
                      setPayrollSchoolFilter("");
                      setPayrollBarangayFilter("");
                      setPayrollStatusFilter("payroll_candidates");
                      setPayrollBatchFilter("all");
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="form-grid payroll-metadata-grid">
                <Field label="Date Of Filing">
                  <input
                    type="date"
                    value={payrollMetadataDraft.date_of_filing}
                    onChange={(event) => patchPayrollMetadataDraft({ date_of_filing: event.currentTarget.value })}
                  />
                </Field>
              </div>
              <DataTable
                columns={[
                  {
                    key: "select",
                    label: "Select",
                    render: (student) => (
                      <input
                        type="checkbox"
                        checked={selectedPayrollIds.has(student.student_id)}
                        disabled={payrollStatusFilter === "payrolled"}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setSelectedPayrollIds((current) => {
                            const next = new Set(current);
                            if (checked) next.add(student.student_id);
                            else next.delete(student.student_id);
                            return next;
                          });
                        }}
                      />
                    )
                  },
                  { key: "name", label: "Student", render: (student) => student.full_name },
                  { key: "school", label: "School", render: (student) => student.school_address || "—" },
                  { key: "course", label: "Course", render: (student) => student.school_course || "—" },
                  { key: "year", label: "Year", render: (student) => student.year_level || "—" },
                  {
                    key: "payrolled",
                    label: "Qualification",
                    render: (student) => <FlagPill active={isQualifiedForPayroll(student, payrollCycle) || isPayrolledForCycle(student, payrollCycle)} label={qualificationLabel(student, payrollCycle)} />
                  }
                ]}
                rows={payrollRows}
                getRowKey={(student) => student.student_id}
                endReachedEnabled={studentHasMore && !studentPageLoading}
                onEndReached={() => {
                  void loadStudentsPage();
                }}
              />
              <StudentLoadControls
                error={studentLoadError}
                hasMore={studentHasMore}
                isLoading={studentPageLoading}
                loadedCount={students.length}
                totalCount={studentTotalCount}
                onRetry={() => {
                  void loadStudentsPage({ reset: true });
                }}
              />
            </Surface>
          </div>
        );
      case "trash":
        return (
          <div className="content-stack">
            <SectionHeader eyebrow="Trash" title="Archived Records" description="Restore student records or permanently remove them from the trash collection." />
            <Surface title="Trash Records" subtitle={`${trash.length} archived student records currently loaded.`}>
              <DataTable
                columns={[
                  { key: "id", label: "ID", render: (student) => student.student_id },
                  { key: "name", label: "Student", render: (student) => student.full_name },
                  { key: "deleted", label: "Deleted At", render: (student) => student.deleted_at || "—" },
                  {
                    key: "actions",
                    label: "Actions",
                    render: (student) => (
                      <div className="row-actions">
                        <button type="button" className="action-button" onClick={() => handleRestoreStudent(student)}>
                          Restore
                        </button>
                        <button type="button" className="action-button danger" onClick={() => handlePermanentDelete(student)}>
                          Delete
                        </button>
                      </div>
                    )
                  }
                ]}
                rows={trash}
                getRowKey={(student) => student.student_id}
              />
            </Surface>
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className={`workspace-shell workspace-view-${activeView}`}>
      <aside className={`workspace-rail ${sidebarOpen ? "open" : ""}`}>
        <div className="rail-brand">
          <img className="rail-logo" src="/assets/pic_sjc_official_seal.jpg" alt="San Jose City Official Seal" />
          <div>
            <p>San Jose LGU</p>
            <strong>Scholarship System</strong>
          </div>
          <button type="button" className="rail-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>

        <div className="rail-user">
          <div className="rail-avatar">{initials(currentUser?.name || currentUser?.email || "SJ")}</div>
          <div className="rail-user-copy">
            <strong>{currentUser?.name || "Signed In User"}</strong>
            <span>{currentUser?.role || "Encoder"}</span>
            <span>{currentUser?.email}</span>
          </div>
        </div>

        <nav className="rail-nav" aria-label="Primary routes">
          {visibleNavItems.map((item) => {
            const Icon = navIcons[item.view];
            return (
              <button
                key={item.view}
                type="button"
                className={activeView === item.view ? "active" : ""}
                onClick={() => navigate(item.view)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="rail-program" aria-label="Lungsod Pag-asa scholarship identity">
          <img src="/assets/logo_with_mayor_name.jpg" alt="Mayor James Lungsod Pag-asa logo" />
          <span>Educational Assistance Program</span>
        </div>

        <button type="button" className="rail-signout" onClick={handleSignOut} disabled={isSigningOut}>
          <LogOut size={18} />
          <span>{isSigningOut ? "Signing Out..." : "Sign Out"}</span>
        </button>
      </aside>

      {sidebarOpen ? <button type="button" className="rail-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" /> : null}

      <main className="workspace-main">
        <header className="workspace-header">
          <button type="button" className="nav-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
            <Menu size={20} />
          </button>
          <div>
            <p>{labelForView(activeView)}</p>
            <h1>{labelForView(activeView)}</h1>
          </div>
          <div className="workspace-header-identity" aria-hidden="true">
            <img src="/assets/pic_sjc_official_seal.jpg" alt="" />
            <img src="/assets/logo_with_mayor_name.jpg" alt="" />
          </div>
        </header>

        {notice ? <div className={`notice-banner ${notice.type}`}>{notice.message}</div> : null}

        <section className="workspace-content">{renderCurrentView()}</section>
      </main>

      {actionsStudent ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setActionsStudentId("")}>
          <div
            className="action-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-actions-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
              <div className="action-dialog-header">
              <div>
                <p>Record Actions</p>
                <h2 id="record-actions-title">{actionsStudent.full_name}</h2>
                <span>{actionsStudent.student_id}</span>
              </div>
              <button type="button" className="icon-button" onClick={() => setActionsStudentId("")} aria-label="Close actions">
                <X size={18} />
              </button>
            </div>
            <div className="action-dialog-summary">
              <div>
                <span>Year Level</span>
                <strong>{yearLevelLabel(actionsStudent.year_level)}</strong>
              </div>
              <div>
                <span>Requirements</span>
                <strong>{requirementCompletionCount(getStudentRequirements(actionsStudent))}/{requirementFields.length}</strong>
              </div>
              <div>
                <span>Renewals</span>
                <strong>{renewalHistoryCount(actionsStudent)}</strong>
              </div>
              {isAdmin ? (
                <div>
                  <span>Payrolls</span>
                  <strong>{payrollSummaryByStudent.get(actionsStudent.student_id)?.count || 0}</strong>
                </div>
              ) : null}
              {isAdmin ? (
                <div>
                  <span>Latest</span>
                  <strong>
                    {formatDateTime(payrollSummaryByStudent.get(actionsStudent.student_id)?.latestCreatedAt)}
                  </strong>
                </div>
              ) : null}
            </div>
            <div className="dialog-history-panel">
              <div className="dialog-history-header">
                <span>Year Level History</span>
                <strong>{actionsStudent.year_level_history?.length || 0}</strong>
              </div>
              {actionsStudent.year_level_history?.length ? (
                <div className="history-list">
                  {actionsStudent.year_level_history
                    .slice()
                    .sort((left, right) => String(right.changed_at || "").localeCompare(String(left.changed_at || "")))
                    .map((entry, index) => (
                      <div key={`${entry.changed_at}-${index}`} className="history-row">
                        <div>
                          <strong>
                            {yearLevelLabel(entry.from_year_level)} to {yearLevelLabel(entry.to_year_level)}
                          </strong>
                          <span>{entry.reason || "Year level updated."}</span>
                        </div>
                        <div>
                          <span>{formatDateTime(entry.changed_at)}</span>
                          <span>{entry.changed_by_email || "Unknown user"}</span>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="empty-history">No year-level changes have been recorded yet.</div>
              )}
            </div>
            <div className="dialog-history-panel">
              <div className="dialog-history-header">
                <span>Current Requirements</span>
                <strong>{requirementCompletionCount(getStudentRequirements(actionsStudent))}</strong>
              </div>
              <div className="summary-token-list">
                {requirementFields.map((field) => (
                  <span key={field} className={`summary-token ${getStudentRequirements(actionsStudent)[field] ? "" : "summary-token-muted"}`}>
                    {REQUIREMENT_LABELS[field]}: {getStudentRequirements(actionsStudent)[field] ? "Ready" : "Missing"}
                  </span>
                ))}
              </div>
            </div>
            <div className="dialog-history-panel">
              <div className="dialog-history-header">
                <span>Renewal History</span>
                <strong>{actionsStudent.renewal_history?.length || 0}</strong>
              </div>
              {actionsStudent.renewal_history?.length ? (
                <div className="history-list">
                  {actionsStudent.renewal_history
                    .slice()
                    .sort((left, right) => String(right.changed_at || "").localeCompare(String(left.changed_at || "")))
                    .map((entry, index) => (
                      <div key={`${entry.changed_at}-${entry.status}-${index}`} className="history-row">
                        <div>
                          <strong>
                            {entry.status === "renewed" ? "Marked renewed" : "Moved to pending"}
                            {entry.school_year && entry.sem_number ? ` • ${semesterLabel(entry as Pick<CurrentCycleConfig, "school_year" | "sem_number">)}` : ""}
                          </strong>
                          <span>
                            {entry.reason || "Renewal state updated."}
                            {entry.requirements_snapshot
                              ? ` ${requirementCompletionCount(entry.requirements_snapshot)}/${requirementFields.length} requirements were ready at this step.`
                              : ""}
                            {entry.renewal_requirements_snapshot
                              ? ` ${renewalRequirementCompletionCount(entry.renewal_requirements_snapshot)}/${renewalRequirementFields.length} cycle renewal requirements were ready.`
                              : ""}
                          </span>
                        </div>
                        <div>
                          <span>{formatDateTime(entry.changed_at)}</span>
                          <span>{entry.changed_by_email || "Unknown user"}</span>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="empty-history">No renewal changes have been recorded yet.</div>
              )}
            </div>
            <div className="dialog-history-panel">
              <div className="dialog-history-header">
                <span>Semester Records</span>
                <strong>{getSemesterRecords(actionsStudent).length}</strong>
              </div>
              {getSemesterRecords(actionsStudent).length ? (
                <div className="history-list">
                  {getSemesterRecords(actionsStudent)
                    .slice()
                    .sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")))
                    .map((record) => (
                      <div key={record.cycle_key} className="history-row">
                        <div>
                          <strong>{semesterLabel(record)}</strong>
                          <span>
                            {record.payroll_status || record.renewal_status || "not_qualified"} • {renewalRequirementCompletionCount(getSemesterRenewalRequirements(record))}/{renewalRequirementFields.length} renewal requirements ready
                          </span>
                          {isAdmin && record.payroll_id ? <span>Payroll {record.payroll_id} • {record.payroll_record_type || "payroll"} • {formatDateTime(record.payrolled_at)}</span> : null}
                        </div>
                        <div>
                          <span>{formatDateTime(record.updated_at)}</span>
                          <span>{record.updated_by_email || "Unknown user"}</span>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="empty-history">No semester-bound renewal records have been created yet.</div>
              )}
            </div>
            <div className="dialog-action-grid">
              {isAdmin ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    fillStudentDraft(actionsStudent);
                    setActionsStudentId("");
                  }}
                >
                  Edit Student
                </button>
              ) : null}
              {isAdmin ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setPayrollHistoryStudentId(actionsStudent.student_id);
                    setActionsStudentId("");
                  }}
                >
                  Show Payroll History
                </button>
              ) : null}
              {isAdmin ? (
                <button
                  type="button"
                  className="secondary-button danger"
                  onClick={() => {
                    handleMoveToTrash(actionsStudent);
                    setActionsStudentId("");
                  }}
                >
                  Move To Trash
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {validationDialog ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setValidationDialog(null)}>
          <div
            className="action-dialog confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="validation-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="action-dialog-header">
              <div>
                <p>Missing Fields</p>
                <h2 id="validation-dialog-title">{validationDialog.title}</h2>
                <span>{validationDialog.message}</span>
              </div>
              <button type="button" className="icon-button" onClick={() => setValidationDialog(null)} aria-label="Close missing fields dialog">
                <X size={18} />
              </button>
            </div>
            <div className="dialog-history-panel">
              <div className="dialog-history-header">
                <span>Still Needed</span>
                <strong>{validationDialog.fields.length}</strong>
              </div>
              <div className="summary-token-list">
                {validationDialog.fields.map((field) => (
                  <span key={field} className="summary-token">{field}</span>
                ))}
              </div>
            </div>
            <div className="dialog-action-grid">
              <button type="button" className="primary-button" onClick={() => setValidationDialog(null)}>
                {validationDialog.acknowledgeLabel || "Okay"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {studentReviewOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setStudentReviewOpen(false)}>
          <div
            className="action-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-review-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="action-dialog-header">
              <div>
                <p>Student Summary</p>
                <h2 id="student-review-title">{studentEditId ? "Confirm Student Update" : "Confirm Student Registration"}</h2>
                <span>Review the details below before saving this student record.</span>
              </div>
              <button type="button" className="icon-button" onClick={() => setStudentReviewOpen(false)} aria-label="Close student summary">
                <X size={18} />
              </button>
            </div>
            <div className="dialog-history-panel">
              <div className="student-summary-grid">
                <SummaryItem label="Full Name" value={studentDraft.full_name} />
                <SummaryItem label="Student Number" value={studentDraft.student_number} />
                <SummaryItem label="Barangay" value={studentDraft.barangay} />
                <SummaryItem label="Address" value={studentDraft.address} />
                <SummaryItem label="School" value={studentDraft.school_address} />
                <SummaryItem label="Course" value={studentDraft.school_course} />
                <SummaryItem label="Year Level" value={studentDraft.year_level} />
                <SummaryItem label="Batch" value={studentDraft.batch} />
                <SummaryItem label="Phone" value={studentDraft.phone_number} />
                <SummaryItem label="For Renewal" value={studentDraft.for_renewal ? "Yes" : "No"} />
                <SummaryItem label="Requirements Ready" value={`${truthyDocumentLabels(studentDraft).length}/${requirementFields.length}`} />
              </div>
            </div>
            <div className="dialog-history-panel">
              <div className="dialog-history-header">
                <span>Ready Requirements</span>
                <strong>{truthyDocumentLabels(studentDraft).length}</strong>
              </div>
              {truthyDocumentLabels(studentDraft).length ? (
                <div className="summary-token-list">
                  {truthyDocumentLabels(studentDraft).map((label) => (
                    <span key={label} className="summary-token">{label}</span>
                  ))}
                </div>
              ) : (
                <div className="empty-history">No requirements are checked yet.</div>
              )}
            </div>
            <div className="dialog-action-grid">
              <button type="button" className="secondary-button" onClick={() => setStudentReviewOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setStudentReviewOpen(false);
                  void commitStudentSubmit();
                }}
                disabled={busyKey === "student-submit"}
              >
                {busyKey === "student-submit" ? "Saving..." : studentEditId ? "Confirm Update" : "Confirm Registration"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {renewalRecordStudent ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeRenewalRecord}>
          <div
            className="action-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="renewal-record-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="action-dialog-header">
              <div>
                <p>Cycle Renewal Record</p>
                <h2 id="renewal-record-title">{renewalRecordStudent.full_name}</h2>
                <span>{semesterLabel(activeRenewalRecordCycle)} • {activeRenewalRecordCycle.cycle_key}</span>
              </div>
              <button type="button" className="icon-button" onClick={closeRenewalRecord} aria-label="Close renewal record">
                <X size={18} />
              </button>
            </div>
            <div className="action-dialog-summary">
              <div>
                <span>Student ID</span>
                <strong>{renewalRecordStudent.student_id}</strong>
              </div>
              <div>
                <span>For Renewal</span>
                <strong>{isForRenewalDraft(renewalRecordStudent, renewalRecordDraft) ? "Yes" : "No"}</strong>
              </div>
              <div>
                <span>Profile Requirements</span>
                <strong>{requirementCompletionCount(getStudentRequirements(renewalRecordStudent))}/{requirementFields.length}</strong>
              </div>
              <div>
                <span>Initial Requirements</span>
                <strong>{requirementCompletionCount(renewalRecordDraft.initial_payout_requirements)}/{requirementFields.length}</strong>
              </div>
              <div>
                <span>Renewal</span>
                <strong>{renewalRequirementCompletionCount(renewalRecordDraft.renewal_requirements)}/{renewalRequirementFields.length}</strong>
              </div>
              {isAdmin ? (
                <div>
                  <span>Qualification</span>
                  <strong>
                    {qualificationLabelForDraft(
                      renewalRecordStudent,
                      getSemesterRecordForCycle(renewalRecordStudent, activeRenewalRecordCycle),
                      renewalRecordDraft
                    )}
                  </strong>
                </div>
              ) : null}
              <div>
                <span>School</span>
                <strong>{renewalRecordStudent.school_address || "Not set"}</strong>
              </div>
            </div>
            <div className="dialog-history-panel">
              <div className="dialog-history-header">
                <span>Renewal Status</span>
                <strong>{isForRenewalDraft(renewalRecordStudent, renewalRecordDraft) ? "Yes" : "No"}</strong>
              </div>
              {hasLockedPayrollHistory(renewalRecordStudent) ? (
                <div className="inline-warning">
                  Payroll history already places this student in the renewal group.
                </div>
              ) : null}
              <label className="document-check compact-check">
                <input
                  type="checkbox"
                  checked={isForRenewalDraft(renewalRecordStudent, renewalRecordDraft)}
                  disabled={hasLockedPayrollHistory(renewalRecordStudent)}
                  onChange={(event) => patchRenewalIndicator(event.currentTarget.checked)}
                />
                <span>For Renewal</span>
              </label>
            </div>
            <div className="dialog-history-panel">
              <div className="dialog-history-header">
                <span>Initial Requirements (Global)</span>
                <div className="dialog-history-actions">
                  <strong>{requirementCompletionCount(renewalRecordDraft.initial_payout_requirements)}</strong>
                  <button
                    type="button"
                    className="secondary-button compact"
                    onClick={() =>
                      setAllInitialPayoutRequirements(
                        requirementCompletionCount(renewalRecordDraft.initial_payout_requirements) !== requirementFields.length
                      )
                    }
                  >
                    {requirementCompletionCount(renewalRecordDraft.initial_payout_requirements) === requirementFields.length
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                </div>
              </div>
              <div className="inline-warning">
                These six initial requirements are saved on the student record and apply across all school years.
              </div>
              <div className="document-grid">
                {requirementFields.map((field) => (
                  <label key={field} className="document-check">
                    <input
                      type="checkbox"
                      checked={renewalRecordDraft.initial_payout_requirements[field]}
                      onChange={(event) => patchInitialPayoutRequirement(field, event.currentTarget.checked)}
                    />
                    <span>{REQUIREMENT_LABELS[field]}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="dialog-history-panel">
              <div className="dialog-history-header">
                <span>Renewal Requirements</span>
                <div className="dialog-history-actions">
                  <strong>{renewalRequirementCompletionCount(renewalRecordDraft.renewal_requirements)}</strong>
                  <button
                    type="button"
                    className="secondary-button compact"
                    disabled={renewalRecordDraft.payout_type === "initial" || !isForRenewalDraft(renewalRecordStudent, renewalRecordDraft)}
                    onClick={() =>
                      setAllRenewalRequirements(
                        renewalRequirementCompletionCount(renewalRecordDraft.renewal_requirements) !== renewalRequirementFields.length
                      )
                    }
                  >
                    {renewalRequirementCompletionCount(renewalRecordDraft.renewal_requirements) === renewalRequirementFields.length
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                </div>
              </div>
              {renewalRecordDraft.payout_type === "initial" || !isForRenewalDraft(renewalRecordStudent, renewalRecordDraft) ? (
                <div className="inline-warning">
                  {isAdmin
                    ? "Mark this student as for renewal before fulfilling renewal requirements."
                    : "Renewal requirements are skipped while this student is in the initial requirements cycle."}
                </div>
              ) : null}
              <div className="document-grid">
                {renewalRequirementFields.map((field) => (
                  <label key={field} className="document-check">
                    <input
                      type="checkbox"
                      checked={renewalRecordDraft.renewal_requirements[field]}
                      disabled={renewalRecordDraft.payout_type === "initial" || !isForRenewalDraft(renewalRecordStudent, renewalRecordDraft)}
                      onChange={(event) => patchRenewalRequirement(field, event.currentTarget.checked)}
                    />
                    <span>{RENEWAL_REQUIREMENT_LABELS[field]}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="dialog-history-panel">
              <div className="form-grid">
                <Field label="Notes" span="full">
                  <textarea
                    value={renewalRecordDraft.notes}
                    onChange={(event) => patchRenewalRecordDraft({ notes: event.currentTarget.value })}
                    placeholder="Optional notes for this semester record"
                  />
                </Field>
              </div>
            </div>
            <div className="dialog-action-grid">
              <button type="button" className="secondary-button" onClick={closeRenewalRecord}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleSaveRenewalRecord()}
                disabled={busyKey === `renewal-record-${renewalRecordStudent.student_id}`}
              >
                {busyKey === `renewal-record-${renewalRecordStudent.student_id}` ? "Saving..." : "Save Cycle Record"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmation ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => resolveConfirmation(false)}>
          <div
            className="action-dialog confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmation-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="action-dialog-header">
              <div>
                <p>{confirmation.danger ? "Careful Action" : "Confirm Action"}</p>
                <h2 id="confirmation-title">{confirmation.title}</h2>
                <span>{confirmation.message}</span>
              </div>
              <button type="button" className="icon-button" onClick={() => resolveConfirmation(false)} aria-label="Close confirmation">
                <X size={18} />
              </button>
            </div>
            <div className="dialog-action-grid">
              <button type="button" className="secondary-button" onClick={() => resolveConfirmation(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={confirmation.danger ? "secondary-button danger" : "primary-button"}
                onClick={() => resolveConfirmation(true)}
              >
                {confirmation.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isSigningOut ? (
        <div className="modal-backdrop" role="presentation">
          <div className="auth-progress-dialog" role="dialog" aria-modal="true" aria-labelledby="signout-progress-title">
            <div className="auth-progress-spinner" aria-hidden="true" />
            <div className="auth-progress-copy">
              <h2 id="signout-progress-title">Signing you out</h2>
              <p>Please wait while we close your session and refresh the page.</p>
            </div>
          </div>
        </div>
      ) : null}

      {busyKey && !isSigningOut ? (
        <div className="modal-backdrop" role="presentation">
          <div className="auth-progress-dialog" role="dialog" aria-modal="true" aria-labelledby="operation-progress-title">
            <div className="auth-progress-spinner" aria-hidden="true" />
            <div className="auth-progress-copy">
              <h2 id="operation-progress-title">Working on it</h2>
              <p>{busyMessage()}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="section-header-block">
      <p>{eyebrow}</p>
      <h2>{title}</h2>
      <span>{description}</span>
    </div>
  );
}

function Surface({
  title,
  subtitle,
  actions,
  children
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="surface">
      <div className="surface-header">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {actions}
      </div>
      <div className="surface-body">{children}</div>
    </section>
  );
}

function StatCard({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <article className="stat-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

function Field({
  label,
  children,
  span = "half"
}: {
  label: string;
  children: React.ReactNode;
  span?: "half" | "full";
}) {
  return (
    <label className={`field ${span === "full" ? "full" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function RequirementsChecklist({
  draft,
  onRequirementChange,
  onSetAllRequirements
}: {
  draft: StudentDraft;
  onRequirementChange: (field: StudentRequirementKey, checked: boolean) => void;
  onSetAllRequirements: (checked: boolean) => void;
}) {
  const completedCount = requirementCompletionCount(draft.requirements);
  const allRequirementsReady = completedCount === requirementFields.length;

  return (
    <div className="requirements-checklist">
      <div className="dialog-history-header requirements-checklist-header">
        <span>Requirements</span>
        <div className="dialog-history-actions">
          <strong>{completedCount}/{requirementFields.length}</strong>
          <button
            type="button"
            className="secondary-button compact"
            onClick={() => onSetAllRequirements(!allRequirementsReady)}
          >
            {allRequirementsReady ? "Deselect All" : "Select All"}
          </button>
        </div>
      </div>
      <div className="document-grid">
        {requirementFields.map((field) => (
          <label key={field} className="document-check">
            <input
              type="checkbox"
              checked={draft.requirements[field]}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                onRequirementChange(field, checked);
              }}
            />
            <span>{REQUIREMENT_LABELS[field]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function FilterBar({
  name,
  school,
  barangay,
  status,
  batch,
  batchOptions,
  showAdminStatusFilters,
  onNameChange,
  onSchoolChange,
  onBarangayChange,
  onStatusChange,
  onBatchChange
}: {
  name: string;
  school: string;
  barangay: string;
  status: string;
  batch: string;
  batchOptions: string[];
  showAdminStatusFilters: boolean;
  onNameChange: (value: string) => void;
  onSchoolChange: (value: string) => void;
  onBarangayChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onBatchChange: (value: string) => void;
}) {
  return (
    <div className="filter-strip">
      <label className="field">
        <span>Student Name</span>
        <input type="search" value={name} placeholder="Search name or ID" onChange={(event) => onNameChange(event.currentTarget.value)} />
      </label>
      <label className="field">
        <span>School</span>
        <input type="search" value={school} placeholder="Search school" onChange={(event) => onSchoolChange(event.currentTarget.value)} />
      </label>
      <label className="field">
        <span>Barangay</span>
        <input type="search" value={barangay} placeholder="Search barangay" onChange={(event) => onBarangayChange(event.currentTarget.value)} />
      </label>
      <label className="field">
        <span>Status</span>
        <select value={status} onChange={(event) => onStatusChange(event.currentTarget.value)}>
          <option value="all">All statuses</option>
          <option value="complete">Complete requirements</option>
          <option value="incomplete">Incomplete requirements</option>
          {showAdminStatusFilters ? (
            <>
              <option value="renewed">Payroll qualified</option>
              <option value="unrenewed">Not qualified</option>
              <option value="payrolled">Payroll prepared</option>
              <option value="unpayrolled">Payroll not prepared</option>
            </>
          ) : null}
        </select>
      </label>
      <label className="field">
        <span>Batch</span>
        <select value={batch} onChange={(event) => onBatchChange(event.currentTarget.value)}>
          <option value="all">All batches</option>
          {batchOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function OptionSurface({
  title,
  value,
  records,
  onChange,
  onSave,
  onDelete
}: {
  title: string;
  value: string;
  records: OptionRecord[];
  onChange: (value: string) => void;
  onSave: () => void;
  onDelete: (record: OptionRecord) => void;
}) {
  return (
    <Surface title={title} subtitle={`Manage ${title.toLowerCase()} used throughout the registry.`}>
      <div className="inline-form">
        <input value={value} onChange={(event) => onChange(event.currentTarget.value)} placeholder={`Add ${title.slice(0, -1).toLowerCase()}`} />
        <button type="button" className="primary-button" onClick={onSave}>
          Add
        </button>
      </div>
      <div className="token-list">
        {records.map((record) => (
          <div key={record.id} className="token-row">
            <span>{record.name}</span>
            <button type="button" className="action-button danger" onClick={() => onDelete(record)}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </Surface>
  );
}

function DataTable<T>({
  columns,
  rows,
  getRowKey,
  endReachedEnabled = false,
  onEndReached
}: {
  columns: Array<{
    key: string;
    label: string;
    render: (row: T) => React.ReactNode;
  }>;
  rows: T[];
  getRowKey: (row: T) => string;
  endReachedEnabled?: boolean;
  onEndReached?: () => void;
}) {
  const tableShellRef = useRef<HTMLDivElement | null>(null);
  const endReachedRef = useRef(onEndReached);
  const endReachedPendingRef = useRef(false);
  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    count: rows.length,
    estimateSize: () => dataTableEstimatedRowSize,
    getScrollElement: () => tableShellRef.current,
    getItemKey: (index) => {
      const row = rows[index];
      return row ? getRowKey(row) : index;
    },
    overscan: 8
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const firstVirtualRow = virtualRows[0];
  const lastVirtualRow = virtualRows[virtualRows.length - 1];
  const paddingTop = firstVirtualRow?.start ?? 0;
  const paddingBottom = lastVirtualRow
    ? Math.max(rowVirtualizer.getTotalSize() - lastVirtualRow.end, 0)
    : rowVirtualizer.getTotalSize();

  useEffect(() => {
    endReachedRef.current = onEndReached;
  }, [onEndReached]);

  useEffect(() => {
    endReachedPendingRef.current = false;
  }, [endReachedEnabled, rows.length]);

  function handleTableScroll(event: React.UIEvent<HTMLDivElement>) {
    if (!endReachedEnabled) return;

    const target = event.currentTarget;
    const remainingScroll = target.scrollHeight - target.scrollTop - target.clientHeight;

    if (remainingScroll > dataTableEstimatedRowSize * 2) {
      endReachedPendingRef.current = false;
      return;
    }

    if (endReachedPendingRef.current) return;

    endReachedPendingRef.current = true;
    endReachedRef.current?.();
  }

  return (
    <div ref={tableShellRef} className="table-shell" onScroll={handleTableScroll}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            <>
              {paddingTop > 0 ? (
                <tr className="virtual-spacer-row" aria-hidden="true">
                  <td colSpan={columns.length} style={{ height: paddingTop }} />
                </tr>
              ) : null}
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;

                return (
                  <tr
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                  >
                    {columns.map((column) => (
                      <td key={column.key}>{column.render(row)}</td>
                    ))}
                  </tr>
                );
              })}
              {paddingBottom > 0 ? (
                <tr className="virtual-spacer-row" aria-hidden="true">
                  <td colSpan={columns.length} style={{ height: paddingBottom }} />
                </tr>
              ) : null}
            </>
          ) : (
            <tr>
              <td colSpan={columns.length}>
                <div className="empty-state">No records available.</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StudentLoadingPanel({ detail = "Fetching the first batch of student records." }: { detail?: string }) {
  return (
    <div className="student-loading-panel" role="status" aria-live="polite">
      <div className="student-loading-spinner" aria-hidden="true" />
      <div>
        <strong>Loading students</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function StudentLoadControls({
  error,
  hasMore,
  isLoading,
  loadedCount,
  totalCount,
  onRetry
}: {
  error: string;
  hasMore: boolean;
  isLoading: boolean;
  loadedCount: number;
  totalCount: number;
  onRetry: () => void;
}) {
  const loadedSummary = loadedOfTotalText(loadedCount, totalCount, "student");

  if (error && loadedCount === 0) {
    return (
      <div className="student-load-footer error">
        <span>{error}</span>
        <button type="button" className="secondary-button" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`student-load-footer ${error ? "error" : ""}`}>
      <span>
        {error
          ? error
          : isLoading
            ? loadedCount || totalCount
              ? `Loading more students... ${loadedSummary}.`
              : "Loading students..."
          : hasMore
            ? `${loadedSummary}.`
            : `${loadedSummary}.`}
      </span>
    </div>
  );
}

function FlagPill({ active, label }: { active: boolean; label: string }) {
  return <span className={`flag-pill ${active ? "active" : ""}`}>{label}</span>;
}

function SummaryItem({ label, value }: { label: string; value?: string }) {
  return (
    <div className="summary-item">
      <span>{label}</span>
      <strong>{String(value || "").trim() || "Not provided"}</strong>
    </div>
  );
}
