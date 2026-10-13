import type { Metadata } from "next";
import { FamilyHome } from "@/components/school-portal/family-views";

export const metadata: Metadata = { title: "Home" };

export default function Page() {
  return <FamilyHome />;
}
