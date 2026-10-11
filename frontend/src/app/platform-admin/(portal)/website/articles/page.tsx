import type { Metadata } from "next";
import { ArticlesView } from "@/components/platform-admin/website/articles-view";

export const metadata: Metadata = { title: "Articles and tips" };

export default function Page() {
  return <ArticlesView />;
}
