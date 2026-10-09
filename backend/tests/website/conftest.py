from datetime import date

import pytest

from apps.consent.models import PrivacyNotice
from apps.website.models import ContentBlock, PhotoSlot
from tests.helpers import jpeg_upload


@pytest.fixture
def ready_site(school):
    """Everything reviewed, real and live: the site should be public."""
    ContentBlock.objects.create(
        school=school, key="hero_headline", text="Bright beginnings", needs_review=False
    )
    PhotoSlot.objects.create(
        school=school,
        key="hero",
        image=jpeg_upload(),
        alt_text="Children playing",
        is_placeholder=False,
    )
    PrivacyNotice.objects.create(
        school=school,
        version="1",
        body="We protect your data.",
        effective_from=date(2026, 1, 1),
        is_draft=False,
    )
    school.is_live = True
    school.save()
    return school
