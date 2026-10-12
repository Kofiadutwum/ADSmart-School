import type { Metadata } from "next";
import { SchoolAuditView } from "@/components/school-portal/school-audit-view";

export const metadata: Metadata = { title: "Audit log" };

export default function Page() {
  return <SchoolAuditView />;
}
