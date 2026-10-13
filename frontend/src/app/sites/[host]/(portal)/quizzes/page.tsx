import type { Metadata } from "next";
import { Suspense } from "react";
import { QuizzesScreen } from "@/components/work/learning";

export const metadata: Metadata = { title: "Quizzes" };

export default function Page() {
  return (
    <Suspense>
      <QuizzesScreen />
    </Suspense>
  );
}
