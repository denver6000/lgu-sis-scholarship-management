import { renderAppView } from "../view-page";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  return renderAppView("profiles");
}
