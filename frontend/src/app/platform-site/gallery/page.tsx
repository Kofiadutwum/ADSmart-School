import type { Metadata } from "next";
import { PhotoGrid } from "@/components/platform/photo-grid";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { getPlatform } from "@/lib/api";

export const revalidate = 300;
export const metadata: Metadata = { title: "Gallery" };

export default async function GalleryPage() {
  const { gallery } = await getPlatform();
  return (
    <>
      <PageHero eyebrow="Gallery" title="A closer look" />
      <section className="pb-16 sm:pb-24">
        <Container>
          {gallery.length === 0 ? (
            <p className="mt-10 text-ink-muted">No photos yet.</p>
          ) : (
            <PhotoGrid photos={gallery} layout="grid" />
          )}
        </Container>
      </section>
    </>
  );
}
