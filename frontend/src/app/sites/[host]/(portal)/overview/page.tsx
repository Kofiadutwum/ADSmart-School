import type { Metadata } from "next";
import { OverviewView } from "@/components/school-portal/enrolment-view";

export const metadata: Metadata = { title: "Enrolment overview" };

export default function Page() {
  return <OverviewView />;
}
