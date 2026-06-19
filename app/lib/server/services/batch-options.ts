import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { COLLECTIONS } from "../../shared/collections";
import { listOptions, saveOption } from "../repositories/options";

const BATCH_WORKBOOK_SOURCE = "BATCH 1-7.xlsx";

type BatchOptionSeed = {
  barangays?: Array<{ id?: string; name?: string }>;
  schools?: Array<{ id?: string; name?: string }>;
  batches?: Array<{ id?: string; name?: string }>;
};

async function readBatchOptionSeed() {
  const filePath = path.join(process.cwd(), "public", "data", "batch_options.seed.json");
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content) as BatchOptionSeed;
}

async function importCollection(
  collectionName: typeof COLLECTIONS.barangays | typeof COLLECTIONS.schools | typeof COLLECTIONS.batches,
  incomingRecords: Array<{ id?: string; name?: string }>
) {
  const currentRecords = await listOptions(collectionName);
  const existingIds = new Set(currentRecords.map((record) => record.id));
  const existingNames = new Set(currentRecords.map((record) => record.name.toLowerCase()));

  let created = 0;

  for (const record of incomingRecords) {
    const id = String(record.id ?? "").trim();
    const name = String(record.name ?? "").trim();
    if (!id || !name) continue;
    if (existingIds.has(id) || existingNames.has(name.toLowerCase())) continue;
    await saveOption(collectionName, { id, name });
    created += 1;
  }

  return created;
}

export async function importBatchWorkbookOptions() {
  const options = await readBatchOptionSeed();
  const barangaysCreated = await importCollection(COLLECTIONS.barangays, options.barangays || []);
  const schoolsCreated = await importCollection(COLLECTIONS.schools, options.schools || []);
  const batchesCreated = await importCollection(COLLECTIONS.batches, options.batches || []);

  return {
    skipped: !barangaysCreated && !schoolsCreated && !batchesCreated,
    barangaysCreated,
    schoolsCreated,
    batchesCreated,
    source: BATCH_WORKBOOK_SOURCE
  };
}
