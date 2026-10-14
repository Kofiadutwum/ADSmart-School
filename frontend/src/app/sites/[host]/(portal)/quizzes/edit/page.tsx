import type { Metadata } from "next";
import { Suspense } from "react";
import { QuizEditScreen } from "@/components/work/learning";

export const metadata: Metadata = { title: "Quiz" };

export default function Page() {
  return (
    <Suspense>
      <QuizEditScreen />
    </Suspense>
  );
}
