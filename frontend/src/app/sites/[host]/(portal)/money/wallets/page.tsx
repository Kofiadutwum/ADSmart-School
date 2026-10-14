import type { Metadata } from "next";
import { Suspense } from "react";
import { WalletsScreen } from "@/components/work/money";

export const metadata: Metadata = { title: "Wallets" };

export default function Page() {
  return (
    <Suspense>
      <WalletsScreen />
    </Suspense>
  );
}
