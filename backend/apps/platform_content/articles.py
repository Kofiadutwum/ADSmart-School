"""Articles and tips (business tools spec §5.3): what the website shows, and the emails."""

import logging
import math

from django.conf import settings
from django.core.mail import EmailMessage
from django.utils import timezone

from apps.core.images import image_payload
from apps.platform_content.models import Article, TipSubscriber
from apps.platform_content.tips import platform_url, unsubscribe_url

log = logging.getLogger(__name__)
WORDS_PER_MINUTE = 200
RELATED = 3


def reading_minutes(body: str) -> int:
    return max(1, math.ceil(len(body.split()) / WORDS_PER_MINUTE))


def summary(article: Article) -> dict:
    return {
        "slug": article.slug,
        "kind": article.kind,
        "title": article.title,
        "summary": article.summary,
        "cover": image_payload(article.renditions, article.cover_alt),
        "author": article.author_name,
        "published_at": article.publish_at,
        "reading_minutes": reading_minutes(article.body),
    }


def related(article: Article) -> list[Article]:
    """The same kind first, then the newest of the rest."""
    others = Article.objects.public().exclude(pk=article.pk)
    found = list(others.filter(kind=article.kind)[:RELATED])
    if len(found) < RELATED:
        found += list(others.exclude(kind=article.kind)[: RELATED - len(found)])
    return found


def detail(article: Article) -> dict:
    return {
        **summary(article),
        "body": article.body,
        "related": [summary(other) for other in related(article)],
    }


def _message(article: Article, subscriber: TipSubscriber) -> EmailMessage:
    leave = unsubscribe_url(subscriber)
    body = "\n".join(
        [
            article.title,
            "",
            article.summary,
            "",
            f"Read it here: {platform_url(f'/articles/{article.slug}')}",
            "",
            "--",
            f"You're getting this because you asked {settings.PLATFORM_NAME} for new tips.",
            f"Unsubscribe with one click: {leave}",
        ]
    )
    return EmailMessage(
        subject=f"{settings.PLATFORM_NAME}: {article.title}",
        body=body,
        to=[subscriber.email],
        headers={"List-Unsubscribe": f"<{leave}>"},
    )


def email_due_articles() -> int:
    """Emails each live article that asked for it, once. Called on publishing and by the
    send_article_emails command for scheduled ones. shortcut: sends one by one in the caller;
    move to a task queue when the subscriber list grows past a few hundred."""
    sent = 0
    for article in Article.objects.public().filter(email_subscribers=True, emailed_at__isnull=True):
        claimed = Article.objects.filter(pk=article.pk, emailed_at__isnull=True).update(
            emailed_at=timezone.now()
        )
        if not claimed:  # another run is sending it
            continue
        for subscriber in TipSubscriber.objects.subscribed():
            try:
                _message(article, subscriber).send()
                sent += 1
            except Exception:  # one bad address must not stop the rest
                log.exception(
                    "Couldn't email article %s to subscriber %s", article.pk, subscriber.pk
                )
    return sent
