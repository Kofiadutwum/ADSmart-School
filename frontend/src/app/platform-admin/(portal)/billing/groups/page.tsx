import type { Metadata } from "next";
import { Suspense } from "react";
import { GroupsScreen } from "@/components/work/platform";

export const metadata: Metadata = { title: "School groups" };

export default function Page() {
  return (
    <Suspense>
      <GroupsScreen />
    </Suspense>
  );
}
