import type { Metadata } from "next";
import { NewsCard } from "@/components/site/news-cards";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { getNewsList, getSite } from "@/lib/api";

type Props = { params: Promise<{ host: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { school } = await getSite((await params).host);
  return { title: "News", description: `News and updates from ${school.name}, ${school.town}.` };
}

export default async function NewsPage({ params }: Props) {
  const { host } = await params;
  const [site, posts] = await Promise.all([getSite(host), getNewsList(host, 50)]);
  return (
    <>
      <PageHero eyebrow="News" title="School news" intro={`Updates and stories from ${site.school.name}.`} />
      <section className="py-16 sm:py-24">
        <Container>
          {posts.length === 0 ? (
            <p className="surface rounded-card p-8 text-center text-lg text-ink-muted">No news yet. Please check back soon.</p>
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <li key={post.slug}>
                  <NewsCard post={post} />
                </li>
              ))}
            </ul>
          )}
        </Container>
      </section>
    </>
  );
}
