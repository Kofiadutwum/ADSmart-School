import type { Metadata } from "next";
import { Suspense } from "react";
import { WriteNoteScreen } from "@/components/work/learning";

export const metadata: Metadata = { title: "Lesson note" };

export default function Page() {
  return (
    <Suspense>
      <WriteNoteScreen />
    </Suspense>
  );
}
