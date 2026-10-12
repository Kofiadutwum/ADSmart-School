import type { Metadata } from "next";
import { ClassesSetup } from "@/components/school-portal/role-pages";

export const metadata: Metadata = { title: "Classes" };

export default function Page() {
  return <ClassesSetup />;
}
