import pytest

from apps.consent.models import PrivacyNotice
from apps.school.models import SchoolProfile
from apps.website.models import ContentBlock, FeatureBlock, NewsPost, PhotoSlot
from apps.website.seed_data import LEVEL_CODES
from apps.website.seeding import seed_website
from apps.website.services import is_site_public

pytestmark = pytest.mark.django_db


def test_seed_creates_a_complete_preview_site():
    created = seed_website()

    assert created > 0
    assert SchoolProfile.load().phone == "+233545875881"
    assert PhotoSlot.objects.count() == 14
    assert PhotoSlot.objects.filter(is_placeholder=False).count() == 0
    assert all(slot.renditions for slot in PhotoSlot.objects.all())
    assert FeatureBlock.objects.filter(enabled=True).count() == 0
    assert NewsPost.objects.published().count() == 1
    assert PrivacyNotice.current().is_draft is True
    assert is_site_public() is False


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
