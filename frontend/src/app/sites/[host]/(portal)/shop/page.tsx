import type { Metadata } from "next";
import { Suspense } from "react";
import { CollectScreen } from "@/components/work/services";

export const metadata: Metadata = { title: "Collect an order" };

export default function Page() {
  return (
    <Suspense>
      <CollectScreen />
    </Suspense>
  );
}
