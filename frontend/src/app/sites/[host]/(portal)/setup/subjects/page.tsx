import type { Metadata } from "next";
import { SubjectsSetup } from "@/components/school-portal/role-pages";

export const metadata: Metadata = { title: "Subjects" };

export default function Page() {
  return <SubjectsSetup />;
}
