"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRef, useState } from "react";
import { CardRail } from "@/components/site/card-rail";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import type { PlatformGalleryPhoto } from "@/lib/types";

type Shown = PlatformGalleryPhoto & { image: NonNullable<PlatformGalleryPhoto["image"]> };
type Props = { photos: PlatformGalleryPhoto[]; layout?: "rail" | "grid" };

const ROUND = "press inline-flex size-12 cursor-pointer items-center justify-center rounded-full bg-white/15 hover:bg-white/25";

/** Gallery photos, each opening large (business tools spec §5.2). Swipe on phones; on a
 * keyboard, the arrow keys move and Escape closes. */
export function PhotoGrid({ photos, layout = "rail" }: Props) {
  const shown = photos.filter((photo): photo is Shown => photo.image !== null);
  const [open, setOpen] = useState<number | null>(null);
  if (shown.length === 0) return null;
  const tiles = shown.map((photo, index) => (
    <button
      key={photo.id}
      type="button"
      onClick={() => setOpen(index)}
      aria-label={`Open photo: ${photo.caption || photo.image.alt}`}
      className="press block w-full cursor-zoom-in overflow-hidden rounded-card shadow-elev-1"
    >
      <ResponsiveImage
        image={photo.image}
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 46vw, 82vw"
        className="aspect-[4/3] w-full object-cover"
      />
    </button>
  ));
  return (
    <>
      {layout === "rail" ? (
        <CardRail label="Gallery photos" className="mt-10">
          {tiles}
        </CardRail>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile, index) => (
            <li key={shown[index].id}>{tile}</li>
          ))}
        </ul>
      )}
      <Lightbox photos={shown} index={open} onIndex={setOpen} />
    </>
  );
}

function Lightbox({ photos, index, onIndex }: { photos: Shown[]; index: number | null; onIndex: (index: number | null) => void }) {
  const start = useRef<number | null>(null);
  const photo = index === null ? null : photos[index];
  const go = (delta: number) => {
    if (index !== null) onIndex((index + delta + photos.length) % photos.length);
  };
  return (
    <Dialog.Root open={photo !== null} onOpenChange={(isOpen) => !isOpen && onIndex(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/85" />
        <Dialog.Content
          aria-describedby={undefined}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") go(1);
            if (event.key === "ArrowLeft") go(-1);
          }}
          onPointerDown={(event) => {
            start.current = event.clientX;
          }}
          onPointerUp={(event) => {
            if (start.current === null) return;
            const moved = event.clientX - start.current;
            start.current = null;
            if (Math.abs(moved) > 50) go(moved < 0 ? 1 : -1);
          }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-4 text-white outline-none"
        >
          <Dialog.Title className="text-center text-lg font-semibold">
            {photo && index !== null ? photo.caption || `Photo ${index + 1} of ${photos.length}` : ""}
          </Dialog.Title>
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element -- WebP renditions from Django
            <img
              src={photo.image.src}
              srcSet={photo.image.srcset}
              sizes="100vw"
              alt={photo.image.alt}
              className="max-h-[75dvh] w-auto max-w-full rounded-card object-contain"
            />
          )}
          <div className="flex gap-3">
            {photos.length > 1 && (
              <>
                <button type="button" className={ROUND} aria-label="Previous photo" onClick={() => go(-1)}>
                  <ChevronLeft aria-hidden className="size-6" />
                </button>
                <button type="button" className={ROUND} aria-label="Next photo" onClick={() => go(1)}>
                  <ChevronRight aria-hidden className="size-6" />
                </button>
              </>
            )}
            <Dialog.Close className={ROUND} aria-label="Close">
              <X aria-hidden className="size-6" />
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
