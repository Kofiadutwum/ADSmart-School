import type { Metadata } from "next";
import { Suspense } from "react";
import { GateScreen } from "@/components/work/services";

export const metadata: Metadata = { title: "Pick-up" };

export default function Page() {
  return (
    <Suspense>
      <GateScreen />
    </Suspense>
  );
}
