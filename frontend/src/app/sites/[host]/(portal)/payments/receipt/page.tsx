import type { Metadata } from "next";
import { Suspense } from "react";
import { ParentReceiptScreen } from "@/components/work/family";

export const metadata: Metadata = { title: "Receipt" };

export default function Page() {
  return (
    <Suspense>
      <ParentReceiptScreen />
    </Suspense>
  );
}
