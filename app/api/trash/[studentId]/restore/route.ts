import { restoreStudent } from "../../../../lib/server/repositories/students";
import { requireAdminForApi } from "../../../../lib/server/auth";
import { assertString, jsonError } from "../../../../lib/shared/http";

export async function POST(
  _request: Request,
  context: { params: Promise<{ studentId: string }> }
) {
  try {
    await requireAdminForApi();
    const { studentId } = await context.params;
    const student = await restoreStudent(assertString(studentId, "Student ID"));
    return Response.json({ student });
  } catch (error) {
    return jsonError(error);
  }
}
