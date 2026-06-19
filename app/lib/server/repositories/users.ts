import "server-only";

import { getAdminAuth } from "../firebase-admin";
import type { ManagedUser } from "../../shared/user";
import { ROLE_ADMIN, ROLE_ENCODER, normalizeRole, roleFromClaims } from "../../shared/roles";
import { HttpError } from "../../shared/http";

const auth = getAdminAuth();

function mapManagedUserError(error: unknown): never {
  const adminCode =
    typeof (error as { code?: unknown })?.code === "string"
      ? String((error as { code?: string }).code)
      : "";
  const adminMessage = error instanceof Error ? error.message : "Unable to manage user.";

  switch (adminCode) {
    case "auth/email-already-exists":
      throw new HttpError(409, "A Firebase Auth user with that email already exists.");
    case "auth/invalid-email":
      throw new HttpError(400, "The email address is not valid.");
    case "auth/invalid-password":
      throw new HttpError(400, "The password does not meet Firebase Auth requirements.");
    case "auth/user-not-found":
      throw new HttpError(404, "The Firebase Auth user could not be found.");
    case "auth/uid-already-exists":
      throw new HttpError(409, "That Firebase Auth user ID already exists.");
    case "auth/insufficient-permission":
      throw new HttpError(403, "The backend does not have permission to manage Firebase Auth users.");
    default:
      throw new HttpError(500, adminMessage || "Unable to manage user.");
  }
}

function toManagedUser(userRecord: Awaited<ReturnType<typeof auth.getUser>>): ManagedUser {
  return {
    uid: userRecord.uid,
    email: userRecord.email || "",
    displayName: userRecord.displayName || "",
    disabled: userRecord.disabled === true,
    role: roleFromClaims((userRecord.customClaims ?? {}) as Record<string, unknown>)
  };
}

async function listAllUsers() {
  const users = [];
  let pageToken: string | undefined;

  do {
    const result = await auth.listUsers(1000, pageToken);
    users.push(...result.users);
    pageToken = result.pageToken;
  } while (pageToken);

  return users;
}

export async function listManagedUsers() {
  const users = await listAllUsers();
  return users
    .map((userRecord) => toManagedUser(userRecord))
    .sort((left, right) =>
      left.email.localeCompare(right.email, undefined, { sensitivity: "base" })
    );
}

export async function createManagedUser(input: {
  email: string;
  password: string;
  displayName?: string;
  role: string;
}) {
  const role = normalizeRole(input.role);

  try {
    const userRecord = await auth.createUser({
      email: input.email,
      password: input.password,
      displayName: input.displayName || undefined
    });

    await auth.setCustomUserClaims(userRecord.uid, {
      role,
      admin: role === ROLE_ADMIN,
      encoder: role === ROLE_ENCODER
    });

    const hydrated = await auth.getUser(userRecord.uid);
    return toManagedUser(hydrated);
  } catch (error) {
    mapManagedUserError(error);
  }
}

export async function updateManagedUser(
  uid: string,
  input: { displayName?: string; password?: string }
) {
  const displayName = String(input.displayName ?? "").trim();
  const password = String(input.password ?? "").trim();

  if (!displayName && !password) {
    throw new HttpError(400, "Provide a display name or a new password.");
  }
  if (password && password.length < 6) {
    throw new HttpError(400, "Password must be at least 6 characters.");
  }

  try {
    const updatePayload: { displayName?: string; password?: string } = {};
    if (displayName) updatePayload.displayName = displayName;
    if (password) updatePayload.password = password;
    await auth.updateUser(uid, updatePayload);
    const hydrated = await auth.getUser(uid);
    return toManagedUser(hydrated);
  } catch (error) {
    mapManagedUserError(error);
  }
}

export async function deleteManagedUser(uid: string, actorUid: string) {
  if (uid === actorUid) {
    throw new HttpError(412, "You cannot delete the account currently signed in.");
  }

  try {
    await auth.deleteUser(uid);
    return { uid, deleted: true };
  } catch (error) {
    mapManagedUserError(error);
  }
}
