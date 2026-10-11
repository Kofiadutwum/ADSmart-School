import type { Metadata } from "next";
import Link from "next/link";
import { ArticleCard } from "@/components/platform/article-card";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { getPlatformArticles } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { ArticleKind } from "@/lib/types";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Articles and tips",
  description: "News and practical tips to help schools in Ghana run and grow.",
};

const FILTERS: [ArticleKind | undefined, string][] = [
  [undefined, "All"],
  ["tip", "Tips for schools"],
  ["news", "News"],
];

export default async function ArticlesPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const filter = kind === "tip" || kind === "news" ? kind : undefined;
  const articles = await getPlatformArticles(filter);
  return (
    <>
      <PageHero eyebrow="Articles and tips" title="Ideas to help your school grow" />
      <section className="py-16 sm:py-24">
        <Container>
          <nav aria-label="Show" className="flex flex-wrap gap-2">
            {FILTERS.map(([value, label]) => (
              <Link
                key={label}
                href={value ? `/articles?kind=${value}` : "/articles"}
                aria-current={filter === value ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border border-line px-4 font-semibold",
                  filter === value ? "border-indigo bg-indigo text-white" : "hover:bg-ink/5",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
          {articles.length === 0 ? (
            <p className="mt-10 text-ink-muted">No articles here yet.</p>
          ) : (
            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((article) => (
                <li key={article.slug}>
                  <ArticleCard article={article} />
                </li>
              ))}
            </ul>
          )}
        </Container>
      </section>
    </>
  );
}
