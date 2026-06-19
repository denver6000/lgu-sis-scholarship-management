import { deleteSchoolCourse } from "../../../lib/server/repositories/options";
import { requireSessionUserForApi } from "../../../lib/server/auth";
import { assertString, jsonError } from "../../../lib/shared/http";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireSessionUserForApi();
    const { id } = await context.params;
    const result = await deleteSchoolCourse(assertString(id, "School course ID"));
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
