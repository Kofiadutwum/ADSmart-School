import type { Metadata } from "next";
import { SchoolDetailView } from "@/components/platform-admin/school-detail";
import { SchoolExtras } from "@/components/work/platform";

export const metadata: Metadata = { title: "School" };

export default async function SchoolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <SchoolDetailView slug={slug} />
      <SchoolExtras slug={slug} />
    </>
  );
}
