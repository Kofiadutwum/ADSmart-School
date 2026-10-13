import type { Metadata } from "next";
import { Suspense } from "react";
import { WebsitePhotosScreen } from "@/components/work/school";

export const metadata: Metadata = { title: "Website photos" };

export default function Page() {
  return (
    <Suspense>
      <WebsitePhotosScreen />
    </Suspense>
  );
}
