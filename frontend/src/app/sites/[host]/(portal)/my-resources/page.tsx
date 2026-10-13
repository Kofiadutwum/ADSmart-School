import type { Metadata } from "next";
import { Suspense } from "react";
import { MyResourcesScreen } from "@/components/work/pupil";

export const metadata: Metadata = { title: "Resources" };

export default function Page() {
  return (
    <Suspense>
      <MyResourcesScreen />
    </Suspense>
  );
}
