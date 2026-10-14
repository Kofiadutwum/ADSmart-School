import type { Metadata } from "next";
import { Suspense } from "react";
import { PupilAccountScreen } from "@/components/work/money";

export const metadata: Metadata = { title: "Pupil's account" };

export default function Page() {
  return (
    <Suspense>
      <PupilAccountScreen />
    </Suspense>
  );
}
