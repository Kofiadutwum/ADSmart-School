import type { Metadata } from "next";
import { Suspense } from "react";
import { ParentCareScreen } from "@/components/work/family";

export const metadata: Metadata = { title: "Daily care and pick-up" };

export default function Page() {
  return (
    <Suspense>
      <ParentCareScreen />
    </Suspense>
  );
}
