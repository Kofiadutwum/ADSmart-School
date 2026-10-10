import { redirect } from "next/navigation";

/** The admin address opens on the schools list. */
export default function PlatformAdminHome() {
  redirect("/schools");
}
