from datetime import timedelta

import pytest
from django.utils import timezone

from apps.website.models import Fact, NewsPost, PhotoSlot
from tests.helpers import jpeg_upload

pytestmark = pytest.mark.django_db


def test_photo_slot_builds_renditions_when_created():
    slot = PhotoSlot.objects.create(key="hero", image=jpeg_upload(size=(1200, 800)), alt_text="x")

    slot.refresh_from_db()
    assert [r["width"] for r in slot.renditions] == [480, 960, 1200]


def test_photo_slot_rebuilds_only_when_the_image_changes(monkeypatch):
    slot = PhotoSlot.objects.create(key="hero", image=jpeg_upload(), alt_text="x")
    calls = []
    monkeypatch.setattr("apps.core.models.build_renditions", lambda name: calls.append(name) or [])

    slot.alt_text = "Better alt text"
    slot.save()
    assert calls == []

    slot.image = jpeg_upload(name="replacement.jpg")
    slot.save()
    assert len(calls) == 1


def test_news_cover_is_optional_and_has_no_renditions_without_it():
    post = NewsPost.objects.create(title="Hello", slug="hello", summary="s", body="b")

    assert post.renditions == []


def test_published_news_excludes_drafts_and_future_posts():
    now = timezone.now()
    NewsPost.objects.create(
        title="Live",
        slug="live",
        summary="s",
        body="b",
        status=NewsPost.Status.PUBLISHED,
        published_at=now - timedelta(hours=1),
    )
    NewsPost.objects.create(title="Draft", slug="draft", summary="s", body="b")
    NewsPost.objects.create(
        title="Later",
        slug="later",
        summary="s",
        body="b",
        status=NewsPost.Status.PUBLISHED,
        published_at=now + timedelta(days=1),
    )

    assert [p.slug for p in NewsPost.objects.published()] == ["live"]


def test_fact_values_can_show_years_since_founding():
    fact = Fact(label="years serving Kronom", value="{years}")

    assert fact.display_value(25) == "25"
