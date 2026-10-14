import type { Metadata } from "next";
import { Suspense } from "react";
import { SpecialNeedsScreen } from "@/components/work/services";

export const metadata: Metadata = { title: "Special needs" };

export default function Page() {
  return (
    <Suspense>
      <SpecialNeedsScreen />
    </Suspense>
  );
}
