import type { Metadata } from "next";
import { Suspense } from "react";
import { MyQuizzesScreen } from "@/components/work/pupil";

export const metadata: Metadata = { title: "Quizzes" };

export default function Page() {
  return (
    <Suspense>
      <MyQuizzesScreen />
    </Suspense>
  );
}
