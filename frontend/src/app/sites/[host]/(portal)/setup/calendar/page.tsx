import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarSetup } from "@/components/school-portal/role-pages";

export const metadata: Metadata = { title: "Calendar" };

export default function Page() {
  return (
    <Suspense>
      <CalendarSetup />
    </Suspense>
  );
}
