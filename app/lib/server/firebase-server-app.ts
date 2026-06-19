import "server-only";

import { initializeServerApp, type FirebaseServerAppSettings } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore/lite";
import {
  FIREBASE_EMULATOR_HOST,
  FIRESTORE_DATABASE_ID,
  FIRESTORE_EMULATOR_PORT,
  isDevAppEnv
} from "../shared/app-env";

function requiredEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required Firebase environment variable: ${name}`);
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

export function createFirebaseServerApp(settings: FirebaseServerAppSettings) {
  return initializeServerApp(firebaseConfig, settings);
}

const connectedFirestoreInstances = new WeakSet<object>();

export function getServerAppFirestore(settings: FirebaseServerAppSettings) {
  const app = createFirebaseServerApp(settings);
  const firestore =
    FIRESTORE_DATABASE_ID === "(default)"
      ? getFirestore(app)
      : getFirestore(app, FIRESTORE_DATABASE_ID);

  if (isDevAppEnv() && !connectedFirestoreInstances.has(firestore as object)) {
    connectFirestoreEmulator(
      firestore,
      FIREBASE_EMULATOR_HOST,
      FIRESTORE_EMULATOR_PORT
    );
    connectedFirestoreInstances.add(firestore as object);
  }

  return firestore;
}
