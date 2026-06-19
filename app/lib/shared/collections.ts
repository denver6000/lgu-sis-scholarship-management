export const COLLECTIONS = {
  students: "students",
  trash: "trash",
  payoutRecords: "payoutRecords",
  operationLogs: "operationLogs",
  systemConfig: "systemConfig",
  schoolCourses: "schoolCourses",
  barangays: "barangays",
  schools: "schools",
  courses: "courses",
  batches: "batches"
} as const;

export const OPTION_COLLECTIONS = [
  COLLECTIONS.barangays,
  COLLECTIONS.schools,
  COLLECTIONS.courses,
  COLLECTIONS.batches
] as const;

export type OptionCollectionName = typeof OPTION_COLLECTIONS[number];
