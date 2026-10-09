from datetime import date, timedelta

import pytest
from django.utils import timezone

from apps.consent.models import PrivacyNotice
from apps.website.models import ContentBlock, Fact, FeatureBlock, NewsPost, PhotoSlot
from tests.helpers import jpeg_upload

pytestmark = pytest.mark.django_db


def test_site_payload_describes_the_school(api, school):
    ContentBlock.objects.create(key="hero_headline", text="Bright beginnings")
    Fact.objects.create(label="years serving Kronom", value="{years}", order=1)
    Fact.objects.create(label="hidden", value="x", visible=False)
    FeatureBlock.objects.create(key="sms", title="SMS", text="t", icon="message", enabled=True)
    FeatureBlock.objects.create(key="momo", title="MoMo", text="t", icon="phone")
    years = timezone.localdate().year - 2001

    body = api.get("/api/public/site").json()

    assert body["school"]["name"] == "AD Smart School"
    assert body["school"]["phone_display"] == "054 587 5881"
    assert body["school"]["whatsapp_link"] == "https://wa.me/233545875881"
    assert body["school"]["years_since_founding"] == years
    assert body["content"] == {"hero_headline": "Bright beginnings"}
    assert body["facts"] == [{"label": "years serving Kronom", "value": str(years)}]
    assert [f["key"] for f in body["features"]] == ["sms"]
    assert body["is_public"] is False


def test_site_payload_splits_gallery_photos_from_named_slots(api, school):
    PhotoSlot.objects.create(key="hero", image=jpeg_upload(), alt_text="Hero", order=0)
    PhotoSlot.objects.create(
        key="gallery_02", image=jpeg_upload(), alt_text="B", caption="Two", order=2
    )
    PhotoSlot.objects.create(
        key="gallery_01", image=jpeg_upload(), alt_text="A", caption="One", order=1
    )

    body = api.get("/api/public/site").json()

    assert set(body["photos"]) == {"hero"}
    assert body["photos"]["hero"]["alt"] == "Hero"
    assert body["photos"]["hero"]["src"].startswith("/media/site/photos/")
    assert body["photos"]["hero"]["is_placeholder"] is True
    assert [p["caption"] for p in body["gallery"]] == ["One", "Two"]


def test_site_payload_with_no_photos(api, school):
    body = api.get("/api/public/site").json()

    assert body["photos"] == {}
    assert body["gallery"] == []


def test_site_returns_503_before_the_school_is_set_up(api, db):
    response = api.get("/api/public/site")

    assert response.status_code == 503
    assert response.json()["code"] == "not_configured"


def _post(slug, *, published=True, hours_ago=1):
    return NewsPost.objects.create(
        title=slug.title(),
        slug=slug,
        summary=f"About {slug}",
        body=f"Body of {slug}",
        status=NewsPost.Status.PUBLISHED if published else NewsPost.Status.DRAFT,
        published_at=timezone.now() - timedelta(hours=hours_ago),
    )


def test_news_lists_published_posts_newest_first_with_a_limit(api, db):
    _post("older", hours_ago=5)
    _post("newer", hours_ago=1)
    _post("draft", published=False)

    body = api.get("/api/public/news?limit=1").json()

    assert [p["slug"] for p in body] == ["newer"]
    assert body[0]["cover"] is None
    assert "body" not in body[0]


def test_news_limit_falls_back_on_nonsense(api, db):
    _post("only")

    assert len(api.get("/api/public/news?limit=abc").json()) == 1


def test_news_detail_includes_the_body(api, db):
    _post("hello")

    body = api.get("/api/public/news/hello").json()

    assert body["body"] == "Body of hello"


def test_draft_news_is_not_found(api, db):
    _post("secret", published=False)

    response = api.get("/api/public/news/secret")

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_privacy_notice_returns_the_current_version(api, db):
    PrivacyNotice.objects.create(version="2026-1", body="Text", effective_from=date(2026, 1, 1))

    body = api.get("/api/public/privacy-notice").json()

    assert body == {
        "version": "2026-1",
        "title": "Privacy notice",
        "body": "Text",
        "effective_from": "2026-01-01",
        "is_draft": True,
    }


def test_privacy_notice_404_when_none_is_in_effect(api, db):
    response = api.get("/api/public/privacy-notice")

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"
