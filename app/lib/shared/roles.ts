export const ROLE_ADMIN = "admin";
export const ROLE_ENCODER = "encoder";
const LEGACY_ROLE_USER = "user";

export type AppRole = typeof ROLE_ADMIN | typeof ROLE_ENCODER;

export function normalizeRole(value: unknown): AppRole {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === ROLE_ADMIN || normalized === ROLE_ENCODER) {
    return normalized;
  }
  throw new Error("Role must be either 'admin' or 'encoder'.");
}

export function roleFromClaims(
  claims: Record<string, unknown> | null | undefined
): AppRole | null {
  if (!claims) return null;
  if (claims.role === ROLE_ADMIN || claims.admin === true) return ROLE_ADMIN;
  if (
    claims.role === ROLE_ENCODER ||
    claims.encoder === true ||
    claims.role === LEGACY_ROLE_USER ||
    claims.user === true
  ) {
    return ROLE_ENCODER;
  }
  return null;
}

export function isAdminRole(role: string | null | undefined) {
  return role === ROLE_ADMIN;
}
