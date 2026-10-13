import type { Metadata } from "next";
import { Suspense } from "react";
import { WordingScreen } from "@/components/work/school";

export const metadata: Metadata = { title: "Wording" };

export default function Page() {
  return (
    <Suspense>
      <WordingScreen />
    </Suspense>
  );
}
