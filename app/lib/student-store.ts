"use client";

export {
  createManagedUser,
  createStudent,
  deleteOption,
  deleteManagedUser,
  deleteSchoolCourse,
  deleteTrashStudent,
  getCurrentCycleConfig,
  getPayoutRecords,
  getOperationLogs,
  getOptions,
  getSchoolCourses,
  getStudentPage,
  getStudents,
  getTrash,
  importBatchWorkbookOptions,
  listManagedUsers,
  moveStudentToTrash,
  restoreStudent,
  savePayoutRecord,
  saveOperationLog,
  saveCurrentCycleConfig,
  saveOption,
  saveSchoolCourse,
  seedFirestoreFromBundledJson,
  updateManagedUser,
  updateStudent
} from "./client/api-client";

export type { AppInitialData } from "./client/api-client";
export type { OperationLog } from "./shared/operation-log";
export type { PayoutRecord } from "./shared/payout-record";
export type { Student } from "./shared/student";

import {
  createStudent,
  deleteOption,
  getCurrentCycleConfig,
  getOptions,
  getPayoutRecords,
  getOperationLogs,
  getStudents,
  saveCurrentCycleConfig,
  saveOption,
  savePayoutRecord,
  saveOperationLog,
  seedFirestoreFromBundledJson
} from "./client/api-client";

export function storageMode() {
  return "Firestore via Next.js API";
}

export const saveStudent = createStudent;

export function optionIdFromName(name: string) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const getBarangays = () => getOptions("barangays");
export const getSchools = () => getOptions("schools");
export const getCourses = () => getOptions("courses");
export const getBatches = () => getOptions("batches");

export const saveBarangay = (input: { id?: string; name?: string } | string) =>
  saveOption("barangays", typeof input === "string" ? { id: optionIdFromName(input), name: input } : input);

export const saveSchool = (input: { id?: string; name?: string } | string) =>
  saveOption("schools", typeof input === "string" ? { id: optionIdFromName(input), name: input } : input);

export const saveCourse = (input: { id?: string; name?: string } | string) =>
  saveOption("courses", typeof input === "string" ? { id: optionIdFromName(input), name: input } : input);

export const saveBatch = (input: { id?: string; name?: string } | string) =>
  saveOption("batches", typeof input === "string" ? { id: optionIdFromName(input), name: input } : input);

export const deleteBarangay = (id: string) => deleteOption("barangays", id);
export const deleteSchool = (id: string) => deleteOption("schools", id);
export const deleteCourse = (id: string) => deleteOption("courses", id);
export const deleteBatch = (id: string) => deleteOption("batches", id);

export async function seedLocalFromBundledJson() {
  return seedFirestoreFromBundledJson();
}

export async function backfillPayoutRecordsFromLegacyStudents() {
  const [students, payoutRecords] = await Promise.all([getStudents(), getPayoutRecords()]);
  const existingKeys = new Set(
    payoutRecords.map((record) => `${String(record.student_id || "").trim()}:${String(record.type || "").trim()}`)
  );

  let created = 0;

  for (const student of students) {
    const studentId = String(student.student_id || "").trim();
    if (!studentId) continue;

    if (student.claimed && !existingKeys.has(`${studentId}:subsidy_claim`)) {
      await savePayoutRecord({
        student_id: studentId,
        student_name: student.full_name,
        student_number: student.student_number,
        school: student.school_address,
        course: student.school_course,
        year_level: student.year_level,
        batch: student.batch,
        type: "subsidy_claim",
        status: "recorded",
        amount: 5000,
        notes: "Backfilled from claimed student flag."
      });
      existingKeys.add(`${studentId}:subsidy_claim`);
      created += 1;
    }
  }

  return { created };
}
