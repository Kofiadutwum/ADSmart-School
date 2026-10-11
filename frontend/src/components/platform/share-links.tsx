"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";

/** Plain share links: no tracking scripts from other sites (business tools spec §5.3). */
export function ShareLinks({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const links: [string, string][] = [
    ["WhatsApp", `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`],
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`],
    ["X", `https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`],
  ];
  return (
    <div>
      <h2 className="text-lg font-semibold">Share this article</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline")}>
              {label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
        <li>
          <button
            type="button"
            className={buttonClasses("outline")}
            onClick={async () => {
              await navigator.clipboard?.writeText(url);
              setCopied(true);
            }}
          >
            {copied ? "Link copied" : "Copy link"}
          </button>
        </li>
      </ul>
    </div>
  );
}
