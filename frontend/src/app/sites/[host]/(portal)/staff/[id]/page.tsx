import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StaffMemberPage } from "@/components/school-portal/role-pages";

export const metadata: Metadata = { title: "Member of staff" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  return <StaffMemberPage id={id} />;
}
