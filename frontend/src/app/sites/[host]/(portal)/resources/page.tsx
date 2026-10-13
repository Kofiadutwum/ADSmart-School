import type { Metadata } from "next";
import { Suspense } from "react";
import { ResourcesScreen } from "@/components/work/learning";

export const metadata: Metadata = { title: "Resources" };

export default function Page() {
  return (
    <Suspense>
      <ResourcesScreen />
    </Suspense>
  );
}
