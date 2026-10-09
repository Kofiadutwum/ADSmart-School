import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import type { ReactNode } from "react";
import { BOOT_SCRIPT } from "@/lib/boot-script";
import { THEME_COLORS } from "@/lib/theme";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: { default: "AD Smart School · Kronom, Kumasi", template: "%s · AD Smart School" },
  description:
    "AD Smart School in Kronom, Kumasi: Crèche, Nursery, KG, Primary and Junior High School since 2001.",
  applicationName: "AD Smart School",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GH" className={poppins.variable} suppressHydrationWarning>
      <head>
        {/* Sets theme and Lite mode before first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
