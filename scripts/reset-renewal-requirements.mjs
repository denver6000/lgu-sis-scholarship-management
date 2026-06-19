import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appRoot, "../..");
const renewalRequirementKeys = ["liquidation", "proof_of_enrollment", "latest_grades"];
const emptyRenewalRequirements = Object.fromEntries(renewalRequirementKeys.map((key) => [key, false]));

function loadEnvFile(filePath, options = {}) {
  if (!filePath || !fs.existsSync(filePath)) return;

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

    process.env[key] = value.replace(/\\n/g, "\n");
  }
}

function parseArgs() {
  const args = new Map();

  for (const arg of process.argv.slice(2)) {
    if (arg === "--apply" || arg === "--commit") {
      args.set("apply", "true");
      continue;
    }
    if (!arg.startsWith("--")) continue;

    const [rawKey, ...valueParts] = arg.slice(2).split("=");
    args.set(rawKey, valueParts.length ? valueParts.join("=") : "true");
  }

  return {
    apply: args.get("apply") === "true",
    backupPath: args.get("backup") || "",
    databaseId: args.get("database") || "",
    envFile: args.get("env") || "",
    projectId: args.get("project") || "",
    resetUnpayrolledStatus: args.get("reset-unpayrolled-status") === "true",
    serviceAccountPath: args.get("service-account") || "",
    useAdc: args.get("use-adc") === "true"
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

function normalizeSemNumber(value) {
  const semNumber = Number(value);
  return Number.isFinite(semNumber) ? semNumber : value;
}

function matchesOptionalScope(record, args) {
  const schoolYear = String(args.schoolYear || "").trim();
  const semNumber = String(args.semNumber || "").trim();

  if (schoolYear && String(record?.school_year || "").trim() !== schoolYear) return false;
  if (semNumber && String(normalizeSemNumber(record?.sem_number ?? "")).trim() !== semNumber) return false;
  return true;
}

function shouldKeepPayrolledStatus(record) {
  return (
    record?.payroll_status === "payrolled" ||
    record?.renewal_status === "payrolled" ||
    Boolean(record?.payroll_id || record?.payrolled_at)
  );
}

function nextSemesterRecord(record, args) {
  const nextRecord = {
    ...record,
    renewal_requirements: { ...emptyRenewalRequirements },
    requirements: { ...emptyRenewalRequirements }
  };

  if (args.resetUnpayrolledStatus && !shouldKeepPayrolledStatus(record)) {
    nextRecord.payroll_status = "not_qualified";
    nextRecord.renewal_status = "pending";
  }

  return nextRecord;
}

function nextStudentData(docId, data, args, now) {
  const semesterRecords = Array.isArray(data?.semester_records) ? data.semester_records : [];
  let touchedRecords = 0;
  const nextSemesterRecords = semesterRecords.map((record) => {
    if (!matchesOptionalScope(record, args)) return record;

    const nextRecord = nextSemesterRecord(record, args);
    if (stableJson(record) !== stableJson(nextRecord)) touchedRecords += 1;
    return nextRecord;
  });

  if (!touchedRecords) {
    return { nextData: data, touchedRecords };
  }

  return {
    touchedRecords,
    nextData: {
      ...data,
      student_id: String(data?.student_id || docId).trim(),
      semester_records: nextSemesterRecords,
      updated_at: now
    }
  };
}

function initializeAdmin(args) {
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
  const projectId =
    args.projectId ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    serviceAccount?.project_id;

  if (!projectId) {
    throw new Error("Missing Firebase project id. Provide --project or NEXT_PUBLIC_FIREBASE_PROJECT_ID.");
  }

  const app = getApps().length
    ? getApps()[0]
    : initializeApp(serviceAccount
      ? {
          credential: cert(serviceAccount),
          projectId
        }
      : { projectId });

  const databaseId =
    args.databaseId ||
    process.env.FIRESTORE_DATABASE_ID ||
    process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID ||
    "(default)";
  const db = databaseId === "(default)" ? getFirestore(app) : getFirestore(app, databaseId);

  return {
    credentialLabel: serviceAccount ? `service account (${serviceAccount.client_email})` : "application default credentials",
    databaseId,
    db,
    projectId
  };
}

async function main() {
  const args = parseArgs();
  args.schoolYear = "";
  args.semNumber = "";

  const rawArgs = new Map();
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const [rawKey, ...valueParts] = arg.slice(2).split("=");
    rawArgs.set(rawKey, valueParts.length ? valueParts.join("=") : "true");
  }
  args.schoolYear = rawArgs.get("school-year") || "";
  args.semNumber = rawArgs.get("sem") || rawArgs.get("semester") || "";

  loadEnvFile(path.join(appRoot, ".env.local"), {
    only: ["FIREBASE_SERVICE_ACCOUNT_PATH", "GOOGLE_APPLICATION_CREDENTIALS"]
  });
  loadEnvFile(args.envFile ? resolveExistingPath(args.envFile) : "");

  const { credentialLabel, databaseId, db, projectId } = initializeAdmin(args);
  const now = new Date().toISOString();
  const scopeLabel = [
    args.schoolYear ? `school year ${args.schoolYear}` : "all school years",
    args.semNumber ? `semester ${args.semNumber}` : "all semesters"
  ].join(", ");

  console.log(`Project: ${projectId}`);
  console.log(`Database: ${databaseId}`);
  console.log(`Credential mode: ${credentialLabel}`);
  console.log(`Scope: ${scopeLabel}`);
  console.log(`Reset non-payrolled statuses: ${args.resetUnpayrolledStatus ? "yes" : "no"}`);

  let studentsSnapshot;
  try {
    studentsSnapshot = await db.collection("students").get();
  } catch (error) {
    if (error?.code === 7) {
      throw new Error(
        [
          "Firestore denied access to the students collection.",
          `Project: ${projectId}`,
          `Database: ${databaseId}`,
          `Credential: ${credentialLabel}`,
          "Grant this service account a Firestore IAM role with read/write access, such as Cloud Datastore User (roles/datastore.user) or Cloud Datastore Owner (roles/datastore.owner), then rerun the dry run.",
          "Firebase security rules are not the issue here; firebase-admin uses IAM permissions."
        ].join("\n")
      );
    }
    throw error;
  }
  const plannedUpdates = [];
  const backupRecords = [];
  let touchedSemesterRecords = 0;

  for (const doc of studentsSnapshot.docs) {
    const data = doc.data();
    const { nextData, touchedRecords } = nextStudentData(doc.id, data, args, now);

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
      touchedSemesterRecords += touchedRecords;
    }
  }

  const backupPath = args.backupPath
    ? path.resolve(process.cwd(), args.backupPath)
    : path.join(repoRoot, "outputs", `students-renewal-requirements-reset-backup-${now.replace(/[:.]/g, "-")}.json`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        project_id: projectId,
        database_id: databaseId,
        collection: "students",
        generated_at: now,
        dry_run: !args.apply,
        scope: {
          school_year: args.schoolYear || null,
          sem_number: args.semNumber || null
        },
        reset_unpayrolled_status: args.resetUnpayrolledStatus,
        students_scanned: studentsSnapshot.size,
        students_to_update: plannedUpdates.length,
        semester_records_to_update: touchedSemesterRecords,
        records: backupRecords
      },
      null,
      2
    )
  );

  console.log(`Students scanned: ${studentsSnapshot.size}`);
  console.log(`Students needing updates: ${plannedUpdates.length}`);
  console.log(`Semester records needing updates: ${touchedSemesterRecords}`);
  console.log(`Backup written: ${backupPath}`);

  if (!args.apply) {
    console.log("Dry run only. Re-run with --apply to write these changes.");
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
    entity_id: "bulk-reset-renewal-requirements",
    summary: `Reset renewal requirements on ${touchedSemesterRecords} semester record(s) across ${plannedUpdates.length} student(s).`,
    metadata: {
      project_id: projectId,
      database_id: databaseId,
      students_scanned: studentsSnapshot.size,
      students_updated: plannedUpdates.length,
      semester_records_updated: touchedSemesterRecords,
      scope: {
        school_year: args.schoolYear || null,
        sem_number: args.semNumber || null
      },
      reset_unpayrolled_status: args.resetUnpayrolledStatus,
      backup_path: backupPath
    },
    actor_uid: "bulk-renewal-requirements-migration",
    actor_email: "",
    actor_name: "Bulk Renewal Requirements Migration",
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
