import type { Metadata } from "next";
import { Suspense } from "react";
import { SmsScreen } from "@/components/work/platform";

export const metadata: Metadata = { title: "Texts" };

export default function Page() {
  return (
    <Suspense>
      <SmsScreen />
    </Suspense>
  );
}
