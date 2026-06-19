export type PayoutRecord = {
  id: string;
  payroll_id?: string;
  student_id: string;
  student_name: string;
  student_number?: string;
  school?: string;
  course?: string;
  year_level?: string;
  batch?: string;
  type?: string;
  status?: string;
  amount?: number;
  payroll_group_count?: number;
  payroll_student_count?: number;
  notes?: string;
  migration_source?: string;
  migration_source_sheet?: string;
  migration_source_key?: string;
  created_at?: string;
};

export type PayoutRecordInput = Partial<PayoutRecord>;
