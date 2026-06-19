#!/usr/bin/env node

import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import net from "node:net";
import process from "node:process";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "lgus-sjc-scholarship";
const HOST = process.env.FIREBASE_EMULATOR_HOST || "127.0.0.1";
const PORTS = {
  auth: Number(process.env.FIREBASE_AUTH_EMULATOR_PORT || 9099),
  firestore: Number(process.env.FIRESTORE_EMULATOR_PORT || 8080),
  functions: Number(process.env.FIREBASE_FUNCTIONS_EMULATOR_PORT || 5001),
  hosting: Number(process.env.FIREBASE_HOSTING_EMULATOR_PORT || 5000),
  ui: Number(process.env.FIREBASE_UI_EMULATOR_PORT || 4000)
};

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || `${HOST}:${PORTS.firestore}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || `${HOST}:${PORTS.auth}`;

const REQUIREMENT_KEYS = [
  "certificate_of_residency",
  "pagpapatunay_form",
  "picture_of_the_house",
  "good_moral_certificate",
  "original_certificate_of_grades",
  "proof_of_enrollment"
];

const RENEWAL_REQUIREMENT_KEYS = ["liquidation", "proof_of_enrollment", "latest_grades"];

const COLLECTIONS = [
  "students",
  "trash",
  "payoutRecords",
  "operationLogs",
  "systemConfig",
  "schoolCourses",
  "barangays",
  "schools",
  "courses",
  "batches"
];

function usage() {
  console.log(`
Firebase Emulator Suite toolbox

Usage:
  npm run emu:status
  npm run emu:collections
  npm run emu:students -- --limit 20 --filter "juan"
  npm run emu:student -- STU001
  npm run emu:requirements -- --filter "juan"
  npm run emu:auth-users
  npm run emu:logs -- --limit 20

Environment:
  FIREBASE_PROJECT_ID=${PROJECT_ID}
  FIRESTORE_EMULATOR_HOST=${process.env.FIRESTORE_EMULATOR_HOST}
  FIREBASE_AUTH_EMULATOR_HOST=${process.env.FIREBASE_AUTH_EMULATOR_HOST}
`);
}

function app() {
  if (getApps().length) return getApps()[0];
  return initializeApp({ projectId: PROJECT_ID });
}

function db() {
  return getFirestore(app());
}

function auth() {
  return getAuth(app());
}

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function numberArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index !== -1) {
    const value = Number(process.argv[index + 1] || "");
    if (Number.isFinite(value) && value > 0) return value;
  }

  const positionalNumber = positionalArgs().find((arg) => Number.isFinite(Number(arg)) && Number(arg) > 0);
  return positionalNumber ? Number(positionalNumber) : fallback;
}

function positionalArgs() {
  return process.argv.slice(3).filter((arg) => !arg.startsWith("--"));
}

function filterArg() {
  const explicitFilter = argValue("--filter");
  if (explicitFilter) return explicitFilter;
  return positionalArgs()
    .filter((arg) => !Number.isFinite(Number(arg)))
    .join(" ");
}

function normalizeFilter(value) {
  return String(value || "").trim().toLowerCase();
}

function countReady(source, keys) {
  return keys.filter((key) => source?.[key] === true).length;
}

function studentMatches(student, filter) {
  if (!filter) return true;
  return [
    student.student_id,
    student.full_name,
    student.student_number,
    student.school_address,
    student.barangay
  ]
    .map((value) => String(value || "").toLowerCase())
    .some((value) => value.includes(filter));
}

function permanentPayrolled(student) {
  if (student.payrolled === true || student.payrolled_at) return true;
  const records = Array.isArray(student.semester_records) ? student.semester_records : [];
  return records.some(
    (record) =>
      record?.payroll_status === "payrolled" ||
      record?.renewal_status === "payrolled" ||
      Boolean(record?.payroll_id || record?.payrolled_at)
  );
}

function initialRequirements(student) {
  const globalRequirements = Object.fromEntries(
    REQUIREMENT_KEYS.map((key) => [key, student.requirements?.[key] === true || student[key] === true])
  );
  const globalCount = countReady(globalRequirements, REQUIREMENT_KEYS);
  if (globalCount > 0) return globalRequirements;

  const records = Array.isArray(student.semester_records) ? student.semester_records : [];
  return records.reduce(
    (requirements, record) => {
      for (const key of REQUIREMENT_KEYS) {
        requirements[key] = requirements[key] || record?.initial_payout_requirements?.[key] === true;
      }
      return requirements;
    },
    Object.fromEntries(REQUIREMENT_KEYS.map((key) => [key, false]))
  );
}

function table(rows) {
  if (!rows.length) {
    console.log("No rows.");
    return;
  }
  console.table(rows);
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: HOST, port, timeout: 750 });
    let settled = false;
    const finish = (online) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(online);
    };

    socket.on("connect", () => {
      finish(true);
    });
    socket.on("timeout", () => {
      finish(false);
    });
    socket.on("error", () => finish(false));
  });
}

async function status() {
  const rows = [];
  for (const [service, port] of Object.entries(PORTS)) {
    const online = await portOpen(port);
    rows.push({
      service,
      host: HOST,
      port,
      status: online ? "online" : "offline",
      url: `http://${HOST}:${port}`
    });
  }
  table(rows);
}

