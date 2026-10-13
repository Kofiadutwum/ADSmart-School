import type { Metadata } from "next";
import { Suspense } from "react";
import { WardsView } from "@/components/school-portal/family-views";

export const metadata: Metadata = { title: "My wards" };

export default function Page() {
  return (
    <Suspense>
      <WardsView />
    </Suspense>
  );
}
