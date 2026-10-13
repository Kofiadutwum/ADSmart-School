import type { Metadata } from "next";
import { Suspense } from "react";
import { AnnouncementsScreen } from "@/components/work/school";

export const metadata: Metadata = { title: "Announcements" };

export default function Page() {
  return (
    <Suspense>
      <AnnouncementsScreen />
    </Suspense>
  );
}
