import type { Metadata } from "next";
import { Suspense } from "react";
import { MarksScreen } from "@/components/work/learning";

export const metadata: Metadata = { title: "Marks" };

export default function Page() {
  return (
    <Suspense>
      <MarksScreen />
    </Suspense>
  );
}
