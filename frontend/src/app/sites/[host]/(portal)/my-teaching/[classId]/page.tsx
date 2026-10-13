import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClassListView } from "@/components/school-portal/class-list-view";

export const metadata: Metadata = { title: "Class list" };

export default async function Page({ params }: { params: Promise<{ classId: string }> }) {
  const classId = Number((await params).classId);
  if (!Number.isInteger(classId) || classId < 1) notFound();
  return <ClassListView classId={classId} />;
}
