import type { CurrentCycleConfig } from "../shared/current-cycle";
import {
  REQUIREMENT_KEYS,
  RENEWAL_REQUIREMENT_KEYS,
  type Student,
  type StudentPayrollStatus,
  type StudentPayoutType,
  type StudentRequirementMap,
  type StudentRenewalRequirementMap,
  type StudentSemesterRecord
} from "../shared/student";

export type StudentDocShape = Student;

export type StudentTimelineDebugRow = {
  source: "requirements" | "payrolls";
  selected_cycle: string;
  student_id: string;
  full_name: string;
  school: string;
  top_level_payrolled: boolean;
  top_level_renewed: boolean;
  permanent_payrolled: boolean;
  lifecycle: StudentPayoutType;
  selected_cycle_payroll_status: string;
  selected_cycle_renewal_status: string;
  selected_cycle_payrolled: boolean;
  selected_cycle_record_payout_type: string;
  global_initial_ready: string;
  selected_cycle_initial_snapshot_ready: string;
  selected_cycle_renewal_ready: string;
  semester_record_count: number;
};

function countReadyRequirements(requirements?: Partial<StudentRequirementMap>) {
  return REQUIREMENT_KEYS.filter((key) => requirements?.[key] === true).length;
}

function countReadyRenewalRequirements(requirements?: Partial<StudentRenewalRequirementMap>) {
  return RENEWAL_REQUIREMENT_KEYS.filter((key) => requirements?.[key] === true).length;
}

function emptyInitialRequirementMap(): StudentRequirementMap {
  return Object.fromEntries(REQUIREMENT_KEYS.map((key) => [key, false])) as StudentRequirementMap;
}

function emptyRenewalRequirementMap(): StudentRenewalRequirementMap {
  return Object.fromEntries(RENEWAL_REQUIREMENT_KEYS.map((key) => [key, false])) as StudentRenewalRequirementMap;
}

function mergeInitialRequirementMaps(...maps: Array<Partial<StudentRequirementMap> | undefined>) {
  const requirements = emptyInitialRequirementMap();

  for (const map of maps) {
    for (const key of REQUIREMENT_KEYS) {
      requirements[key] = requirements[key] || map?.[key] === true;
    }
  }

  return requirements;
}

function renewalRequirementMapFromAny(value: unknown): StudentRenewalRequirementMap {
  const requirements = emptyRenewalRequirementMap();
  const source =
    value && typeof value === "object"
      ? (value as Partial<Record<keyof StudentRenewalRequirementMap, unknown>>)
      : {};

  for (const key of RENEWAL_REQUIREMENT_KEYS) {
    requirements[key] = source[key] === true;
  }

  return requirements;
}

function initialRequirementMapComplete(requirements: StudentRequirementMap) {
  return REQUIREMENT_KEYS.every((key) => requirements[key]);
}

function renewalRequirementMapComplete(requirements: StudentRenewalRequirementMap) {
  return RENEWAL_REQUIREMENT_KEYS.every((key) => requirements[key]);
}

export class StudentModel {
  constructor(readonly doc: StudentDocShape) {}

  get semesterRecords() {
    return Array.isArray(this.doc.semester_records) ? this.doc.semester_records : [];
  }

  get topLevelPayrolled() {
    return this.doc.payrolled === true || Boolean(this.doc.payrolled_at);
  }

  get topLevelRenewed() {
    return this.doc.renewed === true || Boolean(this.doc.renewed_at);
  }

  get permanentPayrolled() {
    return (
      this.topLevelPayrolled ||
      this.hasPayrollRecord
    );
  }

  get hasPayrollRecord() {
    return this.semesterRecords.some(
      (record) =>
        record.payroll_status === "payrolled" ||
        record.renewal_status === "payrolled" ||
        Boolean(record.payroll_id || record.payrolled_at)
    );
  }

  get lifecycle(): StudentPayoutType {
    return this.permanentPayrolled ? "renewal" : "initial";
  }

