import "server-only";

import { getAdminDb } from "../firebase-admin";
import { COLLECTIONS } from "../../shared/collections";
import type { OperationLog, OperationLogInput } from "../../shared/operation-log";
import type { SessionUser } from "../../shared/user";
import { HttpError } from "../../shared/http";

const db = getAdminDb();

function cleanMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export async function listOperationLogs(limit = 50) {
  const snapshot = await db
    .collection(COLLECTIONS.operationLogs)
    .orderBy("created_at", "desc")
    .limit(Math.max(1, Math.min(100, limit)))
    .get();

  return snapshot.docs.map((docSnap) => docSnap.data() as OperationLog);
}

export async function createOperationLog(input: OperationLogInput, actor: SessionUser) {
  const action = input.action;
  if (!["insert", "update", "delete", "restore", "export"].includes(action)) {
    throw new HttpError(400, "Operation action is invalid.");
  }

  const entity = String(input.entity || "").trim();
  const summary = String(input.summary || "").trim();
  if (!entity || !summary) {
    throw new HttpError(400, "Operation entity and summary are required.");
  }

  const record: OperationLog = {
    id: crypto.randomUUID(),
    action,
    entity,
    entity_id: String(input.entity_id || "").trim(),
    summary,
    metadata: cleanMetadata(input.metadata),
    actor_uid: actor.uid,
    actor_email: actor.email || "",
    actor_name: actor.name || actor.email || "Signed In User",
    actor_role: actor.claims.role || actor.role || "",
    created_at: new Date().toISOString()
  };

  await db.collection(COLLECTIONS.operationLogs).doc(record.id).set(record);
  return record;
}
