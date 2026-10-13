import type { Metadata } from "next";
import { Suspense } from "react";
import { LeaveScreen } from "@/components/work/learning";

export const metadata: Metadata = { title: "Leave" };

export default function Page() {
  return (
    <Suspense>
      <LeaveScreen />
    </Suspense>
  );
}
