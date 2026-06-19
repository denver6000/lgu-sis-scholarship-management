import "server-only";

import { COLLECTIONS } from "../../shared/collections";
import {
  cycleKeyFor,
  defaultCurrentCycleConfig,
  type CurrentCycleConfig
} from "../../shared/current-cycle";
import { getAdminDb } from "../firebase-admin";
import type { SessionUser } from "../../shared/user";

const db = getAdminDb();
const CURRENT_CYCLE_DOC_ID = "currentCycle";

function normalizeCurrentCycleConfig(value: unknown): CurrentCycleConfig {
  const source = value && typeof value === "object" ? (value as Partial<CurrentCycleConfig>) : {};
  const fallback = defaultCurrentCycleConfig();
  const schoolYear = String(source.school_year ?? fallback.school_year).trim() || fallback.school_year;
  const semNumberRaw = Number(source.sem_number ?? fallback.sem_number);
  const semNumber = Number.isFinite(semNumberRaw) && semNumberRaw > 0 ? semNumberRaw : fallback.sem_number;

  return {
    school_year: schoolYear,
    sem_number: semNumber,
    cycle_key: String(source.cycle_key ?? cycleKeyFor(schoolYear, semNumber)).trim() || cycleKeyFor(schoolYear, semNumber),
    status:
      source.status === "locked" || source.status === "archived" || source.status === "open"
        ? source.status
        : fallback.status,
    updated_at: String(source.updated_at ?? fallback.updated_at).trim() || fallback.updated_at,
    updated_by: String(source.updated_by ?? fallback.updated_by).trim()
  };
}

export async function getCurrentCycleConfig() {
  const snapshot = await db.collection(COLLECTIONS.systemConfig).doc(CURRENT_CYCLE_DOC_ID).get();
  if (!snapshot.exists) {
    return defaultCurrentCycleConfig();
  }

  return normalizeCurrentCycleConfig(snapshot.data());
}

export async function saveCurrentCycleConfig(
  input: Partial<Pick<CurrentCycleConfig, "school_year" | "sem_number" | "status">>,
  actor: SessionUser
) {
  const current = await getCurrentCycleConfig();
  const schoolYear = String(input.school_year ?? current.school_year).trim() || current.school_year;
  const semNumberRaw = Number(input.sem_number ?? current.sem_number);
  const semNumber = Number.isFinite(semNumberRaw) && semNumberRaw > 0 ? semNumberRaw : current.sem_number;
  const status =
    input.status === "locked" || input.status === "archived" || input.status === "open"
      ? input.status
      : current.status;

  const nextConfig = normalizeCurrentCycleConfig({
    school_year: schoolYear,
    sem_number: semNumber,
    cycle_key: cycleKeyFor(schoolYear, semNumber),
    status,
    updated_at: new Date().toISOString(),
    updated_by: actor.uid
  });

  await db.collection(COLLECTIONS.systemConfig).doc(CURRENT_CYCLE_DOC_ID).set(nextConfig);
  return nextConfig;
}
