import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminAuth } from "./firebase-admin";
import { HttpError } from "../shared/http";
import { isAdminRole, roleFromClaims } from "../shared/roles";
import type { SessionUser } from "../shared/user";

export const SESSION_COOKIE_NAME = "__session";
export const ID_TOKEN_COOKIE_NAME = "__session_id_token";
const AUTH_HEADER_NAMES = ["x-firebase-auth-token", "authorization"] as const;

export function sessionUserFromDecodedToken(decodedToken: DecodedIdToken): SessionUser {
  const role = roleFromClaims(decodedToken as unknown as Record<string, unknown>) ?? "encoder";

  return {
    uid: decodedToken.uid,
    email: decodedToken.email ?? "",
    name: decodedToken.name ?? decodedToken.email ?? "Signed In User",
    role,
    claims: {
      admin: decodedToken.admin === true,
      role: roleFromClaims(decodedToken as unknown as Record<string, unknown>)
    }
  };
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    const decodedToken = await getAdminAuth().verifySessionCookie(sessionCookie, true);
    return sessionUserFromDecodedToken(decodedToken);
  } catch {
    return null;
  }
}

export async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireSessionUserForApi() {
  const user = await getSessionUser();
  if (!user) {
    throw new HttpError(401, "You must be signed in to use this endpoint.");
  }
  return user;
}

export async function requireAdminForApi() {
  const user = await requireSessionUserForApi();
  if (!isAdminRole(user.claims.role) && user.claims.admin !== true) {
    throw new HttpError(403, "This action requires the admin role.");
  }
  return user;
}

export async function getAuthIdTokenFromHeaders() {
  const headerStore = await headers();

  for (const headerName of AUTH_HEADER_NAMES) {
    const raw = headerStore.get(headerName);
    if (!raw) continue;

    if (headerName === "authorization") {
      const [scheme, token] = raw.split(" ");
      if (scheme?.toLowerCase() === "bearer" && token) return token;
      continue;
    }

    return raw;
  }

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(ID_TOKEN_COOKIE_NAME)?.value;
  if (cookieToken) return cookieToken;

  return null;
}
