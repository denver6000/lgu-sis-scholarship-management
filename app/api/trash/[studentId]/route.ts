import { deleteTrashStudent } from "../../../lib/server/repositories/students";
import { requireAdminForApi } from "../../../lib/server/auth";
import { assertString, jsonError } from "../../../lib/shared/http";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ studentId: string }> }
) {
  try {
    await requireAdminForApi();
    const { studentId } = await context.params;
    const result = await deleteTrashStudent(assertString(studentId, "Student ID"));
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
