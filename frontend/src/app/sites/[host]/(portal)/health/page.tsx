import type { Metadata } from "next";
import { Suspense } from "react";
import { SickbayScreen } from "@/components/work/services";

export const metadata: Metadata = { title: "Sickbay" };

export default function Page() {
  return (
    <Suspense>
      <SickbayScreen />
    </Suspense>
  );
}
