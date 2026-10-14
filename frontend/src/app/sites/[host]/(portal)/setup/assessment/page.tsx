import type { Metadata } from "next";
import { Suspense } from "react";
import { SetupTabs } from "@/components/school-portal/setup-tabs";
import { AssessmentSetupScreen } from "@/components/work/school";

export const metadata: Metadata = { title: "Assessment" };

export default function Page() {
  return (
    <Suspense>
      <SetupTabs />
      <AssessmentSetupScreen />
    </Suspense>
  );
}
