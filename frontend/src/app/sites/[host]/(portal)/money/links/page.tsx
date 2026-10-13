import type { Metadata } from "next";
import { Suspense } from "react";
import { LinksScreen } from "@/components/work/money";

export const metadata: Metadata = { title: "Payment links" };

export default function Page() {
  return (
    <Suspense>
      <LinksScreen />
    </Suspense>
  );
}
