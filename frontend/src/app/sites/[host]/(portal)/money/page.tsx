import type { Metadata } from "next";
import { Suspense } from "react";
import { MoneyHome } from "@/components/work/money";

export const metadata: Metadata = { title: "Money" };

export default function Page() {
  return (
    <Suspense>
      <MoneyHome />
    </Suspense>
  );
}
