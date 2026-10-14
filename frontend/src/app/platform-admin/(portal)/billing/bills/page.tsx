import type { Metadata } from "next";
import { Suspense } from "react";
import { BillsScreen } from "@/components/work/platform";

export const metadata: Metadata = { title: "Bills" };

export default function Page() {
  return (
    <Suspense>
      <BillsScreen />
    </Suspense>
  );
}