  get globalInitialRequirements() {
    const globalRequirements = mergeInitialRequirementMaps(
      this.doc.requirements,
      Object.fromEntries(REQUIREMENT_KEYS.map((key) => [key, this.doc[key] === true])) as StudentRequirementMap
    );
    return countReadyRequirements(globalRequirements) > 0
      ? globalRequirements
      : mergeInitialRequirementMaps(...this.semesterRecords.map((record) => record.initial_payout_requirements));
  }

  recordForCycle(cycle: Pick<CurrentCycleConfig, "cycle_key">) {
    return this.semesterRecords.find((record) => record.cycle_key === cycle.cycle_key) || null;
  }

  cyclePayoutType(cycle: Pick<CurrentCycleConfig, "cycle_key">): StudentPayoutType {
    const record = this.recordForCycle(cycle);
    if (record?.payout_type === "initial" || record?.payout_type === "renewal") return record.payout_type;
    return this.lifecycle;
  }

  cycleRenewalRequirements(cycle: Pick<CurrentCycleConfig, "cycle_key">) {
    const record = this.recordForCycle(cycle);
    return renewalRequirementMapFromAny(record?.renewal_requirements ?? record?.requirements);
  }

  get initialPayoutQualified() {
    return initialRequirementMapComplete(this.globalInitialRequirements);
  }

  cycleRenewalPayoutQualified(cycle: Pick<CurrentCycleConfig, "cycle_key">) {
    return renewalRequirementMapComplete(this.cycleRenewalRequirements(cycle));
  }

  isQualifiedForPayrollCycle(cycle: Pick<CurrentCycleConfig, "cycle_key">) {
    if (this.isPayrolledForCycle(cycle)) return false;
    return this.cyclePayoutType(cycle) === "renewal"
      ? this.permanentPayrolled && this.cycleRenewalPayoutQualified(cycle)
      : this.initialPayoutQualified;
  }

  cyclePayrollStatus(cycle: Pick<CurrentCycleConfig, "cycle_key">): StudentPayrollStatus {
    if (this.isPayrolledForCycle(cycle)) return "payrolled";
    return this.isQualifiedForPayrollCycle(cycle) ? "qualified" : "not_qualified";
  }

  isPayrolledForCycle(cycle: Pick<CurrentCycleConfig, "cycle_key">) {
    const record = this.recordForCycle(cycle);
    return (
      record?.payroll_status === "payrolled" ||
      record?.renewal_status === "payrolled" ||
      Boolean(record?.payroll_id || record?.payrolled_at)
    );
  }

  isPayrollCandidateForCycle(cycle: Pick<CurrentCycleConfig, "cycle_key">) {
    return !this.isPayrolledForCycle(cycle) && this.isQualifiedForPayrollCycle(cycle);
  }

  qualificationLabel(cycle: Pick<CurrentCycleConfig, "cycle_key">) {
    const status = this.cyclePayrollStatus(cycle);
    if (status === "payrolled") return "payrolled";
    if (this.cyclePayoutType(cycle) === "renewal") {
      if (!this.permanentPayrolled) return "needs initial payroll";
      return this.cycleRenewalPayoutQualified(cycle)
        ? "renewal qualified"
        : "missing renewal requirements";
    }
    return this.initialPayoutQualified ? "initial payout qualified" : "missing initial requirements";
  }

