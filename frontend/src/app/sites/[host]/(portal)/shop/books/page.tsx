import type { Metadata } from "next";
import { Suspense } from "react";
import { BooksScreen } from "@/components/work/services";

export const metadata: Metadata = { title: "Books" };

export default function Page() {
  return (
    <Suspense>
      <BooksScreen />
    </Suspense>
  );
}
