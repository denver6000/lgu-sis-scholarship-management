import { listSchoolCourses, saveSchoolCourse } from "../../lib/server/repositories/options";
import { requireSessionUserForApi } from "../../lib/server/auth";
import { jsonError } from "../../lib/shared/http";
import type { SchoolCourseRecord } from "../../lib/shared/options";

export async function GET() {
  try {
    await requireSessionUserForApi();
    const schoolCourses = await listSchoolCourses();
    return Response.json({ schoolCourses });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireSessionUserForApi();
    const body = (await request.json()) as { schoolCourse?: Partial<SchoolCourseRecord> };
    const schoolCourse = await saveSchoolCourse(body.schoolCourse || {});
    return Response.json({ schoolCourse }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
