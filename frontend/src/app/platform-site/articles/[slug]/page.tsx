import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KIND_LABEL } from "@/components/platform-admin/website/article-state";
import { ArticleCard } from "@/components/platform/article-card";
import { ShareLinks } from "@/components/platform/share-links";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { RichText } from "@/components/ui/rich-text";
import { getPlatform, getPlatformArticle } from "@/lib/api";
import { formatDate } from "@/lib/dates";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = await getPlatformArticle((await params).slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.summary,
    alternates: { canonical: `/articles/${article.slug}` },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.summary,
      publishedTime: article.published_at,
      images: article.cover
        ? [{ url: article.cover.src, width: article.cover.width, height: article.cover.height, alt: article.cover.alt }]
        : undefined,
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const article = await getPlatformArticle((await params).slug);
  if (!article) notFound();
  const platform = await getPlatform();
  const url = `${platform.url}/articles/${article.slug}`;
  const data = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.summary,
    datePublished: article.published_at,
    image: article.cover ? [`${platform.url}${article.cover.src}`] : undefined,
    author: article.author ? { "@type": "Person", name: article.author } : undefined,
    publisher: { "@type": "Organization", name: platform.name, url: platform.url },
    mainEntityOfPage: url,
  };
  // "<" is escaped so written text can never close the script element.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <article className="pt-28 pb-20 sm:pt-36">
      <Container className="max-w-3xl">
        <Link href="/articles" className="link inline-flex min-h-11 items-center text-sm">
          All articles and tips
        </Link>
        <p className="mt-4 text-sm font-semibold tracking-wider text-indigo uppercase">{KIND_LABEL[article.kind]}</p>
        <h1 className="mt-2 text-4xl font-bold sm:text-5xl">{article.title}</h1>
        <p className="mt-4 text-lg text-ink-muted">{article.summary}</p>
        <p className="mt-4 flex flex-wrap gap-x-4 text-sm text-ink-muted">
          {article.author && <span>By {article.author}</span>}
          <span>{formatDate(article.published_at)}</span>
          <span>{article.reading_minutes} min read</span>
        </p>
        {article.cover && (
          <ResponsiveImage
            image={article.cover}
            sizes="(min-width: 768px) 720px, 100vw"
            priority
            className="mt-8 aspect-[16/9] w-full rounded-card object-cover"
          />
        )}
        <RichText text={article.body} className="mt-10 text-lg leading-relaxed" />
        <div className="mt-12 border-t border-line pt-8">
          <ShareLinks url={url} title={article.title} />
        </div>
        <aside aria-labelledby="cta-title" className="surface mt-12 rounded-card p-6 shadow-elev-1">
          <h2 id="cta-title" className="text-2xl font-semibold">
            Want your school online?
          </h2>
          <p className="mt-2 text-ink-muted">Tell us about your school and we&apos;ll call you to talk it through.</p>
          <ButtonLink href="/#get-online" className="mt-4">
            Get your school online
          </ButtonLink>
        </aside>
      </Container>
      {article.related.length > 0 && (
        <Container className="mt-16">
          <h2 className="text-2xl font-semibold">Read next</h2>
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {article.related.map((other) => (
              <li key={other.slug}>
                <ArticleCard article={other} />
              </li>
            ))}
          </ul>
        </Container>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
    </article>
  );
}
