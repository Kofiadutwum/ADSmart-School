import type { Metadata } from "next";
import { Suspense } from "react";
import { RidersScreen } from "@/components/work/services";

export const metadata: Metadata = { title: "Riders" };

export default function Page() {
  return (
    <Suspense>
      <RidersScreen />
    </Suspense>
  );
}
