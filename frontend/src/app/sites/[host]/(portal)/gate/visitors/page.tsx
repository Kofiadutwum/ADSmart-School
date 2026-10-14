import type { Metadata } from "next";
import { Suspense } from "react";
import { VisitorsScreen } from "@/components/work/services";

export const metadata: Metadata = { title: "Visitors" };

export default function Page() {
  return (
    <Suspense>
      <VisitorsScreen />
    </Suspense>
  );
}
