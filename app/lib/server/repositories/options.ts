import "server-only";

import { getAdminDb } from "../firebase-admin";
import { COLLECTIONS, OPTION_COLLECTIONS, type OptionCollectionName } from "../../shared/collections";
import type { OptionRecord, SchoolCourseRecord } from "../../shared/options";
import { HttpError } from "../../shared/http";

const db = getAdminDb();

export function optionIdFromName(name: string) {
  const normalized = String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || crypto.randomUUID();
}

export function assertOptionCollection(value: string): OptionCollectionName {
  if (OPTION_COLLECTIONS.includes(value as OptionCollectionName)) {
    return value as OptionCollectionName;
  }
  throw new HttpError(404, "Unknown option collection.");
}

function itemSort(a: string, b: string) {
  return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
}

export async function listOptions(collectionName: OptionCollectionName) {
  const snapshot = await db.collection(collectionName).get();
  return snapshot.docs
    .map((docSnap) => ({
      id: String(docSnap.data().id ?? docSnap.id),
      name: String(docSnap.data().name ?? "").trim(),
      added_at: String(docSnap.data().added_at ?? "")
    }))
    .filter((item) => item.name)
    .sort((left, right) => itemSort(left.name, right.name)) as OptionRecord[];
}

export async function saveOption(collectionName: OptionCollectionName, input: Partial<OptionRecord>) {
  const name = String(input.name ?? "").trim();
  if (!name) {
    throw new HttpError(400, "Option name is required.");
  }

  const records = await listOptions(collectionName);
  const existingByName = records.find((item) => item.name.toLowerCase() === name.toLowerCase());
  const record: OptionRecord = {
    id: input.id || existingByName?.id || crypto.randomUUID(),
    name,
    added_at: input.added_at || new Date().toISOString()
  };

  await db.collection(collectionName).doc(record.id).set(record);
  return record;
}

export async function deleteOption(collectionName: OptionCollectionName, id: string) {
  await db.collection(collectionName).doc(id).delete();
  return { id, deleted: true };
}

export async function listSchoolCourses() {
  const snapshot = await db.collection(COLLECTIONS.schoolCourses).get();
  return snapshot.docs.map((docSnap) => docSnap.data() as SchoolCourseRecord);
}

export async function saveSchoolCourse(input: Partial<SchoolCourseRecord>) {
  const record: SchoolCourseRecord = {
    id: input.id || crypto.randomUUID(),
    school_name: String(input.school_name ?? "").trim(),
    course_name: String(input.course_name ?? "").trim(),
    added_at: input.added_at || new Date().toISOString()
  };

  if (!record.school_name || !record.course_name) {
    throw new HttpError(400, "School and course are required.");
  }

  await db.collection(COLLECTIONS.schoolCourses).doc(record.id).set(record);
  return record;
}

export async function deleteSchoolCourse(id: string) {
  await db.collection(COLLECTIONS.schoolCourses).doc(id).delete();
  return { id, deleted: true };
}
