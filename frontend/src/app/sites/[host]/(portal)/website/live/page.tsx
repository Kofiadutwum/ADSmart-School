import type { Metadata } from "next";
import { Suspense } from "react";
import { WebsiteLiveScreen } from "@/components/work/school";

export const metadata: Metadata = { title: "Go live" };

export default function Page() {
  return (
    <Suspense>
      <WebsiteLiveScreen />
    </Suspense>
  );
}
