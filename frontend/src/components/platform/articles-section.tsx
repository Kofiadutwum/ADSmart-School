import Link from "next/link";
import { CardRail } from "@/components/site/card-rail";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import type { PlatformArticleSummary } from "@/lib/types";
import { ArticleCard } from "./article-card";

/** The newest articles and tips (business tools spec §5.3). */
export function ArticlesSection({ articles }: { articles: PlatformArticleSummary[] }) {
  if (articles.length === 0) return null;
  return (
    <section id="articles" aria-labelledby="articles-title" className="scroll-mt-24 pb-20 sm:pb-28">
      <Container>
        <SectionHeading id="articles-title" eyebrow="Articles and tips" title="Ideas to help your school grow" />
        <CardRail label="Latest articles" className="mt-10">
          {articles.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </CardRail>
        <p className="mt-6">
          <Link href="/articles" className="link inline-flex min-h-11 items-center font-semibold">
            All articles and tips
          </Link>
        </p>
      </Container>
    </section>
  );
}
