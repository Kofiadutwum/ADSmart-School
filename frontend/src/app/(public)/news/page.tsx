import type { Metadata } from "next";
import { NewsCard } from "@/components/site/news-cards";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { getNewsList } from "@/lib/api";

export const revalidate = 300;
export const metadata: Metadata = { title: "News", description: "News and updates from AD Smart School, Kronom, Kumasi." };

export default async function NewsPage() {
  const posts = await getNewsList(50);
  return (
    <>
      <PageHero eyebrow="News" title="School news" intro="Updates and stories from AD Smart School." />
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
