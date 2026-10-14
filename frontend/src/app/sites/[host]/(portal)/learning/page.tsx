import type { Metadata } from "next";
import { Suspense } from "react";
import { ParentLearningScreen } from "@/components/work/family";

export const metadata: Metadata = { title: "Learning" };

export default function Page() {
  return (
    <Suspense>
      <ParentLearningScreen />
    </Suspense>
  );
}
