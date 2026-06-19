import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "../../../lib/server/firebase-admin";
import {
  ID_TOKEN_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  getSessionUser,
  sessionUserFromDecodedToken
} from "../../../lib/server/auth";

const SESSION_EXPIRES_IN = 1000 * 60 * 60 * 24 * 5;
const ID_TOKEN_EXPIRES_IN = 1000 * 60 * 55;

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({ user });
}

export async function POST(request: NextRequest) {
  const { idToken } = (await request.json()) as { idToken?: string };

  if (!idToken) {
    return NextResponse.json({ message: "Missing Firebase ID token." }, { status: 400 });
  }

  const adminAuth = getAdminAuth();
  const decodedIdToken = await adminAuth.verifyIdToken(idToken);
  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_EXPIRES_IN
  });
  const response = NextResponse.json({ user: sessionUserFromDecodedToken(decodedIdToken) });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionCookie,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_EXPIRES_IN / 1000
  });
  response.cookies.set({
    name: ID_TOKEN_COOKIE_NAME,
    value: idToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ID_TOKEN_EXPIRES_IN / 1000
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  response.cookies.set({
    name: ID_TOKEN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  return response;
}
