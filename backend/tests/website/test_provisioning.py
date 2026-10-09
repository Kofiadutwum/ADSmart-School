import pytest
from django.core.exceptions import ValidationError
from django.core.management import CommandError, call_command

from apps.consent.models import PrivacyNotice
from apps.school.models import School
from apps.website import provisioning
from apps.website.models import ContentBlock, Fact, FeatureBlock, NewsPost, PhotoSlot
from apps.website.provisioning import create_school, provision_school
from apps.website.services import is_site_public

pytestmark = pytest.mark.django_db

DETAILS = {
    "slug": "brightfuture",
    "name": "Bright Future Academy",
    "town": "Ejisu",
    "region": "Ashanti Region",
    "phone": "024 123 4567",
    "email": "office@brightfuture.example",
}


def text(school, key):
    return ContentBlock.objects.get(school=school, key=key).text


def facts(school):
    return list(Fact.objects.for_school(school).values_list("label", "value"))


def hero(school):
    return PhotoSlot.objects.get(school=school, key="hero")


def test_a_new_school_gets_a_complete_preview_site():
    school = create_school(**DETAILS)

    assert school.phone == "+233241234567" and school.status == School.Status.TRIAL
    slots = PhotoSlot.objects.for_school(school)
    assert slots.count() == 14 and all(s.is_placeholder and s.renditions for s in slots)
    assert not FeatureBlock.objects.for_school(school).filter(enabled=True).exists()
    assert not NewsPost.objects.for_school(school).exists()
    notice = PrivacyNotice.current(school)
    assert notice.is_draft and "Bright Future Academy, Ejisu" in notice.body
    assert text(school, "hero_headline") == "Bright beginnings, from Crèche to JHS"
    assert text(school, "hero_subline") == "Ejisu"
    assert facts(school) == [("every stage of basic education", "Crèche–JHS")]
    assert not ContentBlock.objects.for_school(school).filter(needs_review=False).exists()
    assert is_site_public(school) is False


def test_the_levels_offered_shape_the_text():
    school = create_school(
        **DETAILS, founded_year=2010, levels_offered=["upper_primary", "jhs", "lower_primary"]
    )

    keys = set(ContentBlock.objects.for_school(school).values_list("key", flat=True))
    assert "level_jhs_ages" in keys and "level_creche_ages" not in keys
    assert text(school, "hero_headline") == "Bright beginnings, from Basic 1 to JHS"
    assert text(school, "hero_subline") == "Ejisu · Since 2010"
    assert facts(school) == [
        ("years serving Ejisu", "{years}"),
        ("levels under one roof", "Basic 1–JHS"),
    ]


def test_placeholder_photos_are_stored_and_converted_once_for_all_schools(monkeypatch):
    first = create_school(**DETAILS)
    calls = []
    monkeypatch.setattr(provisioning, "build_renditions", lambda name: calls.append(name) or [])
    monkeypatch.setattr("apps.core.models.build_renditions", lambda name: calls.append(name) or [])

    second = create_school(**{**DETAILS, "slug": "second-school", "name": "Second School"})

    assert calls == []
    assert hero(first).image.name == hero(second).image.name == "placeholders/hero.jpg"
    assert hero(second).renditions == hero(first).renditions


def test_invalid_details_create_nothing():
    with pytest.raises(ValidationError) as error:
        create_school(**{**DETAILS, "slug": "admin", "phone": "123"})

    assert {"slug", "phone"} <= set(error.value.message_dict)
    assert not School.objects.exists()


def test_provisioning_again_keeps_edits_and_adds_nothing():
    school = create_school(**DETAILS)
    ContentBlock.objects.filter(school=school, key="hero_headline").update(text="Our words")

    assert provision_school(school) == 0
    assert text(school, "hero_headline") == "Our words"


def test_create_school_command():
    call_command(
        "create_school",
        slug="brightfuture",
        name="Bright Future Academy",
        town="Ejisu",
        region="Ashanti Region",
        phone="0241234567",
        email="office@brightfuture.example",
        founded=2010,
        levels="kg,lower_primary",
    )

    school = School.objects.get(slug="brightfuture")
    assert school.levels_offered == ["kg", "lower_primary"] and school.founded_year == 2010
    with pytest.raises(CommandError, match="slug"):
        call_command(
            "create_school",
            slug="www",
            name="X",
            town="T",
            region="R",
            phone="0241234567",
            email="x@example.com",
        )
