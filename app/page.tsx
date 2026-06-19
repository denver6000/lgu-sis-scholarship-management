import { redirect } from "next/navigation";
import { routeForView } from "./lib/shared/views";

export default function HomePage() {
  redirect(routeForView("dashboard"));
}
