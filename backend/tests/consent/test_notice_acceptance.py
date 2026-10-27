from datetime import date

import pytest

from apps.accounts import roles
from apps.audit.models import AuditLog
from apps.consent.models import NoticeAcceptance, PrivacyNotice
from tests.platform_admin.conftest import make_platform_member, signed_in

pytestmark = pytest.mark.django_db
ACCEPT = "/api/auth/privacy"


def notice(school, version="1", draft=False, start=date(2026, 1, 1)):
    return PrivacyNotice.objects.create(
        school=school,
        version=version,
        body="We keep your details safe.",
        effective_from=start,
        is_draft=draft,
    )


def test_a_person_accepts_the_schools_privacy_notice_before_using_the_portal(admin, school):
    current = notice(school)

    blocked = admin.get("/api/school/dashboard")
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "privacy_acceptance_required"
    assert admin.get("/api/auth/me").json()["privacy_notice"] == {
        "id": current.pk,
        "title": "Privacy notice",
        "version": "1",
        "body": "We keep your details safe.",
    }

    assert admin.post(ACCEPT, {"notice": current.pk}, format="json").status_code == 200

    assert admin.get("/api/school/dashboard").status_code == 200
    assert admin.get("/api/auth/me").json()["privacy_notice"] is None
    assert NoticeAcceptance.objects.get(user=admin.staff.user).notice == current
    assert AuditLog.objects.filter(action="CONSENT_GIVEN", entity_type="accounts.user").exists()


def test_a_draft_asks_nothing_and_each_new_version_asks_again(admin, school):
    notice(school, version="0", draft=True)
    assert admin.get("/api/auth/me").json()["privacy_notice"] is None
    assert admin.get("/api/school/dashboard").status_code == 200

    first = notice(school, version="1")
    admin.post(ACCEPT, {"notice": first.pk}, format="json")
    notice(school, version="2", start=date(2026, 6, 1))

    assert admin.get("/api/auth/me").json()["privacy_notice"]["version"] == "2"


def test_only_the_notice_being_asked_about_can_be_accepted(admin, school, other_school):
    theirs = notice(other_school)
    notice(school)

    assert admin.post(ACCEPT, {"notice": theirs.pk}, format="json").status_code == 400
    assert not NoticeAcceptance.objects.exists()


def test_the_platform_team_accepts_the_platform_notice(db):
    platform = notice(None, version="p1")
    owner = signed_in(make_platform_member("owner", roles.PLATFORM_OWNER))

    assert owner.get("/api/platform/schools").status_code == 403
    assert owner.get("/api/auth/me").json()["privacy_notice"]["id"] == platform.pk
    owner.post(ACCEPT, {"notice": platform.pk}, format="json")

    assert owner.get("/api/platform/schools").status_code == 200
