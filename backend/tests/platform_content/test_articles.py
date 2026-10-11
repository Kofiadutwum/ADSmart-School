"""Business tools spec §5.3: articles and tips on the owner's website."""

from datetime import timedelta

import pytest
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.platform_content.articles import email_due_articles
from apps.platform_content.models import Article, TipSubscriber
from apps.platform_content.starter_tips import seed_starter_tips
from tests.platform_content.conftest import photo

pytestmark = pytest.mark.django_db
URL = "/api/platform/website/articles"
PUBLIC = "/api/public/platform/articles"


def new_article(client, **fields):
    return client.post(
        URL, {"kind": "tip", "title": "Make it easy to enquire", **fields}, format="json"
    )


def ready(client, **fields) -> dict:
    fields.setdefault("summary", "Small changes that help more families take the first step.")
    fields.setdefault("body", "## Answer quickly\n\nReply to every enquiry within a day.")
    response = new_article(client, **fields)
    assert response.status_code == 201, response.json()
    return response.json()


def publish(client, pk, **fields):
    return client.post(f"{URL}/{pk}/publish", {"email_subscribers": False, **fields}, format="json")


def later(monkeypatch, delta: timedelta) -> None:
    moment = timezone.now() + delta
    monkeypatch.setattr(timezone, "now", lambda: moment)


def test_content_writes_a_draft_and_the_slug_follows_the_title(content):
    response = new_article(content)

    assert response.status_code == 201
    row = response.json()
    assert row["state"] == "draft" and row["slug"] == "make-it-easy-to-enquire"
    assert row["author_name"] == "Esi Writer"
    renamed = content.patch(f"{URL}/{row['id']}", {"title": "Make enquiring easy"}, format="json")
    assert renamed.json()["slug"] == "make-enquiring-easy"
    assert (
        new_article(content, title="Make enquiring easy").json()["slug"] == "make-enquiring-easy-2"
    )
    assert AuditLog.objects.filter(
        entity_type="platform_content.article", action="CREATED"
    ).exists()


def test_publish_needs_title_summary_and_body(content):
    pk = new_article(content).json()["id"]

    response = publish(content, pk)

    assert response.status_code == 400
    assert {"summary", "body"} <= set(response.json()["fields"])


def test_published_article_is_public_with_reading_time_and_related(content, api):
    first = ready(content)
    second = ready(content, title="Keep parents informed", body=" ".join(["word"] * 450))
    news = ready(content, kind="news", title="We are live")
    for article in (first, second, news):
        assert publish(content, article["id"]).json()["state"] == "published"

    listing = api.get(PUBLIC).json()
    assert [item["slug"] for item in listing] == [news["slug"], second["slug"], first["slug"]]
    assert [item["slug"] for item in api.get(f"{PUBLIC}?kind=tip").json()] == [
        second["slug"],
        first["slug"],
    ]
    detail = api.get(f"{PUBLIC}/{second['slug']}").json()
    assert detail["reading_minutes"] == 3 and detail["body"].startswith("word")
    assert [item["slug"] for item in detail["related"]] == [first["slug"], news["slug"]]
    renamed = content.patch(f"{URL}/{second['id']}", {"title": "New title"}, format="json")
    assert renamed.json()["slug"] == second["slug"], "shared links keep working"


def test_scheduled_article_stays_hidden_until_its_time(content, api, monkeypatch):
    article = ready(content)
    when = timezone.now() + timedelta(days=2)

    assert (
        publish(content, article["id"], publish_at=when.isoformat()).json()["state"] == "scheduled"
    )
    assert api.get(PUBLIC).json() == []
    assert api.get(f"{PUBLIC}/{article['slug']}").status_code == 404
    assert api.get("/api/public/platform").json()["latest_articles"] == []

    later(monkeypatch, timedelta(days=2, minutes=1))
    assert [item["slug"] for item in api.get(PUBLIC).json()] == [article["slug"]]


def test_unpublish_hides_without_deleting(content, api):
    article = ready(content)
    publish(content, article["id"])

    response = content.post(f"{URL}/{article['id']}/unpublish")

    assert response.json()["state"] == "draft"
    assert api.get(f"{PUBLIC}/{article['slug']}").status_code == 404
    assert Article.objects.filter(pk=article["id"]).exists()


def test_only_drafts_can_be_deleted(content):
    article = ready(content)
    publish(content, article["id"])

    refused = content.delete(f"{URL}/{article['id']}")
    assert refused.status_code == 400 and "Unpublish" in refused.json()["message"]

    content.post(f"{URL}/{article['id']}/unpublish")
    assert content.delete(f"{URL}/{article['id']}").status_code == 204
    assert not Article.objects.exists()


def test_cover_and_inline_images_are_checked_and_resized(content):
    pk = new_article(content).json()["id"]
    cover = f"{URL}/{pk}/cover"

    bad = content.post(
        cover, {"image": SimpleUploadedFile("x.txt", b"x"), "cover_alt": "A"}, format="multipart"
    )
    assert bad.status_code == 400 and "image" in bad.json()["fields"]
    good = content.post(
        cover, {"image": photo(), "cover_alt": "Pupils at work"}, format="multipart"
    )
    assert good.status_code == 200 and "960w" in good.json()["cover"]["srcset"]
    assert content.delete(cover).json()["cover"] is None

    inline = content.post(
        "/api/platform/website/article-images",
        {"image": photo(), "alt_text": "Our library"},
        format="multipart",
    ).json()
    assert (
        inline["src"].startswith("/media/")
        and inline["markdown"] == f"![Our library]({inline['src']})"
    )


def subscriber(email: str, *, confirmed=True, left=False) -> TipSubscriber:
    now = timezone.now()
    return TipSubscriber.objects.create(
        email=email,
        consent_at=now,
        confirmed_at=now if confirmed else None,
        unsubscribed_at=now if left else None,
    )


def test_publishing_emails_confirmed_subscribers_once(content, django_capture_on_commit_callbacks):
    subscriber("ama@example.com")
    subscriber("pending@example.com", confirmed=False)
    subscriber("left@example.com", left=True)
    article = ready(content)

    with django_capture_on_commit_callbacks(execute=True):
        publish(content, article["id"], email_subscribers=True)

    assert [message.to for message in mail.outbox] == [["ama@example.com"]]
    message = mail.outbox[0]
    assert article["title"] in message.subject
    assert f"/articles/{article['slug']}" in message.body
    assert (
        "/tips/unsubscribe?token=" in message.body and "List-Unsubscribe" in message.extra_headers
    )
    assert email_due_articles() == 0 and len(mail.outbox) == 1


def test_scheduled_emails_go_out_from_the_command_once_live(content, monkeypatch):
    subscriber("ama@example.com")
    article = ready(content)
    when = timezone.now() + timedelta(hours=3)
    publish(content, article["id"], publish_at=when.isoformat(), email_subscribers=True)
    call_command("send_article_emails")
    assert mail.outbox == []

    later(monkeypatch, timedelta(hours=4))
    call_command("send_article_emails")
    assert len(mail.outbox) == 1


def test_starter_tips_are_drafts_and_seed_once():
    assert seed_starter_tips() == 4
    assert seed_starter_tips() == 0
    assert set(Article.objects.values_list("status", "kind")) == {("draft", "tip")}


def test_landing_payload_has_the_three_latest_articles(content, api):
    made = [ready(content, title=f"Tip number {n}") for n in range(4)]
    for article in made:
        publish(content, article["id"])

    latest = api.get("/api/public/platform").json()["latest_articles"]

    assert [item["slug"] for item in latest] == [a["slug"] for a in reversed(made[1:])]
