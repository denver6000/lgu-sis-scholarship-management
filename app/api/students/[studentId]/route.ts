import {
  moveStudentToTrash,
  updateStudent
} from "../../../lib/server/repositories/students";
import { jsonError, assertString } from "../../../lib/shared/http";
import { requireAdminForApi, requireSessionUserForApi } from "../../../lib/server/auth";
import type { StudentInput } from "../../../lib/shared/student";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ studentId: string }> }
) {
  try {
    const user = await requireSessionUserForApi();
    const { studentId } = await context.params;
    const body = (await request.json()) as { student?: StudentInput };
    const student = await updateStudent(assertString(studentId, "Student ID"), body.student || {}, user);
    return Response.json({ student });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ studentId: string }> }
) {
  try {
    await requireAdminForApi();
    const { studentId } = await context.params;
    const student = await moveStudentToTrash(assertString(studentId, "Student ID"));
    return Response.json({ student });
  } catch (error) {
    return jsonError(error);
  }
}
