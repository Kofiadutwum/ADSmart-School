import type { Metadata } from "next";
import { Suspense } from "react";
import { ParentBusScreen } from "@/components/work/family";

export const metadata: Metadata = { title: "School bus" };

export default function Page() {
  return (
    <Suspense>
      <ParentBusScreen />
    </Suspense>
  );
}
