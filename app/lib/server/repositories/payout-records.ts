import "server-only";

import { getAdminDb } from "../firebase-admin";
import { COLLECTIONS } from "../../shared/collections";
import type { PayoutRecord, PayoutRecordInput } from "../../shared/payout-record";
import { HttpError } from "../../shared/http";

const db = getAdminDb();

function normalizeId(value: unknown) {
  return String(value ?? "").trim();
}

export async function listPayoutRecords() {
  const snapshot = await db.collection(COLLECTIONS.payoutRecords).get();
  return snapshot.docs.map((docSnap) => docSnap.data() as PayoutRecord);
}

export async function savePayoutRecord(input: PayoutRecordInput) {
  const record: PayoutRecord = {
    id: input.id || crypto.randomUUID(),
    payroll_id: normalizeId(input.payroll_id),
    student_id: normalizeId(input.student_id),
    student_name: normalizeId(input.student_name),
    student_number: normalizeId(input.student_number),
    school: normalizeId(input.school),
    course: normalizeId(input.course),
    year_level: normalizeId(input.year_level),
    batch: normalizeId(input.batch),
    type: normalizeId(input.type) || "subsidy_claim",
    status: normalizeId(input.status) || "recorded",
    amount: Number(input.amount || 0),
    payroll_group_count: Number(input.payroll_group_count || 0),
    payroll_student_count: Number(input.payroll_student_count || 0),
    notes: normalizeId(input.notes),
    migration_source: normalizeId(input.migration_source),
    migration_source_sheet: normalizeId(input.migration_source_sheet),
    migration_source_key: normalizeId(input.migration_source_key),
    created_at: input.created_at || new Date().toISOString()
  };

  if (!record.student_id || !record.student_name) {
    throw new HttpError(400, "Student ID and student name are required.");
  }

  await db.collection(COLLECTIONS.payoutRecords).doc(record.id).set(record);
  return record;
}

export async function deletePayoutRecord(recordId: string) {
  await db.collection(COLLECTIONS.payoutRecords).doc(recordId).delete();
  return { recordId, deleted: true };
}
