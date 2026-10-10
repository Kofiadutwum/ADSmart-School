import type { Metadata } from "next";
import { LeadsView } from "@/components/platform-admin/leads-view";

export const metadata: Metadata = { title: "Leads" };

export default function LeadsPage() {
  return <LeadsView />;
}
