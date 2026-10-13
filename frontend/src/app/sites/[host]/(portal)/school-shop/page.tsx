import type { Metadata } from "next";
import { Suspense } from "react";
import { ParentShopScreen } from "@/components/work/family";

export const metadata: Metadata = { title: "Books and uniforms" };

export default function Page() {
  return (
    <Suspense>
      <ParentShopScreen />
    </Suspense>
  );
}
