from datetime import date, timedelta

import pytest
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.consent.models import PrivacyNotice
from apps.people.services import add_pickup_person
from tests.helpers import jpeg_upload
from tests.records import make_parent, make_student

pytestmark = pytest.mark.django_db

PERSON = {"name": "Uncle Kofi", "phone": "024 777 0001", "relationship": "Uncle"}


def pickup(pupil, **fields):
    values = {**PERSON, "phone": "0247770001", "valid_from": date(2026, 9, 1), **fields}
    return add_pickup_person(pupil, **values)


def test_adds_edits_and_ends_a_pick_up_person(admin, school):
    pupil = make_student(school)
    url = f"/api/school/pupils/{pupil.pk}/pickups"
    response = admin.post(url, {**PERSON, "valid_from": "2026-09-01"}, format="json")
    assert response.status_code == 201, response.json()
    person = response.json()
    assert person["phone"] == "+233247770001"
    assert person["is_current"] is True
    person_url = f"/api/school/pickups/{person['id']}"
    edit = admin.patch(person_url, {"relationship": "Uncle on the mother's side"}, format="json")
    assert edit.json()["relationship"] == "Uncle on the mother's side"
    ended = admin.post(f"{person_url}/end").json()
    assert ended["valid_to"] == timezone.localdate().isoformat()
    entries = AuditLog.objects.filter(entity_type="people.pickupperson")
    assert set(entries.values_list("action", flat=True)) == {"CREATED", "UPDATED"}


def test_an_end_date_before_the_start_is_refused(admin, school):
    pupil = make_student(school)
    dates = {"valid_from": "2026-09-10", "valid_to": "2026-09-01"}
    response = admin.post(
        f"/api/school/pupils/{pupil.pk}/pickups", {**PERSON, **dates}, format="json"
    )
    assert response.status_code == 400
    assert "valid_to" in response.json()["fields"]


def test_a_pick_up_person_who_has_expired_is_not_current(admin, school):
    pupil = make_student(school)
    pickup(pupil, valid_from=date(2025, 1, 1), valid_to=timezone.localdate() - timedelta(days=1))
    (row,) = admin.get(f"/api/school/pupils/{pupil.pk}/pickups").json()
    assert row["is_current"] is False


def test_a_pick_up_person_photo_is_kept_and_served_privately(admin, school):
    person = pickup(make_student(school))
    url = f"/api/school/pickups/{person.pk}/photo"
    assert admin.get(url).status_code == 404
    assert admin.post(url, {"photo": jpeg_upload()}).json()["has_photo"] is True
    photo = admin.get(url)
    assert photo.status_code == 200
    assert photo["Cache-Control"] == "private, max-age=300"


def test_records_a_pupils_consents_against_the_privacy_notice(admin, school):
    notice = PrivacyNotice.objects.create(
        school=school, version="2", body="Text", effective_from=date(2026, 1, 1), is_draft=False
    )
    admin.post("/api/auth/privacy", {"notice": notice.pk}, format="json")
    pupil = make_student(school)
    url = f"/api/school/pupils/{pupil.pk}/consents"
    rows = {row["type"]: row for row in admin.get(url).json()}
    assert set(rows) == {"PHOTO_USE", "MEDICAL_SHARING", "SCHOOL_TRIPS"}
    assert rows["PHOTO_USE"]["given"] is None  # never asked
    given = admin.put(f"{url}/PHOTO_USE", {"given": True}, format="json")
    assert given.status_code == 200, given.json()
    assert given.json()["given"] is True
    assert given.json()["notice_version"] == "2"
    withdrawn = admin.put(f"{url}/PHOTO_USE", {"given": False}, format="json").json()
    assert withdrawn["given"] is False
    assert withdrawn["withdrawn_at"]
    assert AuditLog.objects.filter(action="CONSENT_WITHDRAWN").exists()


def test_a_type_that_is_not_the_pupils_is_refused(admin, school):
    pupil = make_student(school)
    url = f"/api/school/pupils/{pupil.pk}/consents/SMS_CONTACT"
    assert admin.put(url, {"given": True}, format="json").status_code == 400


def test_records_a_parents_text_message_consent(admin, school):
    parent = make_parent(school)
    url = f"/api/school/parents/{parent.pk}/consents"
    assert [row["type"] for row in admin.get(url).json()] == ["SMS_CONTACT"]
    assert admin.put(f"{url}/SMS_CONTACT", {"given": True}, format="json").json()["given"] is True


def test_the_head_teacher_reads_consents_but_cannot_change_them(head, school):
    pupil = make_student(school)
    url = f"/api/school/pupils/{pupil.pk}/consents"
    assert head.get(url).status_code == 200
    assert head.put(f"{url}/PHOTO_USE", {"given": True}, format="json").status_code == 403


def test_another_schools_pick_up_person_is_not_found(admin, other_school):
    theirs = pickup(make_student(other_school))
    url = f"/api/school/pickups/{theirs.pk}"
    assert admin.patch(url, {"name": "X"}, format="json").status_code == 404
    assert admin.get(f"{url}/photo").status_code == 404
