import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClassPupilView } from "@/components/school-portal/class-list-view";

export const metadata: Metadata = { title: "Pupil" };

type Params = Promise<{ classId: string; pupilId: string }>;

export default async function Page({ params }: { params: Params }) {
  const { classId, pupilId } = await params;
  const ids = [Number(classId), Number(pupilId)];
  if (ids.some((id) => !Number.isInteger(id) || id < 1)) notFound();
  return <ClassPupilView classId={ids[0]} pupilId={ids[1]} />;
}
