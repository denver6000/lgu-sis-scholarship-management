import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { getAdminDb } from "../firebase-admin";
import { COLLECTIONS } from "../../shared/collections";
import { optionIdFromName } from "../repositories/options";
import type { Student } from "../../shared/student";
import type { SchoolCourseRecord } from "../../shared/options";

const db = getAdminDb();

async function readPublicJson<T>(filename: string) {
  const filePath = path.join(process.cwd(), "public", "data", filename);
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

export async function seedFirestoreFromBundledJson() {
  const [students, trash, schoolCourses] = await Promise.all([
    readPublicJson<Student[]>("student_data.seed.json"),
    readPublicJson<Student[]>("trash_data.seed.json"),
    readPublicJson<SchoolCourseRecord[]>("schools_courses.seed.json")
  ]);

  for (const student of students) {
    const id = student.student_id || crypto.randomUUID();
    await db.collection(COLLECTIONS.students).doc(id).set({ ...student, student_id: id });
  }

  for (const item of trash) {
    const id = item.student_id || crypto.randomUUID();
    await db.collection(COLLECTIONS.trash).doc(id).set({ ...item, student_id: id });
  }

  for (const item of schoolCourses) {
    const id = item.id || crypto.randomUUID();
    await db.collection(COLLECTIONS.schoolCourses).doc(id).set({ ...item, id });
  }

  const schoolNames = [...new Set(schoolCourses.map((item) => String(item.school_name ?? "").trim()).filter(Boolean))];
  const courseNames = [...new Set(schoolCourses.map((item) => String(item.course_name ?? "").trim()).filter(Boolean))];

  for (const name of schoolNames) {
    await db.collection(COLLECTIONS.schools).doc(optionIdFromName(name)).set({
      id: optionIdFromName(name),
      name,
      added_at: new Date().toISOString()
    });
  }

  for (const name of courseNames) {
    await db.collection(COLLECTIONS.courses).doc(optionIdFromName(name)).set({
      id: optionIdFromName(name),
      name,
      added_at: new Date().toISOString()
    });
  }

  return {
    students: students.length,
    trash: trash.length,
    schoolCourses: schoolCourses.length,
    payoutRecords: 0,
    schools: schoolNames.length,
    courses: courseNames.length
  };
}
