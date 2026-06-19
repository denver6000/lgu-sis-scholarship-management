import { redirect } from "next/navigation";
import { AppShell } from "./app-shell";
import { getAppInitialData } from "./lib/server/app-data";
import { requireSessionUser } from "./lib/server/auth";
import { isAdminOnlyView, routeForView, type AppViewName } from "./lib/shared/views";

const clientLoadedStudentViews = new Set<AppViewName>(["dashboard", "register", "requirements", "records", "payrolls"]);

function isAdminUser(user: Awaited<ReturnType<typeof requireSessionUser>>) {
  return user.claims.admin === true || user.claims.role === "admin" || user.role === "admin";
}

export async function renderAppView(view: AppViewName) {
  const user = await requireSessionUser();

  if (isAdminOnlyView(view) && !isAdminUser(user)) {
    redirect(routeForView("dashboard"));
  }

  const initialData = await getAppInitialData(user, {
    deferStudents: clientLoadedStudentViews.has(view),
    deferPayoutRecords: view === "register" || view === "requirements"
  });

  return <AppShell initialData={initialData} initialView={view} />;
}
