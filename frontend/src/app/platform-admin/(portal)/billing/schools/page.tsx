import type { Metadata } from "next";
import { Suspense } from "react";
import { SubscriptionsScreen } from "@/components/work/platform";

export const metadata: Metadata = { title: "Schools' plans" };

export default function Page() {
  return (
    <Suspense>
      <SubscriptionsScreen />
    </Suspense>
  );
}
