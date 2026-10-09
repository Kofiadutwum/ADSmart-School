"use client";

import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { edgeSafeDrag } from "@/lib/edge-drag";
import type { Photo } from "@/lib/types";
import { Lightbox } from "./lightbox";

const ARROW =
  "press surface inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-ink disabled:cursor-not-allowed disabled:opacity-40";

export function Gallery({ photos, className }: { photos: Photo[]; className?: string }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", watchDrag: edgeSafeDrag });
  const [selected, setSelected] = useState(0);
  const [, setLayoutVersion] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    const onReInit = () => setLayoutVersion((version) => version + 1);
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onReInit);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onReInit);
    };
  }, [emblaApi]);

  const snapCount = emblaApi?.scrollSnapList().length ?? photos.length;

  return (
    <div className={className}>
      <div ref={emblaRef} className="overflow-hidden">
        <ul aria-label="Photos" className="-ml-4 flex touch-pan-y">
          {photos.map((photo, index) => (
            <li key={photo.src} className="min-w-0 flex-[0_0_85%] pl-4 sm:flex-[0_0_48%] lg:flex-[0_0_33.333%]">
              <button
                type="button"
                onClick={() => setLightboxIndex(index)}
                aria-label={`Open photo: ${photo.caption || photo.alt}`}
                className="group relative block w-full cursor-pointer overflow-hidden rounded-card"
              >
                <ResponsiveImage
                  image={photo}
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 48vw, 85vw"
                  className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                {photo.caption && (
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 pt-10 pb-3 text-left text-sm font-medium text-white">
                    {photo.caption}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-sm text-ink-muted tabular-nums" aria-live="polite">
          {selected + 1} / {snapCount}
        </p>
        <div className="flex gap-2">
          <button type="button" className={ARROW} aria-label="Previous photos" disabled={!emblaApi?.canScrollPrev()} onClick={() => emblaApi?.scrollPrev()}>
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <button type="button" className={ARROW} aria-label="Next photos" disabled={emblaApi ? !emblaApi.canScrollNext() : false} onClick={() => emblaApi?.scrollNext()}>
            <ChevronRight aria-hidden className="size-5" />
          </button>
        </div>
      </div>
      <Lightbox photos={photos} index={lightboxIndex} onClose={() => setLightboxIndex(null)} />
    </div>
  );
}
