import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { RichText } from "@/components/ui/rich-text";
import { getNewsList, getNewsPost } from "@/lib/api";
import { formatDate } from "@/lib/dates";

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 300;

export async function generateStaticParams() {
  return (await getNewsList(50)).map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getNewsPost((await params).slug);
  if (!post) return { title: "News" };
  return {
    title: post.title,
    description: post.summary,
    openGraph: {
      title: post.title,
      description: post.summary,
      type: "article",
      publishedTime: post.published_at,
      images: post.cover ? [{ url: post.cover.src, width: post.cover.width, height: post.cover.height, alt: post.cover.alt }] : undefined,
    },
  };
}

export default async function NewsArticlePage({ params }: Props) {
  const post = await getNewsPost((await params).slug);
  if (!post) notFound();
  return (
    <article>
      <PageHero eyebrow={formatDate(post.published_at)} title={post.title} intro={post.summary} />
      <Container className="py-16 sm:py-24">
        <div className="mx-auto max-w-3xl">
          {post.cover && (
            <ResponsiveImage
              image={post.cover}
              sizes="(min-width: 768px) 768px, 100vw"
              className="mb-10 aspect-[16/9] w-full rounded-card object-cover"
            />
          )}
          <RichText text={post.body} className="text-lg" />
          <Link href="/news" className="link mt-12 inline-flex min-h-11 items-center font-medium">
            <span aria-hidden>←&nbsp;</span>All news
          </Link>
        </div>
      </Container>
    </article>
  );
}
