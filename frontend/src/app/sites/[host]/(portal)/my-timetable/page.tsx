import type { Metadata } from "next";
import { Suspense } from "react";
import { MyTimetableScreen } from "@/components/work/pupil";

export const metadata: Metadata = { title: "Timetable" };

export default function Page() {
  return (
    <Suspense>
      <MyTimetableScreen />
    </Suspense>
  );
}
