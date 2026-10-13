import type { Metadata } from "next";
import { Suspense } from "react";
import { UniformsScreen } from "@/components/work/services";

export const metadata: Metadata = { title: "Uniforms" };

export default function Page() {
  return (
    <Suspense>
      <UniformsScreen />
    </Suspense>
  );
}
