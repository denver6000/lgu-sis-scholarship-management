import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appRoot, "../..");

function loadEnvFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) return;

  const { only = null, override = false } = options;
  const content = fs.readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = line.slice(0, equalsIndex).trim();
    if (only && !only.includes(key)) continue;
    if (!override && process.env[key]) continue;

    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function parseArgs() {
  const args = new Map();

  for (const arg of process.argv.slice(2)) {
    if (arg === "--commit") {
      args.set("commit", "true");
      continue;
    }
    if (!arg.startsWith("--")) continue;

    const [rawKey, ...valueParts] = arg.slice(2).split("=");
    args.set(rawKey, valueParts.length ? valueParts.join("=") : "true");
  }

  return {
    commit: args.get("commit") === "true",
    projectId: args.get("project") || "",
    serviceAccountPath: args.get("service-account") || "",
    useAdc: args.get("use-adc") === "true",
    backupPath: args.get("backup") || ""
  };
}

function resolveExistingPath(input) {
  if (!input) return "";

  const candidates = [
    path.resolve(process.cwd(), input),
    path.resolve(appRoot, input),
    path.resolve(repoRoot, input)
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || path.resolve(process.cwd(), input);
}

function hasInitialPayoutFlag(data) {
  return (
    data?.payrolled === true ||
    Boolean(data?.payrolled_at) ||
    (Array.isArray(data?.semester_records) &&
      data.semester_records.some((record) => (
        record?.payroll_status === "payrolled" ||
        record?.renewal_status === "payrolled" ||
        Boolean(record?.payroll_id || record?.payrolled_at)
      )))
  );
}

function sanitizeStudentId(docId, data) {
  return String(data.student_id || docId).trim();
}

function nextStudentData(docId, data, now) {
  return {
    ...data,
    student_id: sanitizeStudentId(docId, data),
    payrolled: true,
    payrolled_at: String(data.payrolled_at || now),
    deleted_at: String(data.deleted_at || "")
  };
}

function stableJson(value) {
  return JSON.stringify(value);
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function main() {
  const args = parseArgs();
  loadEnvFile(path.join(appRoot, ".env.production"));
  loadEnvFile(path.join(appRoot, ".env.local"), {
    only: ["FIREBASE_SERVICE_ACCOUNT_PATH", "GOOGLE_APPLICATION_CREDENTIALS"]
  });

  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Refusing to run while Firebase emulator environment variables are set.");
  }

  const configuredServiceAccountPath = args.useAdc
    ? ""
    : args.serviceAccountPath ||
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        "";
  const serviceAccountPath = resolveExistingPath(configuredServiceAccountPath);
  const serviceAccount = serviceAccountPath && fs.existsSync(serviceAccountPath)
    ? JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"))
    : null;
  const projectId = args.projectId || process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || serviceAccount?.project_id;

  if (!projectId) {
    throw new Error("Missing Firebase project id. Provide --project or NEXT_PUBLIC_FIREBASE_PROJECT_ID.");
  }

  if (!getApps().length) {
    initializeApp(serviceAccount
      ? {
          credential: cert(serviceAccount),
          projectId
        }
      : { projectId });
  }

  const db = getFirestore();
  console.log(`Project: ${projectId}`);
  console.log(`Credential mode: ${serviceAccount ? `service account (${serviceAccount.client_email})` : "application default credentials"}`);

  const now = new Date().toISOString();
  let studentsSnapshot;
  try {
    studentsSnapshot = await db.collection("students").get();
  } catch (error) {
    if (error?.code === 7) {
      throw new Error(
        "Firestore denied access to the students collection. Grant the credential Firestore read/write permissions for lgus-sjc-scholarship, then rerun this script."
      );
    }
    throw error;
  }
  const plannedUpdates = [];
  const backupRecords = [];
  let alreadyInitialPayrolled = 0;

  for (const doc of studentsSnapshot.docs) {
    const data = doc.data();
    const nextData = nextStudentData(doc.id, data, now);

    if (hasInitialPayoutFlag(data)) {
      alreadyInitialPayrolled += 1;
    }

    backupRecords.push({
      path: doc.ref.path,
      id: doc.id,
      data
    });

    if (stableJson(data) !== stableJson(nextData)) {
      plannedUpdates.push({
        ref: doc.ref,
        id: doc.id,
        before: data,
        after: nextData
      });
    }
  }

  const backupPath = args.backupPath
    ? path.resolve(process.cwd(), args.backupPath)
    : path.join(repoRoot, "outputs", `prod-students-completed-renewal-backup-${now.replace(/[:.]/g, "-")}.json`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        project_id: projectId,
        collection: "students",
        generated_at: now,
        dry_run: !args.commit,
        count: backupRecords.length,
        records: backupRecords
      },
      null,
      2
    )
  );

  console.log(`Students scanned: ${studentsSnapshot.size}`);
  console.log(`Students needing updates: ${plannedUpdates.length}`);
  console.log(`Already marked with an initial payout flag: ${alreadyInitialPayrolled}`);
  console.log(`Backup written: ${backupPath}`);

  if (!args.commit) {
    console.log("Dry run only. Re-run with --commit to write these changes.");
    return;
  }

  for (const updates of chunk(plannedUpdates, 450)) {
    const batch = db.batch();
    for (const update of updates) {
      batch.set(update.ref, update.after);
    }
    await batch.commit();
  }

  const operationLogRef = db.collection("operationLogs").doc(crypto.randomUUID());
  await operationLogRef.set({
    id: operationLogRef.id,
    action: "update",
    entity: "students",
    entity_id: "bulk-prod-initial-payout-flag",
    summary: `Marked ${plannedUpdates.length} production students as having received initial payout.`,
    metadata: {
      project_id: projectId,
      students_scanned: studentsSnapshot.size,
      students_updated: plannedUpdates.length,
      already_initial_payrolled: alreadyInitialPayrolled,
      backup_path: backupPath
    },
    actor_uid: "bulk-prod-migration",
    actor_email: "",
    actor_name: "Bulk Production Migration",
    actor_role: "admin",
    created_at: new Date().toISOString()
  });

  console.log(`Committed ${plannedUpdates.length} student update(s).`);
  console.log(`Operation log: ${operationLogRef.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
