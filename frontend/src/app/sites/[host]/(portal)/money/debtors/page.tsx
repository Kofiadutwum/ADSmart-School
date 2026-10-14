import type { Metadata } from "next";
import { Suspense } from "react";
import { DebtorsScreen } from "@/components/work/money";

export const metadata: Metadata = { title: "Debtors" };

export default function Page() {
  return (
    <Suspense>
      <DebtorsScreen />
    </Suspense>
  );
}
