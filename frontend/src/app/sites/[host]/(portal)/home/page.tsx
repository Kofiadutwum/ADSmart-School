import type { Metadata } from "next";
import { HomeRedirect } from "@/components/school-portal/home-redirect";

export const metadata: Metadata = { title: "Home" };

export default function SchoolPortalHome() {
  return <HomeRedirect />;
}
