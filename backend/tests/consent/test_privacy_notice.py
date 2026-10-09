from datetime import date

import pytest

from apps.consent.models import PrivacyNotice

pytestmark = pytest.mark.django_db


def notice(school, version, body, effective):
    return PrivacyNotice.objects.create(
        school=school, version=version, body=body, effective_from=effective
    )


def test_current_is_the_schools_latest_notice_already_in_effect(school, other_school):
    notice(school, "1", "Old.", date(2026, 1, 1))
    notice(school, "2", "Now.", date(2026, 9, 1))
    notice(school, "3", "Later.", date(2027, 1, 1))
    notice(other_school, "4", "Theirs.", date(2026, 10, 1))

    assert PrivacyNotice.current(school, date(2026, 10, 9)).version == "2"


def test_the_platform_has_its_own_notice(school):
    notice(school, "1", "School.", date(2026, 1, 1))
    notice(None, "p1", "Platform.", date(2026, 1, 1))

    assert PrivacyNotice.current(None, date(2026, 10, 9)).body == "Platform."


def test_current_is_none_when_nothing_is_in_effect(school):
    notice(school, "1", "Future.", date(2027, 1, 1))

    assert PrivacyNotice.current(school, date(2026, 10, 9)) is None


def test_new_notices_start_as_drafts(school):
    assert notice(school, "1", "x", date(2026, 1, 1)).is_draft is True
