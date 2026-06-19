export type AppViewName =
  | "dashboard"
  | "catalogs"
  | "register"
  | "requirements"
  | "records"
  | "profiles"
  | "users"
  | "payrolls"
  | "trash";

export const APP_VIEWS: Array<{
  view: AppViewName;
  label: string;
  adminOnly?: boolean;
}> = [
  { view: "dashboard", label: "Dashboard" },
  { view: "catalogs", label: "Catalogs", adminOnly: true },
  { view: "register", label: "Registry" },
  { view: "requirements", label: "Requirements" },
  { view: "records", label: "Records" },
  { view: "profiles", label: "Profiles" },
  { view: "users", label: "Users", adminOnly: true },
  { view: "payrolls", label: "Payrolls", adminOnly: true },
  { view: "trash", label: "Trash", adminOnly: true }
];

export function isAppViewName(value: string): value is AppViewName {
  return APP_VIEWS.some((item) => item.view === value);
}

export function isAdminOnlyView(view: AppViewName) {
  return APP_VIEWS.some((item) => item.view === view && item.adminOnly);
}

export function routeForView(view: AppViewName) {
  if (view === "register") return "/registry";
  return `/${view}`;
}

export function labelForView(view: AppViewName) {
  return APP_VIEWS.find((item) => item.view === view)?.label || "Dashboard";
}
