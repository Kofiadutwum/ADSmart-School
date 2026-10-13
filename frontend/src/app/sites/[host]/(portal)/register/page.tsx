import type { Metadata } from "next";
import { Suspense } from "react";
import { RegisterScreen } from "@/components/work/learning";

export const metadata: Metadata = { title: "Attendance" };

export default function Page() {
  return (
    <Suspense>
      <RegisterScreen />
    </Suspense>
  );
}
