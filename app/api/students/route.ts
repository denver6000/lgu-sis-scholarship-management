import { createStudent, listStudents, listStudentsPage } from "../../lib/server/repositories/students";
import { jsonError } from "../../lib/shared/http";
import { requireSessionUserForApi } from "../../lib/server/auth";
import type { StudentInput } from "../../lib/shared/student";

export async function GET(request: Request) {
  try {
    await requireSessionUserForApi();
    const url = new URL(request.url);
    const limit = url.searchParams.get("limit");
    const cursor = url.searchParams.get("cursor");

    if (limit || cursor) {
      const page = await listStudentsPage({
        limit: limit ? Number(limit) : undefined,
        cursor,
        filters: {
          query: url.searchParams.get("query") || undefined,
          school: url.searchParams.get("school") || undefined,
          barangay: url.searchParams.get("barangay") || undefined,
          batch: url.searchParams.get("batch") || undefined,
          status: url.searchParams.get("status") || undefined,
          requirementsTab: (() => {
            const value = url.searchParams.get("requirementsTab");
            if (value === "renewal" || value === "payrolled") return "renewal";
            if (value === "not-renewal" || value === "non-payrolled") return "not-renewal";
            return undefined;
          })(),
          payrollTab:
            url.searchParams.get("payrollTab") === "new" ||
            url.searchParams.get("payrollTab") === "renewal"
              ? (url.searchParams.get("payrollTab") as "new" | "renewal")
              : undefined,
          cycle: url.searchParams.get("cycleKey")
            ? {
                cycle_key: url.searchParams.get("cycleKey") || "",
                school_year: url.searchParams.get("schoolYear") || "",
                sem_number: Number(url.searchParams.get("semNumber") || 0)
              }
            : undefined
        }
      });
      return Response.json(page);
    }

    const students = await listStudents();
    return Response.json({ students });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUserForApi();
    const body = (await request.json()) as { student?: StudentInput };
    const student = await createStudent(body.student || {}, user);
    return Response.json({ student }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
