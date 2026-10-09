import { redirect } from "next/navigation";

/** Plan 5 puts the schools list here; until then the admin address opens on the Account page. */
export default function PlatformAdminHome() {
  redirect("/account");
}
