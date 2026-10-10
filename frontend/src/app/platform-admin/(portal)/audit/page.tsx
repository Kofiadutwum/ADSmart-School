import type { Metadata } from "next";
import { AuditView } from "@/components/platform-admin/audit-view";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage() {
  return <AuditView />;
}
