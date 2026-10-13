import type { Metadata } from "next";
import { Suspense } from "react";
import { RoutesScreen } from "@/components/work/services";

export const metadata: Metadata = { title: "Routes and stops" };

export default function Page() {
  return (
    <Suspense>
      <RoutesScreen />
    </Suspense>
  );
}
