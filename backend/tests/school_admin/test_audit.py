from datetime import timedelta

import pytest
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.audit.services import record
from tests.platform_admin.conftest import make_platform_member
from tests.records import make_staff

pytestmark = pytest.mark.django_db

AUDIT = "/api/school/audit"


def test_lists_this_schools_entries_newest_first(head, school, other_school):
    teacher = make_staff(school, username="teacher.one")
    make_staff(other_school, username="theirs")
    body = head.get(AUDIT).json()
    entries = body["entries"]
    assert entries[0]["entity_id"] == str(teacher.user_id)
    assert entries[0]["action_label"] == "User created"
    assert "accounts.user" in body["record_types"]
    theirs = AuditLog.objects.filter(school=other_school).values_list("pk", flat=True)
    assert not {entry["id"] for entry in entries} & set(theirs)


def test_filters_by_person_record_and_dates(admin, school):
    teacher = make_staff(school, username="teacher.one")
    record(AuditLog.Action.UPDATED, actor=teacher.user, entity=school)
    by_teacher = admin.get(f"{AUDIT}?actor={teacher.user_id}").json()["entries"]
    assert [entry["action"] for entry in by_teacher] == ["UPDATED"]
    by_record = admin.get(f"{AUDIT}?entity_type=school.school&entity_id={school.pk}").json()
    assert len(by_record["entries"]) == 1
    tomorrow = (timezone.localdate() + timedelta(days=1)).isoformat()
    assert admin.get(f"{AUDIT}?date_from={tomorrow}").json()["entries"] == []
    today = timezone.localdate().isoformat()
    assert admin.get(f"{AUDIT}?date_from={today}&date_to={today}").json()["entries"]


def test_a_bad_date_is_refused(admin):
    assert admin.get(f"{AUDIT}?date_from=yesterday").status_code == 400


def test_platform_support_shows_without_a_personal_name(admin, school):
    ops = make_platform_member("ops", "Platform Support", display_name="Kojo Ops")
    record(AuditLog.Action.PASSWORD_RESET, actor=ops, entity=admin.staff.user)
    entry = admin.get(AUDIT).json()["entries"][0]
    assert entry["actor_name"] == "Platform support"


def test_lists_the_people_in_the_log_for_the_person_filter(admin, school):
    teacher = make_staff(school, username="teacher.one")
    record(AuditLog.Action.UPDATED, actor=teacher.user, entity=school)
    ops = make_platform_member("ops", "Platform Support", display_name="Kojo Ops")
    record(AuditLog.Action.PASSWORD_RESET, actor=ops, entity=teacher.user)
    people = admin.get(AUDIT).json()["people"]
    assert {"id": teacher.user_id, "name": "Kofi Mensah"} in people
    assert {"id": ops.pk, "name": "Platform support"} in people
