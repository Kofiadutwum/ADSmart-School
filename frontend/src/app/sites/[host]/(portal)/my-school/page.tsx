import type { Metadata } from "next";
import { MySchoolView } from "@/components/school-portal/my-school-view";

export const metadata: Metadata = { title: "My school" };

export default function Page() {
  return <MySchoolView />;
}
