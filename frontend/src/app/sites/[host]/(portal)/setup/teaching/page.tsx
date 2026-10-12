import type { Metadata } from "next";
import { TeachingSetup } from "@/components/school-portal/role-pages";

export const metadata: Metadata = { title: "Teaching" };

export default function Page() {
  return <TeachingSetup />;
}
