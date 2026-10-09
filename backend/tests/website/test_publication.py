import pytest

from apps.consent.models import PrivacyNotice
from apps.website.models import ContentBlock, PhotoSlot, SiteSettings
from apps.website.services import is_site_public, publication_blockers

pytestmark = pytest.mark.django_db


def test_a_new_site_is_not_public(school):
    assert is_site_public() is False
    assert "The site has not been marked live" in publication_blockers()
    assert "The privacy notice has not been reviewed" in publication_blockers()


def test_the_site_is_public_when_everything_is_ready(ready_site):
    assert publication_blockers() == []
    assert is_site_public() is True


@pytest.mark.parametrize("spoiler", ["placeholder_photo", "draft_text", "draft_notice", "not_live"])
def test_each_blocker_keeps_the_site_in_preview(ready_site, spoiler):
    if spoiler == "placeholder_photo":
        PhotoSlot.objects.update(is_placeholder=True)
    elif spoiler == "draft_text":
        ContentBlock.objects.update(needs_review=True)
    elif spoiler == "draft_notice":
        PrivacyNotice.objects.update(is_draft=True)
    else:
        SiteSettings.objects.update(is_live=False)

    assert is_site_public() is False
    assert len(publication_blockers()) == 1
