import type { Metadata } from "next";
import { Suspense } from "react";
import { TakeQuizScreen } from "@/components/work/pupil";

export const metadata: Metadata = { title: "Quiz" };

export default function Page() {
  return (
    <Suspense>
      <TakeQuizScreen />
    </Suspense>
  );
}
