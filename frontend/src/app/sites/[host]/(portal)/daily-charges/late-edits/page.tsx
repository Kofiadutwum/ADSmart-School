import type { Metadata } from "next";
import { Suspense } from "react";
import { LateEditsScreen } from "@/components/work/daily";

export const metadata: Metadata = { title: "Late edits" };

export default function Page() {
  return (
    <Suspense>
      <LateEditsScreen />
    </Suspense>
  );
}