  debugRow(source: StudentTimelineDebugRow["source"], cycle: CurrentCycleConfig): StudentTimelineDebugRow {
    const record = this.recordForCycle(cycle);

    return {
      source,
      selected_cycle: cycle.cycle_key,
      student_id: this.doc.student_id,
      full_name: this.doc.full_name,
      school: this.doc.school_address || "",
      top_level_payrolled: this.topLevelPayrolled,
      top_level_renewed: this.topLevelRenewed,
      permanent_payrolled: this.permanentPayrolled,
      lifecycle: this.lifecycle,
      selected_cycle_payroll_status: this.cyclePayrollStatus(cycle),
      selected_cycle_renewal_status: record?.renewal_status || "",
      selected_cycle_payrolled: this.isPayrolledForCycle(cycle),
      selected_cycle_record_payout_type: record?.payout_type || this.cyclePayoutType(cycle),
      global_initial_ready: `${countReadyRequirements(this.globalInitialRequirements)}/${REQUIREMENT_KEYS.length}`,
      selected_cycle_initial_snapshot_ready: `${countReadyRequirements(record?.initial_payout_requirements)}/${REQUIREMENT_KEYS.length}`,
      selected_cycle_renewal_ready: `${countReadyRenewalRequirements(this.cycleRenewalRequirements(cycle))}/${RENEWAL_REQUIREMENT_KEYS.length}`,
      semester_record_count: this.semesterRecords.length
    };
  }
}

export function studentModel(student: StudentDocShape) {
  return new StudentModel(student);
}

export function hasPermanentPayroll(student: StudentDocShape) {
  return studentModel(student).permanentPayrolled;
}

export function isStudentForRenewal(student: StudentDocShape) {
  return studentModel(student).permanentPayrolled;
}

export function hasStudentPayrollRecord(student: StudentDocShape) {
  return studentModel(student).hasPayrollRecord;
}

export function lifecyclePayoutType(student: StudentDocShape): StudentPayoutType {
  return studentModel(student).lifecycle;
}

export function getStudentInitialPayoutRequirements(student: StudentDocShape) {
  return studentModel(student).globalInitialRequirements;
}

export function getStudentSemesterRecordForCycle(
  student: StudentDocShape,
  cycle: Pick<CurrentCycleConfig, "cycle_key">
) {
  return studentModel(student).recordForCycle(cycle);
}

export function getStudentCycleRenewalRequirements(
  student: StudentDocShape,
  cycle: Pick<CurrentCycleConfig, "cycle_key">
) {
  return studentModel(student).cycleRenewalRequirements(cycle);
}

export function getStudentCyclePayoutType(
  student: StudentDocShape,
  cycle: Pick<CurrentCycleConfig, "cycle_key">
) {
  return studentModel(student).cyclePayoutType(cycle);
}

export function getStudentCyclePayrollStatus(
  student: StudentDocShape,
  cycle: Pick<CurrentCycleConfig, "cycle_key">
) {
  return studentModel(student).cyclePayrollStatus(cycle);
}

export function isStudentInitialPayoutQualified(student: StudentDocShape) {
  return studentModel(student).initialPayoutQualified;
}

export function isStudentRenewalPayoutQualifiedForCycle(
  student: StudentDocShape,
  cycle: Pick<CurrentCycleConfig, "cycle_key">
) {
  return studentModel(student).cycleRenewalPayoutQualified(cycle);
}

export function isStudentQualifiedForPayrollCycle(
  student: StudentDocShape,
  cycle: Pick<CurrentCycleConfig, "cycle_key">
) {
  return studentModel(student).isQualifiedForPayrollCycle(cycle);
}

export function isStudentPayrolledForCycle(
  student: StudentDocShape,
  cycle: Pick<CurrentCycleConfig, "cycle_key">
) {
  return studentModel(student).isPayrolledForCycle(cycle);
}

export function isStudentPayrollCandidateForCycle(
  student: StudentDocShape,
  cycle: Pick<CurrentCycleConfig, "cycle_key">
) {
  return studentModel(student).isPayrollCandidateForCycle(cycle);
}

export function studentPayrollQualificationLabel(
  student: StudentDocShape,
  cycle: Pick<CurrentCycleConfig, "cycle_key">
) {
  return studentModel(student).qualificationLabel(cycle);
}

export function buildStudentTimelineDebugRows(
  source: StudentTimelineDebugRow["source"],
  cycle: CurrentCycleConfig,
  students: StudentDocShape[]
) {
  return students.map((student) => studentModel(student).debugRow(source, cycle));
}
