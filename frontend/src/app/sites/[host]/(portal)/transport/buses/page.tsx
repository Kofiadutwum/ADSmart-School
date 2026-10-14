import type { Metadata } from "next";
import { Suspense } from "react";
import { BusesScreen } from "@/components/work/services";

export const metadata: Metadata = { title: "Buses and crew" };

export default function Page() {
  return (
    <Suspense>
      <BusesScreen />
    </Suspense>
  );
}
