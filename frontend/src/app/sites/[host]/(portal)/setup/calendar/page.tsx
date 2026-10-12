import type { Metadata } from "next";
import { CalendarSetup } from "@/components/school-portal/role-pages";

export const metadata: Metadata = { title: "Calendar" };

export default function Page() {
  return <CalendarSetup />;
}
