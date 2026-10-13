import type { Metadata } from "next";
import { Suspense } from "react";
import { ClassResultsScreen } from "@/components/work/learning";

export const metadata: Metadata = { title: "Class results" };

export default function Page() {
  return (
    <Suspense>
      <ClassResultsScreen />
    </Suspense>
  );
}
