import type { Metadata } from "next";
import { Suspense } from "react";
import { ReceiptScreen } from "@/components/work/money";

export const metadata: Metadata = { title: "Receipt" };

export default function Page() {
  return (
    <Suspense>
      <ReceiptScreen />
    </Suspense>
  );
}
