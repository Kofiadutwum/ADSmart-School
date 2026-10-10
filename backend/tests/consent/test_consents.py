from datetime import date

import pytest
from django.db import IntegrityError, transaction

from apps.audit.models import AuditLog
from apps.consent.models import Consent, PrivacyNotice
from apps.consent.services import photo_allowed, set_consent
from tests.records import make_parent, make_student

pytestmark = pytest.mark.django_db


def test_a_consent_is_about_a_pupil_or_a_parent_never_both(school):
    student = make_student(school)
    parent = make_parent(school)
    for subject in ({"student": student, "parent": parent}, {}):
        with pytest.raises(IntegrityError), transaction.atomic():
            Consent.objects.create(school=school, type="PHOTO_USE", given=True, **subject)


def test_given_withdrawn_and_given_again_is_one_row_with_its_history_audited(school):
    PrivacyNotice.objects.create(
        school=school, version="1.0", body="How we use data.", effective_from=date(2026, 1, 1)
    )
    student = make_student(school)
    consent = set_consent(student, Consent.Type.PHOTO_USE, True)
    assert consent.given and consent.given_at and consent.privacy_notice.version == "1.0"
    assert consent.school == school and photo_allowed(student)
    set_consent(student, Consent.Type.PHOTO_USE, False)
    consent.refresh_from_db()
    assert not consent.given and consent.withdrawn_at and not photo_allowed(student)
    set_consent(student, Consent.Type.PHOTO_USE, True)
    assert Consent.objects.count() == 1
    actions = AuditLog.objects.filter(entity_type="consent.consent").order_by("id")
    assert list(actions.values_list("action", flat=True)) == [
        "CONSENT_GIVEN",
        "CONSENT_WITHDRAWN",
        "CONSENT_GIVEN",
    ]


def test_sms_consent_is_for_parents_and_the_rest_for_pupils(school):
    with pytest.raises(ValueError, match="not recorded"):
        set_consent(make_student(school), Consent.Type.SMS_CONTACT, True)
    parent = make_parent(school)
    with pytest.raises(ValueError, match="not recorded"):
        set_consent(parent, Consent.Type.PHOTO_USE, True)
    assert set_consent(parent, Consent.Type.SMS_CONTACT, True).parent == parent


def test_without_a_recorded_consent_there_is_no_photo(school):
    assert not photo_allowed(make_student(school))