async function collections() {
  const rows = [];
  for (const collection of COLLECTIONS) {
    const snapshot = await db().collection(collection).get();
    rows.push({ collection, documents: snapshot.size });
  }
  table(rows);
}

async function students() {
  const limit = numberArg("--limit", 50);
  const filter = normalizeFilter(filterArg());
  const snapshot = await db().collection("students").limit(500).get();
  const rows = snapshot.docs
    .map((doc) => ({ student_id: doc.id, ...doc.data() }))
    .filter((student) => studentMatches(student, filter))
    .slice(0, limit)
    .map((student) => {
      const requirements = initialRequirements(student);
      return {
        student_id: student.student_id,
        full_name: student.full_name,
        student_number: student.student_number || "",
        school: student.school_address || "",
        barangay: student.barangay || "",
        initial_ready: `${countReady(requirements, REQUIREMENT_KEYS)}/${REQUIREMENT_KEYS.length}`,
        permanent_payrolled: permanentPayrolled(student),
        semester_records: Array.isArray(student.semester_records) ? student.semester_records.length : 0
      };
    });
  table(rows);
}

async function student() {
  const [query] = positionalArgs();
  if (!query) {
    console.error("Missing student id/name. Example: npm run emu:student -- STU001");
    process.exitCode = 1;
    return;
  }

  const doc = await db().collection("students").doc(query).get();
  if (doc.exists) {
    console.log(JSON.stringify({ student_id: doc.id, ...doc.data() }, null, 2));
    return;
  }

  const filter = normalizeFilter(query);
  const snapshot = await db().collection("students").limit(500).get();
  const matches = snapshot.docs
    .map((item) => ({ student_id: item.id, ...item.data() }))
    .filter((item) => studentMatches(item, filter));

  if (matches.length === 1) {
    console.log(JSON.stringify(matches[0], null, 2));
    return;
  }

  table(matches.slice(0, 20).map((item) => ({
    student_id: item.student_id,
    full_name: item.full_name,
    student_number: item.student_number || "",
    school: item.school_address || ""
  })));
}

async function requirements() {
  const limit = numberArg("--limit", 50);
  const filter = normalizeFilter(filterArg());
  const snapshot = await db().collection("students").limit(500).get();
  const rows = snapshot.docs
    .map((doc) => ({ student_id: doc.id, ...doc.data() }))
    .filter((item) => studentMatches(item, filter))
    .slice(0, limit)
    .map((item) => {
      const initial = initialRequirements(item);
      const records = Array.isArray(item.semester_records) ? item.semester_records : [];
      const latestRecord = records
        .slice()
        .sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")))[0];
      return {
        student_id: item.student_id,
        full_name: item.full_name,
        initial_ready: `${countReady(initial, REQUIREMENT_KEYS)}/${REQUIREMENT_KEYS.length}`,
        latest_cycle: latestRecord?.cycle_key || "",
        latest_renewal_ready: latestRecord
          ? `${countReady(latestRecord.renewal_requirements || latestRecord.requirements, RENEWAL_REQUIREMENT_KEYS)}/${RENEWAL_REQUIREMENT_KEYS.length}`
          : "0/3",
        permanent_payrolled: permanentPayrolled(item)
      };
    });
  table(rows);
}

async function authUsers() {
  const result = await auth().listUsers(1000);
  table(result.users.map((user) => ({
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "",
    disabled: user.disabled,
    claims: JSON.stringify(user.customClaims || {})
  })));
}

async function logs() {
  const limit = numberArg("--limit", 20);
  const snapshot = await db().collection("operationLogs").orderBy("created_at", "desc").limit(limit).get();
  table(snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      action: data.action || "",
      entity: data.entity || "",
      entity_id: data.entity_id || "",
      summary: data.summary || "",
      created_at: data.created_at || ""
    };
  }));
}

const commands = {
  status,
  collections,
  students,
  student,
  requirements,
  "auth-users": authUsers,
  logs
};

const command = process.argv[2] || "help";
if (command === "help" || command === "--help" || command === "-h") {
  usage();
} else if (commands[command]) {
  await commands[command]();
} else {
  console.error(`Unknown command: ${command}`);
  usage();
  process.exitCode = 1;
}
