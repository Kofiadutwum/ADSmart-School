import type { Metadata } from "next";
import { Suspense } from "react";
import { WeeklyStatementsScreen } from "@/components/work/daily";

export const metadata: Metadata = { title: "Weekly statements" };

export default function Page() {
  return (
    <Suspense>
      <WeeklyStatementsScreen />
    </Suspense>
  );
}
