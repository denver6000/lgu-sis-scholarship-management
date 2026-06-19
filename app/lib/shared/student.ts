export const INITIAL_PAYOUT_REQUIREMENT_KEYS = [
  "certificate_of_residency",
  "pagpapatunay_form",
  "picture_of_the_house",
  "good_moral_certificate",
  "original_certificate_of_grades",
  "proof_of_enrollment"
] as const;

export const REQUIREMENT_KEYS = INITIAL_PAYOUT_REQUIREMENT_KEYS;

export type StudentRequirementKey = typeof INITIAL_PAYOUT_REQUIREMENT_KEYS[number];

export type StudentRequirementMap = Record<StudentRequirementKey, boolean>;

export const REQUIREMENT_LABELS: Record<StudentRequirementKey, string> = {
  certificate_of_residency: "Certificate of Residency",
  pagpapatunay_form: "Pagpapatunay Form",
  picture_of_the_house: "Picture of the House",
  good_moral_certificate: "Good Moral Certificate",
  original_certificate_of_grades: "Original Certificate of Grades",
  proof_of_enrollment: "Proof of Enrollment"
};

export const RENEWAL_REQUIREMENT_KEYS = [
  "liquidation",
  "proof_of_enrollment",
  "latest_grades"
] as const;

export type StudentRenewalRequirementKey = typeof RENEWAL_REQUIREMENT_KEYS[number];

export type StudentRenewalRequirementMap = Record<StudentRenewalRequirementKey, boolean>;

export const RENEWAL_REQUIREMENT_LABELS: Record<StudentRenewalRequirementKey, string> = {
  liquidation: "Liquidation",
  proof_of_enrollment: "Proof of Enrollment",
  latest_grades: "Latest Grades"
};

export type StudentPayrollStatus = "not_qualified" | "qualified" | "payrolled";
export type StudentPayoutType = "initial" | "renewal";
export type LegacyStudentRenewalStatus = "pending" | "renewed" | "payrolled";

export type StudentSemesterRecord = {
  school_year: string;
  sem_number: number;
  cycle_key: string;
  payout_type: StudentPayoutType;
  payroll_status: StudentPayrollStatus;
  renewal_status?: LegacyStudentRenewalStatus;
  payroll_id?: string;
  payroll_record_type?: string;
  payrolled_at?: string;
  payrolled_by_uid?: string;
  payrolled_by_email?: string;
  initial_payout_requirements: StudentRequirementMap;
  renewal_requirements: StudentRenewalRequirementMap;
  requirements?: StudentRenewalRequirementMap;
  created_at: string;
  updated_at: string;
  updated_by_uid?: string;
  updated_by_email?: string;
  notes?: string;
};

export type StudentYearLevelHistoryEntry = {
  from_year_level: string;
  to_year_level: string;
  changed_at: string;
  changed_by_uid?: string;
  changed_by_email?: string;
  reason?: string;
};

export type StudentRenewalHistoryEntry = {
  status: "renewed" | "pending";
  changed_at: string;
  school_year?: string;
  sem_number?: number;
  cycle_key?: string;
  requirements_snapshot?: StudentRequirementMap;
  renewal_requirements_snapshot?: StudentRenewalRequirementMap;
  changed_by_uid?: string;
  changed_by_email?: string;
  reason?: string;
};

export type Student = {
  student_id: string;
  full_name: string;
  student_number?: string;
  barangay?: string;
  address?: string;
  school_address?: string;
  phone_number?: string;
  school_course?: string;
  year_level?: string;
  year_level_history?: StudentYearLevelHistoryEntry[];
  batch?: string;
  requirements?: StudentRequirementMap;
  semester_records?: StudentSemesterRecord[];
  certificate_of_residency?: boolean;
  pagpapatunay_form?: boolean;
  picture_of_the_house?: boolean;
  good_moral_certificate?: boolean;
  original_certificate_of_grades?: boolean;
  proof_of_enrollment?: boolean;
  school_id?: boolean;
  claimed?: boolean;
  claimed_at?: string;
  renewed?: boolean;
  renewed_at?: string;
  renewal_history?: StudentRenewalHistoryEntry[];
  payrolled?: boolean;
  payrolled_at?: string;
  migration_source?: string;
  migration_source_sheet?: string;
  migration_source_row?: string;
  migration_source_no?: string;
  migration_source_key?: string;
  migration_group?: string;
  created_at?: string;
  deleted_at?: string;
};

export type StudentInput = Partial<Student>;
