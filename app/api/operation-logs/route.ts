import { createOperationLog, listOperationLogs } from "../../lib/server/repositories/operation-logs";
import { requireSessionUserForApi } from "../../lib/server/auth";
import { jsonError } from "../../lib/shared/http";
import { isAdminRole } from "../../lib/shared/roles";
import type { OperationLogInput } from "../../lib/shared/operation-log";

export async function GET() {
  try {
    const user = await requireSessionUserForApi();
    const operationLogs = await listOperationLogs();
    const visibleLogs =
      user.claims.admin === true || isAdminRole(user.claims.role)
        ? operationLogs
        : operationLogs.filter((record) => record.entity !== "payroll");
    return Response.json({ operationLogs: visibleLogs });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUserForApi();
    const body = (await request.json()) as { operationLog?: OperationLogInput };
    if (
      user.claims.admin !== true &&
      !isAdminRole(user.claims.role) &&
      body.operationLog?.entity === "payroll"
    ) {
      return Response.json({ message: "This action requires the admin role." }, { status: 403 });
    }
    const operationLog = await createOperationLog(body.operationLog || ({} as OperationLogInput), user);
    return Response.json({ operationLog }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
