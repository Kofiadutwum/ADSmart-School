import type { Metadata } from "next";
import { Suspense } from "react";
import { WebsiteFactsScreen } from "@/components/work/school";

export const metadata: Metadata = { title: "Facts and features" };

export default function Page() {
  return (
    <Suspense>
      <WebsiteFactsScreen />
    </Suspense>
  );
}
