import type { Metadata } from "next";
import { Suspense } from "react";
import { SupportAccessScreen } from "@/components/work/school";

export const metadata: Metadata = { title: "Support access" };

export default function Page() {
  return (
    <Suspense>
      <SupportAccessScreen />
    </Suspense>
  );
}
