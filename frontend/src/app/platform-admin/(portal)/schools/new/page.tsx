import type { Metadata } from "next";
import { NewSchoolForm } from "@/components/platform-admin/new-school-form";

export const metadata: Metadata = { title: "Add a school" };

export default function NewSchoolPage() {
  return <NewSchoolForm />;
}
