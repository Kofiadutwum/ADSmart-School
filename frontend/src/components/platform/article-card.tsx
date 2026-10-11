import Link from "next/link";
import { KIND_LABEL } from "@/components/platform-admin/website/article-state";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { formatDate } from "@/lib/dates";
import type { PlatformArticleSummary } from "@/lib/types";

export function ArticleCard({ article }: { article: PlatformArticleSummary }) {
  return (
    <article className="surface h-full overflow-hidden rounded-card shadow-elev-1">
      <Link href={`/articles/${article.slug}`} className="press flex h-full flex-col hover:shadow-elev-2">
        {article.cover && (
          <ResponsiveImage
            image={article.cover}
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 46vw, 82vw"
            className="aspect-[16/9] w-full object-cover"
          />
        )}
        <div className="flex flex-1 flex-col p-6">
          <p className="text-sm font-semibold text-indigo">{KIND_LABEL[article.kind]}</p>
          <h3 className="mt-2 text-xl font-semibold">{article.title}</h3>
          <p className="mt-2 flex-1 text-ink-muted">{article.summary}</p>
          <p className="mt-4 flex flex-wrap gap-x-3 text-sm text-ink-muted">
            <span>{formatDate(article.published_at)}</span>
            <span>{article.reading_minutes} min read</span>
          </p>
        </div>
      </Link>
    </article>
  );
}
