import type { Metadata } from "next";
import { Suspense } from "react";
import { SubscriptionScreen } from "@/components/work/platform";

export const metadata: Metadata = { title: "School plan" };

export default function Page() {
  return (
    <Suspense>
      <SubscriptionScreen />
    </Suspense>
  );
}
