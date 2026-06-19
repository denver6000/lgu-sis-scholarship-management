import { listTrash } from "../../lib/server/repositories/students";
import { jsonError } from "../../lib/shared/http";
import { requireAdminForApi } from "../../lib/server/auth";

export async function GET() {
  try {
    await requireAdminForApi();
    const trash = await listTrash();
    return Response.json({ trash });
  } catch (error) {
    return jsonError(error);
  }
}
