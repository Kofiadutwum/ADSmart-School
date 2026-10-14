import type { Metadata } from "next";
import { Suspense } from "react";
import { InvoicesScreen } from "@/components/work/money";

export const metadata: Metadata = { title: "Invoices" };

export default function Page() {
  return (
    <Suspense>
      <InvoicesScreen />
    </Suspense>
  );
}
