import type { Metadata } from "next";
import { Suspense } from "react";
import { ParentNewsScreen } from "@/components/work/family";

export const metadata: Metadata = { title: "News from the school" };

export default function Page() {
  return (
    <Suspense>
      <ParentNewsScreen />
    </Suspense>
  );
}
