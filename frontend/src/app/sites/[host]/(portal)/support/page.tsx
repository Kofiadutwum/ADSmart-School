import type { Metadata } from "next";
import { Suspense } from "react";
import { SupportScreen } from "@/components/work/school";

export const metadata: Metadata = { title: "Help" };

export default function Page() {
  return (
    <Suspense>
      <SupportScreen />
    </Suspense>
  );
}
