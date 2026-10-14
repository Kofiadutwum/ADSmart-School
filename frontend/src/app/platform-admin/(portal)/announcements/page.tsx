import type { Metadata } from "next";
import { Suspense } from "react";
import { PlatformAnnouncementsScreen } from "@/components/work/platform";

export const metadata: Metadata = { title: "Announcements" };

export default function Page() {
  return (
    <Suspense>
      <PlatformAnnouncementsScreen />
    </Suspense>
  );
}
