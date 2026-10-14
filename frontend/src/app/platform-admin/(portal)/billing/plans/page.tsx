import type { Metadata } from "next";
import { Suspense } from "react";
import { PlansScreen } from "@/components/work/platform";

export const metadata: Metadata = { title: "Plans" };

export default function Page() {
  return (
    <Suspense>
      <PlansScreen />
    </Suspense>
  );
}
