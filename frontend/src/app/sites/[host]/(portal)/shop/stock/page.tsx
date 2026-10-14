import type { Metadata } from "next";
import { Suspense } from "react";
import { StockScreen } from "@/components/work/services";

export const metadata: Metadata = { title: "Stock" };

export default function Page() {
  return (
    <Suspense>
      <StockScreen />
    </Suspense>
  );
}
