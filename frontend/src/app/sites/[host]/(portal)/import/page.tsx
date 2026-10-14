import type { Metadata } from "next";
import { Suspense } from "react";
import { ImportScreen } from "@/components/school-portal/import-view";

export const metadata: Metadata = { title: "Import from a spreadsheet" };

export default function Page() {
  return (
    <Suspense>
      <ImportScreen />
    </Suspense>
  );
}
