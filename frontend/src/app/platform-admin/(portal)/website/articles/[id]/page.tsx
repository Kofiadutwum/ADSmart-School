import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleEditor } from "@/components/platform-admin/website/article-editor";

export const metadata: Metadata = { title: "Edit article" };

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  return <ArticleEditor id={id} />;
}
