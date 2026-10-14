import type { Metadata } from "next";
import { Suspense } from "react";
import { StatisticsScreen } from "@/components/work/platform";

export const metadata: Metadata = { title: "Statistics" };

export default function Page() {
  return (
    <Suspense>
      <StatisticsScreen />
    </Suspense>
  );
}
