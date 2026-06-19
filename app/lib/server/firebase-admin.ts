import "server-only";

import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";
import {
  FIREBASE_AUTH_EMULATOR_PORT,
  FIREBASE_EMULATOR_HOST,
  FIRESTORE_DATABASE_ID,
  FIRESTORE_EMULATOR_PORT,
  isDevAppEnv
} from "../shared/app-env";

type ServiceAccountJson = {
  project_id: string;
  client_email: string;
  private_key: string;
};

type ServiceAccountCredential = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

function configureAdminEmulatorEnv() {
  if (!isDevAppEnv()) return;

  process.env.FIREBASE_AUTH_EMULATOR_HOST =
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    `${FIREBASE_EMULATOR_HOST}:${FIREBASE_AUTH_EMULATOR_PORT}`;
  process.env.FIRESTORE_EMULATOR_HOST =
    process.env.FIRESTORE_EMULATOR_HOST ||
    `${FIREBASE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}`;
}

function normalizeServiceAccount(
  serviceAccount: ServiceAccountJson
): ServiceAccountCredential {
  if (
    !serviceAccount.project_id ||
    !serviceAccount.client_email ||
    !serviceAccount.private_key
  ) {
    throw new Error(
      "missing project_id, client_email, or private_key in service-account JSON"
    );
  }

  return {
    projectId: serviceAccount.project_id,
    clientEmail: serviceAccount.client_email,
    privateKey: serviceAccount.private_key
  };
}

function parseServiceAccountJson(json: string, source: string) {
  try {
    return normalizeServiceAccount(JSON.parse(json) as ServiceAccountJson);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse Firebase service account from ${source}: ${message}`
    );
  }
}

function serviceAccountFromBase64Env() {
  const encodedServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!encodedServiceAccount) return null;

  const json = Buffer.from(encodedServiceAccount, "base64").toString("utf8");
  return parseServiceAccountJson(json, "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64");
}

function serviceAccountFromJsonEnv() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) return null;

  return parseServiceAccountJson(json, "FIREBASE_SERVICE_ACCOUNT_JSON");
}

function serviceAccountFromFile() {
  const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!configuredPath) return null;

  const serviceAccountPath = path.resolve(process.cwd(), configuredPath);
  return parseServiceAccountJson(
    fs.readFileSync(serviceAccountPath, "utf8"),
    serviceAccountPath
  );
}

function serviceAccountFromEnv(): ServiceAccountCredential | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) return null;

  return {
    projectId,
    clientEmail,
    privateKey
  };
}

function getAdminApp() {
  configureAdminEmulatorEnv();

  if (getApps().length) return getApps()[0];

  const serviceAccount =
    serviceAccountFromBase64Env() ||
    serviceAccountFromJsonEnv() ||
    serviceAccountFromEnv() ||
    serviceAccountFromFile();
  if (!serviceAccount) {
    return initializeApp({ credential: applicationDefault() });
  }

  return initializeApp({ credential: cert(serviceAccount) });
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  const app = getAdminApp();
  return FIRESTORE_DATABASE_ID === "(default)"
    ? getFirestore(app)
    : getFirestore(app, FIRESTORE_DATABASE_ID);
}
