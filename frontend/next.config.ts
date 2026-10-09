import type { NextConfig } from "next";

const djangoOrigin = process.env.DJANGO_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
  // The browser only talks to this origin; Next forwards API and media requests to Django.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${djangoOrigin}/api/:path*` },
      { source: "/media/:path*", destination: `${djangoOrigin}/media/:path*` },
    ];
  },
};

export default nextConfig;
