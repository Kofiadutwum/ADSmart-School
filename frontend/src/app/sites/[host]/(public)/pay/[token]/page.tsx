import type { Metadata } from "next";
import { Suspense } from "react";
import { PayLinkScreen } from "@/components/work/family";

export const metadata: Metadata = { title: "Pay", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Suspense>
      <PayLinkScreen token={token} />
    </Suspense>
  );
}
