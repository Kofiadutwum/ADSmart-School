from datetime import date

import pytest

from apps.consent.models import PrivacyNotice

pytestmark = pytest.mark.django_db


def test_current_is_the_latest_notice_already_in_effect():
    PrivacyNotice.objects.create(version="1", body="Old.", effective_from=date(2026, 1, 1))
    PrivacyNotice.objects.create(version="2", body="Current.", effective_from=date(2026, 9, 1))
    PrivacyNotice.objects.create(version="3", body="Future.", effective_from=date(2027, 1, 1))

    assert PrivacyNotice.current(date(2026, 10, 9)).version == "2"


def test_current_is_none_when_nothing_is_in_effect():
    PrivacyNotice.objects.create(version="1", body="Future.", effective_from=date(2027, 1, 1))

    assert PrivacyNotice.current(date(2026, 10, 9)) is None


def test_new_notices_start_as_drafts():
    notice = PrivacyNotice.objects.create(version="1", body="x", effective_from=date(2026, 1, 1))

    assert notice.is_draft is True
