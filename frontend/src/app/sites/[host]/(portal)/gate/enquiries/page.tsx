import type { Metadata } from "next";
import { Suspense } from "react";
import { EnquiriesScreen } from "@/components/work/services";

export const metadata: Metadata = { title: "Enquiries" };

export default function Page() {
  return (
    <Suspense>
      <EnquiriesScreen />
    </Suspense>
  );
}
