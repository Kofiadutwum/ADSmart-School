"use client";

import { MapPin } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function MapEmbed({ query, schoolName }: { query: string; schoolName: string }) {
  const [shown, setShown] = useState(false);
  const encoded = encodeURIComponent(query);
  return (
    <div className="surface overflow-hidden rounded-card">
      {shown ? (
        <iframe
          title={`Map showing ${schoolName}`}
          src={`https://www.google.com/maps?q=${encoded}&output=embed`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="aspect-[4/3] w-full border-0 sm:aspect-[16/9]"
        />
      ) : (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-4 p-6 text-center sm:aspect-[16/9]">
          <MapPin aria-hidden className="size-10 text-indigo" />
          <p className="max-w-sm text-ink-muted">The map loads only when you ask for it, to save your mobile data.</p>
          <Button onClick={() => setShown(true)}>Show map</Button>
        </div>
      )}
      <p className="border-t border-line px-4">
        <a
          className="link inline-flex min-h-12 items-center"
          href={`https://www.google.com/maps/search/?api=1&query=${encoded}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Google Maps<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </p>
    </div>
  );
}
