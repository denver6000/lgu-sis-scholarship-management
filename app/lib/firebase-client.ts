"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import {
  FIREBASE_AUTH_EMULATOR_PORT,
  FIREBASE_EMULATOR_HOST,
  FIRESTORE_DATABASE_ID,
  FIRESTORE_EMULATOR_PORT,
  isDevAppEnv
} from "./shared/app-env";

function requiredEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required Firebase client environment variable: ${name}`);
  }
  return value;
}

const firebaseConfig = {
  apiKey: requiredEnv("NEXT_PUBLIC_FIREBASE_API_KEY", process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: requiredEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: requiredEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: requiredEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: requiredEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: requiredEnv("NEXT_PUBLIC_FIREBASE_APP_ID", process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firebaseDb =
  FIRESTORE_DATABASE_ID === "(default)"
    ? getFirestore(firebaseApp)
    : getFirestore(firebaseApp, FIRESTORE_DATABASE_ID);

const emulatorState = globalThis as typeof globalThis & {
  __sisFirebaseEmulators?: {
    auth?: boolean;
    firestore?: boolean;
  };
};

emulatorState.__sisFirebaseEmulators ??= {};

if (isDevAppEnv()) {
  if (!emulatorState.__sisFirebaseEmulators.auth) {
    connectAuthEmulator(
      firebaseAuth,
      `http://${FIREBASE_EMULATOR_HOST}:${FIREBASE_AUTH_EMULATOR_PORT}`,
      { disableWarnings: true }
    );
    emulatorState.__sisFirebaseEmulators.auth = true;
  }

  if (!emulatorState.__sisFirebaseEmulators.firestore) {
    connectFirestoreEmulator(
      firebaseDb,
      FIREBASE_EMULATOR_HOST,
      FIRESTORE_EMULATOR_PORT
    );
    emulatorState.__sisFirebaseEmulators.firestore = true;
  }
}
