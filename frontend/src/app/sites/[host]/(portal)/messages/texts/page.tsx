import type { Metadata } from "next";
import { Suspense } from "react";
import { TextsScreen } from "@/components/work/school";

export const metadata: Metadata = { title: "Texts and credits" };

export default function Page() {
  return (
    <Suspense>
      <TextsScreen />
    </Suspense>
  );
}
