import { deletePayoutRecord } from "../../../lib/server/repositories/payout-records";
import { requireAdminForApi } from "../../../lib/server/auth";
import { assertString, jsonError } from "../../../lib/shared/http";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ recordId: string }> }
) {
  try {
    await requireAdminForApi();
    const { recordId } = await context.params;
    const result = await deletePayoutRecord(assertString(recordId, "Record ID"));
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
