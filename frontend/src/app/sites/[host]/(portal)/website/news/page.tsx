import type { Metadata } from "next";
import { Suspense } from "react";
import { WebsiteNewsScreen } from "@/components/work/school";

export const metadata: Metadata = { title: "Website news" };

export default function Page() {
  return (
    <Suspense>
      <WebsiteNewsScreen />
    </Suspense>
  );
}
