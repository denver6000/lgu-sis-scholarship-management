import { jsonError } from "../../../lib/shared/http";
import { requireAdminForApi, requireSessionUserForApi } from "../../../lib/server/auth";
import {
  getCurrentCycleConfig,
  saveCurrentCycleConfig
} from "../../../lib/server/repositories/system-config";

export async function GET() {
  try {
    await requireSessionUserForApi();
    const currentCycle = await getCurrentCycleConfig();
    return Response.json({ currentCycle });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAdminForApi();
    const body = (await request.json()) as {
      currentCycle?: {
        school_year?: string;
        sem_number?: number;
        status?: "open" | "locked" | "archived";
      };
    };

    const currentCycle = await saveCurrentCycleConfig(body.currentCycle || {}, user);
    return Response.json({ currentCycle });
  } catch (error) {
    return jsonError(error);
  }
}
