import type { Metadata } from "next";
import { Suspense } from "react";
import { TeacherPayScreen } from "@/components/work/daily";

export const metadata: Metadata = { title: "Teacher pay" };

export default function Page() {
  return (
    <Suspense>
      <TeacherPayScreen />
    </Suspense>
  );
}
