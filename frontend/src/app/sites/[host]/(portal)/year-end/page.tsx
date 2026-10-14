import type { Metadata } from "next";
import { Suspense } from "react";
import { YearEndScreen } from "@/components/work/school";

export const metadata: Metadata = { title: "Year end" };

export default function Page() {
  return (
    <Suspense>
      <YearEndScreen />
    </Suspense>
  );
}
