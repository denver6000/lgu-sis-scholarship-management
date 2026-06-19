import { createManagedUser, listManagedUsers } from "../../lib/server/repositories/users";
import { jsonError, assertString, optionalString } from "../../lib/shared/http";
import { requireAdminForApi } from "../../lib/server/auth";

export async function GET() {
  try {
    await requireAdminForApi();
    const users = await listManagedUsers();
    return Response.json({ users });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminForApi();
    const body = (await request.json()) as Record<string, unknown>;
    const user = await createManagedUser({
      email: assertString(body.email, "Email"),
      password: assertString(body.password, "Password"),
      displayName: optionalString(body.displayName),
      role: assertString(body.role, "Role")
    });
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
