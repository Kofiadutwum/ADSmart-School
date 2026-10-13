import type { Metadata } from "next";
import { Suspense } from "react";
import { IncidentsScreen } from "@/components/work/services";

export const metadata: Metadata = { title: "Incidents" };

export default function Page() {
  return (
    <Suspense>
      <IncidentsScreen />
    </Suspense>
  );
}
