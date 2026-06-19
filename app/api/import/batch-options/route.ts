import { requireAdminForApi } from "../../../lib/server/auth";
import { importBatchWorkbookOptions } from "../../../lib/server/services/batch-options";
import { jsonError } from "../../../lib/shared/http";

export async function POST() {
  try {
    await requireAdminForApi();
    const result = await importBatchWorkbookOptions();
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
