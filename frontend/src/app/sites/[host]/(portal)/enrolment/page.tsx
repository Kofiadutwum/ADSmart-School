import type { Metadata } from "next";
import { EnrolmentView } from "@/components/school-portal/enrolment-view";

export const metadata: Metadata = { title: "Enrolment" };

export default function Page() {
  return <EnrolmentView />;
}
