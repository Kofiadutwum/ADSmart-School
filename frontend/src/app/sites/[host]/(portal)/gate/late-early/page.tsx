import type { Metadata } from "next";
import { Suspense } from "react";
import { LateEarlyScreen } from "@/components/work/services";

export const metadata: Metadata = { title: "Late and early" };

export default function Page() {
  return (
    <Suspense>
      <LateEarlyScreen />
    </Suspense>
  );
}
