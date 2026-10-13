import type { Metadata } from "next";
import { ConsentView } from "@/components/school-portal/family-views";

export const metadata: Metadata = { title: "Consent" };

export default function Page() {
  return <ConsentView />;
}
