import type { Metadata } from "next";
import { Suspense } from "react";
import { TipsLink } from "@/components/platform/tips-link";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

export default function TipsPage() {
  return (
    <section className="pt-32 pb-20 sm:pt-40">
      <Container className="max-w-2xl">
        <Suspense>
          <TipsLink action="unsubscribe" />
        </Suspense>
      </Container>
    </section>
  );
}
