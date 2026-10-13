import type { Metadata } from "next";
import { ParentsPage } from "@/components/school-portal/role-pages";

export const metadata: Metadata = { title: "Parents" };

export default function Page() {
  return <ParentsPage />;
}
