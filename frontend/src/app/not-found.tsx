import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="bg-brand-mesh on-dark flex min-h-dvh items-center justify-center p-6 text-white">
      <div className="glass-clear max-w-md rounded-card p-8 text-center">
        <p className="text-sm font-semibold tracking-wider uppercase">Page not found</p>
        <h1 className="mt-3 text-3xl font-bold">We couldn&apos;t find that page</h1>
        <p className="mt-4 text-white/90">It may have moved. Try the home page.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className={buttonClasses("amber")}>Go to the home page</Link>
        </div>
      </div>
    </main>
  );
}
