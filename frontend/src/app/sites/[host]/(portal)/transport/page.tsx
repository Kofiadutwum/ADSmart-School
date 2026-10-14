import type { Metadata } from "next";
import { Suspense } from "react";
import { BoardingScreen } from "@/components/work/services";

export const metadata: Metadata = { title: "Boarding" };

export default function Page() {
  return (
    <Suspense>
      <BoardingScreen />
    </Suspense>
  );
}
