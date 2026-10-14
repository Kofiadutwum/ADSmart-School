import type { Metadata } from "next";
import { Suspense } from "react";
import { ParentDataScreen } from "@/components/work/family";

export const metadata: Metadata = { title: "Your data" };

export default function Page() {
  return (
    <Suspense>
      <ParentDataScreen />
    </Suspense>
  );
}
