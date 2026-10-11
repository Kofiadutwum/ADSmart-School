import { formatDate, formatDateTime } from "@/lib/dates";
import type { AdminArticle, ArticleKind } from "@/lib/types";

export const KIND_LABEL: Record<ArticleKind, string> = { tip: "Tip for schools", news: "News" };

export function stateText(article: AdminArticle): string {
  if (article.state === "draft" || !article.publish_at) return "Draft";
  return article.state === "scheduled"
    ? `Scheduled for ${formatDateTime(article.publish_at)}`
    : `Published ${formatDate(article.publish_at)}`;
}
