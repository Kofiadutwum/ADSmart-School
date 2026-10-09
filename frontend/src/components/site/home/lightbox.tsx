"use client";

import * as Dialog from "@radix-ui/react-dialog";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { edgeSafeDrag } from "@/lib/edge-drag";
import type { Photo } from "@/lib/types";
import { useSwipeDown } from "@/lib/use-swipe-down";

type Props = { photos: Photo[]; index: number | null; onClose: () => void };

const ROUND_BUTTON =
  "press inline-flex size-12 cursor-pointer items-center justify-center rounded-full bg-white/10 hover:bg-white/20";

export function Lightbox({ photos, index, onClose }: Props) {
  return (
    <Dialog.Root open={index !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade-in fixed inset-0 z-50 bg-black/90" />
        <Dialog.Content aria-describedby={undefined} className="on-dark fixed inset-0 z-50 flex flex-col text-white outline-none">
          <Dialog.Title className="sr-only">Photo viewer</Dialog.Title>
          {index !== null && <LightboxBody photos={photos} startIndex={index} onClose={onClose} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function LightboxBody({ photos, startIndex, onClose }: { photos: Photo[]; startIndex: number; onClose: () => void }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ startIndex, watchDrag: edgeSafeDrag });
  const [selected, setSelected] = useState(startIndex);
  const swipe = useSwipeDown(onClose);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      emblaApi?.scrollNext();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      emblaApi?.scrollPrev();
    }
  }

  return (
    <div className="flex h-full flex-col" onKeyDown={onKeyDown}>
      <div className="flex items-center justify-between gap-4 p-4">
        <p aria-live="polite" className="text-sm tabular-nums">
          Photo {selected + 1} of {photos.length}
        </p>
        <Dialog.Close asChild>
          <button type="button" aria-label="Close photo viewer" className={ROUND_BUTTON}>
            <X aria-hidden className="size-6" />
          </button>
        </Dialog.Close>
      </div>
      <div
        data-testid="lightbox-swipe"
        className="min-h-0 flex-1 touch-none"
        style={{
          transform: swipe.offset ? `translateY(${swipe.offset}px)` : undefined,
          opacity: swipe.offset ? Math.max(0.4, 1 - swipe.offset / 400) : undefined,
        }}
        {...swipe.handlers}
      >
        <div ref={emblaRef} className="h-full overflow-hidden">
          <div className="flex h-full">
            {photos.map((photo) => (
              <figure key={photo.src} className="flex min-w-0 flex-[0_0_100%] flex-col items-center justify-center px-4">
                <ResponsiveImage image={photo} sizes="100vw" className="max-h-[72svh] w-auto max-w-full rounded-card object-contain" />
                {photo.caption && <figcaption className="mt-3 text-center text-white/90">{photo.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button type="button" aria-label="Previous photo" className={ROUND_BUTTON} onClick={() => emblaApi?.scrollPrev()}>
          <ChevronLeft aria-hidden className="size-6" />
        </button>
        <button type="button" aria-label="Next photo" className={ROUND_BUTTON} onClick={() => emblaApi?.scrollNext()}>
          <ChevronRight aria-hidden className="size-6" />
        </button>
      </div>
    </div>
  );
}
