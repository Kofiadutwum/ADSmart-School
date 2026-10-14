import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Public pages read the backend while building. On Render's free plan it may be waking up (up to
  // about a minute), so allow each page longer than Next's default 60 seconds.
  staticPageGenerationTimeout: 180,
  // Cache Components stays off: public pages use time-based ISR (spec §2.2). Revisit when
  // the next major release makes it mandatory.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The browser only talks to this origin; src/proxy.ts hands API and media requests to Django.
};

export default nextConfig;
