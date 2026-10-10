import type { Metadata } from "next";
import { SchoolsView } from "@/components/platform-admin/schools-view";

export const metadata: Metadata = { title: "Schools" };

export default function SchoolsPage() {
  return <SchoolsView />;
}
