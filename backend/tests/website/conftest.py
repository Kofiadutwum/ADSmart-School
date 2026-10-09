from datetime import date

import pytest

from apps.consent.models import PrivacyNotice
from apps.school.models import SchoolProfile
from apps.website.models import ContentBlock, PhotoSlot, SiteSettings
from tests.helpers import jpeg_upload


@pytest.fixture
def school(db):
    profile = SchoolProfile(
        name="AD Smart School",
        founded_year=2001,
        town="Kronom, Kumasi",
        region="Ashanti",
        phone="+233545875881",
        whatsapp="+233545875881",
        email="school@example.com",
        map_query="Kronom, Kumasi, Ghana",
    )
    profile.save()
    return profile


@pytest.fixture
def ready_site(school):
    """Everything reviewed, real and live: the site should be public."""
    ContentBlock.objects.create(key="hero_headline", text="Bright beginnings", needs_review=False)
    PhotoSlot.objects.create(
        key="hero", image=jpeg_upload(), alt_text="Children playing", is_placeholder=False
    )
    PrivacyNotice.objects.create(
        version="1", body="We protect your data.", effective_from=date(2026, 1, 1), is_draft=False
    )
    SiteSettings.objects.update_or_create(pk=1, defaults={"is_live": True})
    return school
