from datetime import date, timedelta

import pytest
from django.utils import timezone

from apps.consent.models import PrivacyNotice
from apps.school.models import School
from apps.website.models import ContentBlock, Fact, FeatureBlock, NewsPost, PhotoSlot
from tests.helpers import jpeg_upload

pytestmark = pytest.mark.django_db
SITE = "/api/public/sites/adsmart.localhost"
OTHER = "/api/public/sites/brightfuture.localhost"


def test_site_payload_describes_the_school(api, school, settings):
    settings.SITE_URL_TEMPLATE = "https://{host}"
    ContentBlock.objects.create(school=school, key="hero_headline", text="Bright beginnings")
    Fact.objects.create(school=school, label="years serving Kronom", value="{years}", order=1)
    Fact.objects.create(school=school, label="hidden", value="x", visible=False)
    FeatureBlock.objects.create(
        school=school, key="sms", title="SMS", text="t", icon="message", enabled=True
    )
    FeatureBlock.objects.create(school=school, key="momo", title="MoMo", text="t", icon="phone")
    years = timezone.localdate().year - 2001

    body = api.get(f"{SITE}/site").json()

    assert body["school"]["name"] == "AD Smart School"
    assert body["school"]["phone_display"] == "054 587 5881"
    assert body["school"]["whatsapp_link"] == "https://wa.me/233545875881"
    assert body["school"]["years_since_founding"] == years
    assert body["school"]["base_url"] == "https://adsmart.localhost"
    assert body["school"]["logo"] is None
    assert body["school"]["levels_offered"][0] == "creche"
    assert body["brand"] == {"light": {}, "dark": {}}
    assert body["content"] == {"hero_headline": "Bright beginnings"}
    assert body["facts"] == [{"label": "years serving Kronom", "value": str(years)}]
    assert [f["key"] for f in body["features"]] == ["sms"]
    assert body["is_public"] is False


def test_years_facts_are_hidden_without_a_founding_year(api, other_school):
    Fact.objects.create(school=other_school, label="years serving Ejisu", value="{years}")
    Fact.objects.create(school=other_school, label="levels under one roof", value="KG–Basic 3")

    body = api.get(f"{OTHER}/site").json()

    assert body["school"]["founded_year"] is None
    assert body["facts"] == [{"label": "levels under one roof", "value": "KG–Basic 3"}]


def test_school_colours_arrive_as_css_variables(api, school):
    school.brand_primary, school.brand_accent = "#7a1f1f", "#ffd166"
    school.save()

    body = api.get(f"{SITE}/site").json()

    assert body["brand"]["light"]["--btn-primary"] == "#7a1f1f"
    assert "--accent-indigo" in body["brand"]["dark"]


def test_site_payload_splits_gallery_photos_from_named_slots(api, school):
    PhotoSlot.objects.create(school=school, key="hero", image=jpeg_upload(), alt_text="Hero")
    PhotoSlot.objects.create(
        school=school, key="gallery_02", image=jpeg_upload(), alt_text="B", caption="Two", order=2
    )
    PhotoSlot.objects.create(
        school=school, key="gallery_01", image=jpeg_upload(), alt_text="A", caption="One", order=1
    )

    body = api.get(f"{SITE}/site").json()

    assert set(body["photos"]) == {"hero"}
    assert body["photos"]["hero"]["src"].startswith(f"/media/schools/{school.pk}/photos/")
    assert body["photos"]["hero"]["is_placeholder"] is True
    assert [p["caption"] for p in body["gallery"]] == ["One", "Two"]


def test_each_school_sees_only_its_own_content(api, school, other_school):
    ContentBlock.objects.create(school=school, key="hero_headline", text="AD Smart")
    ContentBlock.objects.create(school=other_school, key="hero_headline", text="Bright Future")

    assert api.get(f"{SITE}/site").json()["content"] == {"hero_headline": "AD Smart"}
    assert api.get(f"{OTHER}/site").json()["content"] == {"hero_headline": "Bright Future"}


def test_unknown_addresses_are_not_found(api, db):
    response = api.get("/api/public/sites/nobody.localhost/site")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_a_suspended_school_is_unavailable(api, school):
    school.status = School.Status.SUSPENDED
    school.save()

    response = api.get(f"{SITE}/site")

    assert response.status_code == 503
    assert response.json()["code"] == "suspended"


def _post(school, slug, *, published=True, hours_ago=1):
    return NewsPost.objects.create(
        school=school,
        title=slug.title(),
        slug=slug,
        summary=f"About {slug}",
        body=f"Body of {slug}",
        status=NewsPost.Status.PUBLISHED if published else NewsPost.Status.DRAFT,
        published_at=timezone.now() - timedelta(hours=hours_ago),
    )


def test_news_lists_published_posts_newest_first_with_a_limit(api, school):
    _post(school, "older", hours_ago=5)
    _post(school, "newer", hours_ago=1)
    _post(school, "draft", published=False)

    body = api.get(f"{SITE}/news?limit=1").json()

    assert [p["slug"] for p in body] == ["newer"]
    assert body[0]["cover"] is None
    assert "body" not in body[0]


def test_news_limit_falls_back_on_nonsense(api, school):
    _post(school, "only")
    assert len(api.get(f"{SITE}/news?limit=abc").json()) == 1


def test_news_detail_includes_the_body(api, school):
    _post(school, "hello")
    assert api.get(f"{SITE}/news/hello").json()["body"] == "Body of hello"


def test_draft_news_and_other_schools_news_are_not_found(api, school, other_school):
    _post(school, "draft", published=False)
    _post(other_school, "theirs")

    assert api.get(f"{SITE}/news/draft").status_code == 404
    assert api.get(f"{SITE}/news/theirs").status_code == 404
    assert api.get(f"{SITE}/news").json() == []


def test_privacy_notice_is_the_schools_current_version(api, school, other_school):
    PrivacyNotice.objects.create(
        school=school, version="1", body="Old.", effective_from=date(2025, 1, 1), is_draft=False
    )
    PrivacyNotice.objects.create(
        school=school, version="2", body="Ours.", effective_from=date(2026, 1, 1)
    )
    PrivacyNotice.objects.create(
        school=other_school, version="9", body="Theirs.", effective_from=date(2026, 6, 1)
    )

    body = api.get(f"{SITE}/privacy-notice").json()

    assert body["version"] == "2" and body["body"] == "Ours." and body["is_draft"] is True


def test_privacy_notice_404_when_the_school_has_none(api, school):
    assert api.get(f"{SITE}/privacy-notice").status_code == 404
