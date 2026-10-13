import type { Metadata } from "next";
import { Suspense } from "react";
import { WebsiteTextScreen } from "@/components/work/school";

export const metadata: Metadata = { title: "Website text" };

export default function Page() {
  return (
    <Suspense>
      <WebsiteTextScreen />
    </Suspense>
  );
}
