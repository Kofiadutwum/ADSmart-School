import pytest

from apps.consent.models import PrivacyNotice
from apps.school.models import School
from apps.website.models import ContentBlock, FeatureBlock, NewsPost, PhotoSlot
from apps.website.seed_data import LEVEL_CODES
from apps.website.seeding import seed_website
from apps.website.services import is_site_public

pytestmark = pytest.mark.django_db


def test_seed_creates_ad_smart_school_with_its_logo_and_a_preview_site():
    created = seed_website()

    school = School.objects.get(slug="adsmart")
    assert created > 0
    assert school.phone == "+233545875881" and school.founded_year == 2001
    assert school.renditions, "the logo has renditions"
    hero_subline = ContentBlock.objects.get(school=school, key="hero_subline")
    assert hero_subline.text == "Kronom, Kumasi · Since 2001"
    assert PhotoSlot.objects.for_school(school).count() == 14
    assert not PhotoSlot.objects.filter(is_placeholder=False).exists()
    assert not FeatureBlock.objects.filter(enabled=True).exists()
    assert NewsPost.objects.for_school(school).published().count() == 1
    assert PrivacyNotice.current(school).is_draft is True
    assert is_site_public(school) is False


def test_seed_provides_every_level_block():
    seed_website()
    keys = set(ContentBlock.objects.values_list("key", flat=True))

    for code in LEVEL_CODES:
        assert {f"level_{code}_ages", f"level_{code}_summary", f"level_{code}_detail"} <= keys


def test_seeding_twice_creates_nothing_new_and_keeps_edits():
    seed_website()
    ContentBlock.objects.filter(key="hero_headline").update(text="Edited by the admin")

    assert seed_website() == 0
    assert ContentBlock.objects.get(key="hero_headline").text == "Edited by the admin"
