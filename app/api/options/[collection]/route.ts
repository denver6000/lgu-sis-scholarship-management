import { assertOptionCollection, listOptions, saveOption } from "../../../lib/server/repositories/options";
import { requireSessionUserForApi } from "../../../lib/server/auth";
import { jsonError } from "../../../lib/shared/http";
import type { OptionRecord } from "../../../lib/shared/options";

export async function GET(
  _request: Request,
  context: { params: Promise<{ collection: string }> }
) {
  try {
    await requireSessionUserForApi();
    const { collection } = await context.params;
    const records = await listOptions(assertOptionCollection(collection));
    return Response.json({ records });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ collection: string }> }
) {
  try {
    await requireSessionUserForApi();
    const { collection } = await context.params;
    const body = (await request.json()) as { record?: Partial<OptionRecord> };
    const record = await saveOption(assertOptionCollection(collection), body.record || {});
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
