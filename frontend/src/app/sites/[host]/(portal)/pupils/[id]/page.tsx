import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PupilPage } from "@/components/school-portal/role-pages";

export const metadata: Metadata = { title: "Pupil" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  return <PupilPage id={id} />;
}
