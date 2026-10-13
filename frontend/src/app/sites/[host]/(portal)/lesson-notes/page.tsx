import type { Metadata } from "next";
import { Suspense } from "react";
import { LessonNotesScreen } from "@/components/work/learning";

export const metadata: Metadata = { title: "Lesson notes" };

export default function Page() {
  return (
    <Suspense>
      <LessonNotesScreen />
    </Suspense>
  );
}
