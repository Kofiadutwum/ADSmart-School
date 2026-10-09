from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.website.models import ContentBlock, Fact, NewsPost, PhotoSlot
from tests.helpers import jpeg_upload

pytestmark = pytest.mark.django_db


def test_photo_slot_builds_renditions_when_created(school):
    slot = PhotoSlot.objects.create(
        school=school, key="hero", image=jpeg_upload(size=(1200, 800)), alt_text="x"
    )

    slot.refresh_from_db()
    assert [r["width"] for r in slot.renditions] == [480, 960, 1200]
    assert slot.image.name.startswith(f"schools/{school.pk}/photos/")


def test_photo_slot_rebuilds_only_when_the_image_changes(school, monkeypatch):
    slot = PhotoSlot.objects.create(school=school, key="hero", image=jpeg_upload(), alt_text="x")
    calls = []
    monkeypatch.setattr("apps.core.models.build_renditions", lambda name: calls.append(name) or [])

    slot.alt_text = "Better alt text"
    slot.save()
    assert calls == []

    slot.image = jpeg_upload(name="replacement.jpg")
    slot.save()
    assert len(calls) == 1


def test_renditions_given_up_front_are_kept(school, monkeypatch):
    calls = []
    monkeypatch.setattr("apps.core.models.build_renditions", lambda name: calls.append(name) or [])
    ready = [{"width": 480, "height": 360, "name": "placeholders/hero-480w.webp"}]

    slot = PhotoSlot.objects.create(
        school=school, key="hero", image="placeholders/hero.jpg", renditions=ready, alt_text="x"
    )

    assert calls == []
    slot.refresh_from_db()
    assert slot.renditions == ready


def test_keys_are_unique_within_a_school_only(school, other_school):
    ContentBlock.objects.create(school=school, key="hero_headline", text="a")
    ContentBlock.objects.create(school=other_school, key="hero_headline", text="b")
    with pytest.raises(IntegrityError), transaction.atomic():
        ContentBlock.objects.create(school=school, key="hero_headline", text="c")


def test_news_cover_is_optional_and_has_no_renditions_without_it(school):
    post = NewsPost.objects.create(
        school=school, title="Hello", slug="hello", summary="s", body="b"
    )
    assert post.renditions == []


def test_published_news_excludes_drafts_and_future_posts(school):
    now = timezone.now()
    common = {"school": school, "summary": "s", "body": "b"}
    NewsPost.objects.create(
        title="Live",
        slug="live",
        status=NewsPost.Status.PUBLISHED,
        published_at=now - timedelta(hours=1),
        **common,
    )
    NewsPost.objects.create(title="Draft", slug="draft", **common)
    NewsPost.objects.create(
        title="Later",
        slug="later",
        status=NewsPost.Status.PUBLISHED,
        published_at=now + timedelta(days=1),
        **common,
    )

    assert [p.slug for p in NewsPost.objects.for_school(school).published()] == ["live"]


def test_fact_values_show_years_since_founding_or_hide():
    fact = Fact(label="years serving Kronom", value="{years}")
    assert fact.display_value(25) == "25"
    assert fact.display_value(None) is None
    assert Fact(label="levels", value="KG–JHS").display_value(None) == "KG–JHS"
