import type { Metadata } from "next";
import { Suspense } from "react";
import { StatementsScreen } from "@/components/work/money";

export const metadata: Metadata = { title: "Statements" };

export default function Page() {
  return (
    <Suspense>
      <StatementsScreen />
    </Suspense>
  );
}
