import { deleteManagedUser, updateManagedUser } from "../../../lib/server/repositories/users";
import { jsonError, assertString, optionalString } from "../../../lib/shared/http";
import { requireAdminForApi } from "../../../lib/server/auth";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ uid: string }> }
) {
  try {
    await requireAdminForApi();
    const { uid } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const user = await updateManagedUser(assertString(uid, "UID"), {
      displayName: optionalString(body.displayName),
      password: optionalString(body.password)
    });
    return Response.json({ user });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ uid: string }> }
) {
  try {
    const actor = await requireAdminForApi();
    const { uid } = await context.params;
    const result = await deleteManagedUser(assertString(uid, "UID"), actor.uid);
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
