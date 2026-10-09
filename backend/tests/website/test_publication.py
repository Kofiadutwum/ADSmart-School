import pytest

from apps.consent.models import PrivacyNotice
from apps.website.models import ContentBlock, PhotoSlot
from apps.website.services import is_site_public, publication_blockers

pytestmark = pytest.mark.django_db


def test_a_new_site_is_not_public(school):
    assert is_site_public(school) is False
    assert "The site has not been marked live" in publication_blockers(school)
    assert "The privacy notice has not been reviewed" in publication_blockers(school)


def test_the_site_is_public_when_everything_is_ready(ready_site):
    assert publication_blockers(ready_site) == []
    assert is_site_public(ready_site) is True


@pytest.mark.parametrize("spoiler", ["placeholder_photo", "draft_text", "draft_notice", "not_live"])
def test_each_blocker_keeps_the_site_in_preview(ready_site, spoiler):
    if spoiler == "placeholder_photo":
        PhotoSlot.objects.update(is_placeholder=True)
    elif spoiler == "draft_text":
        ContentBlock.objects.update(needs_review=True)
    elif spoiler == "draft_notice":
        PrivacyNotice.objects.update(is_draft=True)
    else:
        ready_site.is_live = False
        ready_site.save()

    assert is_site_public(ready_site) is False
    assert len(publication_blockers(ready_site)) == 1


def test_another_schools_drafts_do_not_block_this_site(ready_site, other_school):
    ContentBlock.objects.create(school=other_school, key="hero_headline", text="Draft")
    assert is_site_public(ready_site) is True
