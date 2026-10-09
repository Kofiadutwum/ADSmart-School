import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Temporarily unavailable",
  robots: { index: false, follow: false },
};

/** Shown instead of a suspended school's pages (amendment §2.4). */
export default function UnavailablePage() {
  return (
    <main id="main" className="bg-brand-mesh on-dark flex min-h-dvh items-center justify-center p-6 text-white">
      <div className="glass-clear max-w-md rounded-card p-8 text-center">
        <h1 className="text-3xl font-bold">This school&apos;s website is temporarily unavailable</h1>
        <p className="mt-4 text-white/90">Please try again later, or contact the school directly.</p>
      </div>
    </main>
  );
}
