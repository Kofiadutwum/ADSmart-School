"""Pick-up control at the gate (SMS spec §6): only listed people or today's approved person, and
the family is told at once when anyone else tries."""

from datetime import date, timedelta

import pytest
from django.utils import timezone

from apps.care.models import OneTimeApproval, Release
from apps.notifications.backends import MemoryBackend
from apps.notifications.models import SmsCreditEntry
from apps.people.models import PickupPerson
from apps.people.services import link_guardian
from tests.records import make_parent, make_student

pytestmark = pytest.mark.django_db


@pytest.fixture
def child(school):
    pupil = make_student(school)
    parent = make_parent(school)
    link_guardian(parent, pupil, "MOTHER", is_primary_contact=True)
    SmsCreditEntry.objects.create(school=school, change=20, reason="Top-up")
    return pupil, parent


def test_a_listed_person_is_released_and_the_family_told(
    school, child, client_for, django_capture_on_commit_callbacks
):
    pupil, parent = child
    aunt = PickupPerson.objects.create(
        student=pupil,
        name="Auntie Efua",
        phone="0245556666",
        relationship="Aunt",
        valid_from=date(2026, 1, 1),
    )
    desk = client_for("Front Desk Officer")
    with django_capture_on_commit_callbacks(execute=True):
        answer = desk.post(
            "/api/school/care/releases",
            {"student": pupil.pk, "pickup_person": aunt.pk, "collector_name": "Auntie Efua"},
            format="json",
        )
    assert answer.json()["status"] == Release.Status.RELEASED
    assert "collected by Auntie Efua" in MemoryBackend.outbox[-1]["body"]


def test_anyone_else_is_blocked_and_the_family_alerted(
    school, child, client_for, django_capture_on_commit_callbacks
):
    pupil, parent = child
    expired = PickupPerson.objects.create(
        student=pupil,
        name="Old Driver",
        phone="0245557777",
        relationship="Driver",
        valid_from=date(2025, 1, 1),
        valid_to=timezone.localdate() - timedelta(days=1),
    )
    desk = client_for("Front Desk Officer")
    with django_capture_on_commit_callbacks(execute=True):
        answer = desk.post(
            "/api/school/care/releases",
            {"student": pupil.pk, "pickup_person": expired.pk, "collector_name": "Old Driver"},
            format="json",
        )
    assert answer.json()["status"] == Release.Status.BLOCKED
    assert "were not released" in MemoryBackend.outbox[-1]["body"]
    assert MemoryBackend.outbox[-1]["to"] == parent.phone


def test_a_parents_one_day_approval_works_only_that_day(school, child, client_for):
    pupil, parent = child
    approval = OneTimeApproval.objects.create(
        school=school,
        student=pupil,
        date=timezone.localdate(),
        name="Uncle Kwame",
        approved_by=parent.user,
    )
    desk = client_for("Front Desk Officer")
    answer = desk.post(
        "/api/school/care/releases",
        {"student": pupil.pk, "approval": approval.pk, "collector_name": "Uncle Kwame"},
        format="json",
    )
    assert answer.json()["status"] == Release.Status.RELEASED
    approval.date = timezone.localdate() + timedelta(days=1)
    approval.save()
    again = desk.post(
        "/api/school/care/releases",
        {"student": pupil.pk, "approval": approval.pk, "collector_name": "Uncle Kwame"},
        format="json",
    )
    assert again.json()["status"] == Release.Status.BLOCKED


def test_medical_records_are_logged_whenever_read(school, child, client_for):
    from apps.audit.models import AuditLog
    from apps.care.models import MedicalRecord

    pupil, _ = child
    MedicalRecord.objects.create(school=school, student=pupil, allergies="Peanuts")
    nurse = client_for("School Nurse")
    assert nurse.get("/api/school/care/medical").status_code == 200
    assert AuditLog.objects.filter(action=AuditLog.Action.VIEWED_RESTRICTED).exists()
    assert client_for("Teacher").get("/api/school/care/medical").status_code == 403
