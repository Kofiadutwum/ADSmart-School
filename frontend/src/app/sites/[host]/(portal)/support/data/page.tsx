import type { Metadata } from "next";
import { Suspense } from "react";
import { DataProtectionScreen } from "@/components/work/school";

export const metadata: Metadata = { title: "Data protection" };

export default function Page() {
  return (
    <Suspense>
      <DataProtectionScreen />
    </Suspense>
  );
}
