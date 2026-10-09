import Link from "next/link";
import { Container } from "@/components/ui/container";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { SectionHeading } from "@/components/ui/section-heading";
import { formatDate } from "@/lib/dates";
import type { NewsSummary } from "@/lib/types";
import { CardRail } from "./card-rail";

export function NewsCard({ post }: { post: NewsSummary }) {
  return (
    <article className="surface relative flex h-full flex-col overflow-hidden rounded-card shadow-elev-1">
      {post.cover ? (
        <ResponsiveImage
          image={post.cover}
          sizes="(min-width: 1024px) 33vw, 85vw"
          className="aspect-[16/9] w-full object-cover"
        />
      ) : (
        <div aria-hidden className="bg-brand-mesh aspect-[16/9] w-full" />
      )}
      <div className="flex flex-1 flex-col p-6">
        <p className="text-sm text-ink-muted">
          <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>
        </p>
        <h3 className="mt-2 text-lg font-semibold">
          <Link href={`/news/${post.slug}`} className="after:absolute after:inset-0 hover:text-indigo">
            {post.title}
          </Link>
        </h3>
        <p className="mt-2 flex-1 text-ink-muted">{post.summary}</p>
      </div>
    </article>
  );
}

export function NewsSection({ posts }: { posts: NewsSummary[] }) {
  if (posts.length === 0) return null;
  return (
    <section aria-labelledby="news-title" className="py-20 sm:py-28">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading id="news-title" eyebrow="News" title="Latest from the school" />
          <Link href="/news" className="link inline-flex min-h-11 items-center font-medium">
            All news
          </Link>
        </div>
        <CardRail label="Latest news" className="mt-10">
          {posts.map((post) => (
            <NewsCard key={post.slug} post={post} />
          ))}
        </CardRail>
      </Container>
    </section>
  );
}
