import type { Metadata } from "next";
import { Suspense } from "react";
import { DailyListScreen } from "@/components/work/daily";

export const metadata: Metadata = { title: "Daily charges" };

export default function Page() {
  return (
    <Suspense>
      <DailyListScreen />
    </Suspense>
  );
}
