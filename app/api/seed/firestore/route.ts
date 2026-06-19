import { requireAdminForApi } from "../../../lib/server/auth";
import { seedFirestoreFromBundledJson } from "../../../lib/server/services/seed";
import { HttpError, jsonError } from "../../../lib/shared/http";

export async function POST() {
  try {
    await requireAdminForApi();

    const isDevelopment = process.env.NODE_ENV !== "production";
    if (!isDevelopment && process.env.ALLOW_PRODUCTION_SEED !== "true") {
      throw new HttpError(403, "Seeding Firestore is disabled in production.");
    }

    const result = await seedFirestoreFromBundledJson();
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
