import type { Metadata } from "next";
import { Suspense } from "react";
import { MedicalScreen } from "@/components/work/services";

export const metadata: Metadata = { title: "Medical records" };

export default function Page() {
  return (
    <Suspense>
      <MedicalScreen />
    </Suspense>
  );
}
