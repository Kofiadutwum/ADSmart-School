import type { Metadata } from "next";
import { StaffPage } from "@/components/school-portal/role-pages";

export const metadata: Metadata = { title: "Staff" };

export default function Page() {
  return <StaffPage />;
}
