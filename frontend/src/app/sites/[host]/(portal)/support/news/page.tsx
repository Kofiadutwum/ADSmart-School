import type { Metadata } from "next";
import { Suspense } from "react";
import { PlatformNewsScreen } from "@/components/work/school";

export const metadata: Metadata = { title: "News from ADsmartschool" };

export default function Page() {
  return (
    <Suspense>
      <PlatformNewsScreen />
    </Suspense>
  );
}
