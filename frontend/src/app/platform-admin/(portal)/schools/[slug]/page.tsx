import type { Metadata } from "next";
import { SchoolDetailView } from "@/components/platform-admin/school-detail";

export const metadata: Metadata = { title: "School" };

export default async function SchoolPage({ params }: { params: Promise<{ slug: string }> }) {
  return <SchoolDetailView slug={(await params).slug} />;
}
