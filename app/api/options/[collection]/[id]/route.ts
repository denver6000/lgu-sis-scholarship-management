import { assertOptionCollection, deleteOption } from "../../../../lib/server/repositories/options";
import { requireSessionUserForApi } from "../../../../lib/server/auth";
import { assertString, jsonError } from "../../../../lib/shared/http";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ collection: string; id: string }> }
) {
  try {
    await requireSessionUserForApi();
    const { collection, id } = await context.params;
    const result = await deleteOption(assertOptionCollection(collection), assertString(id, "Option ID"));
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
