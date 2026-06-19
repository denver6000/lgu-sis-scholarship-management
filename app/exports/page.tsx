import { redirect } from "next/navigation";
import { routeForView } from "../lib/shared/views";

export const dynamic = "force-dynamic";

export default async function LegacyPayrollRedirectPage() {
  redirect(routeForView("payrolls"));
}
