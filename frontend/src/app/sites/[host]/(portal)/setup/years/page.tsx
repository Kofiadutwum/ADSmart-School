import type { Metadata } from "next";
import { YearsSetup } from "@/components/school-portal/role-pages";

export const metadata: Metadata = { title: "Years and terms" };

export default function Page() {
  return <YearsSetup />;
}
