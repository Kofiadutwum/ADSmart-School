from datetime import date

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.audit.models import AuditLog
from apps.consent.models import Consent
from apps.consent.services import set_consent
from apps.people.models import EmergencyContact, Student
from apps.people.services import add_emergency_contact, enrol
from tests.helpers import jpeg_upload
from tests.records import make_class, make_student, make_year

pytestmark = pytest.mark.django_db

PUPILS = "/api/school/pupils"
NEW = {
    "first_name": "Kwame",
    "surname": "Asante",
    "date_of_birth": "2018-02-01",
    "gender": "M",
    "admission_date": "2026-09-08",
    "privacy_notice_given": True,
}


def test_admission_needs_the_family_told_about_the_privacy_notice(admin, school):
    response = admin.post(PUPILS, {**NEW, "privacy_notice_given": False}, format="json")

    assert response.status_code == 400
    assert "privacy notice" in response.json()["fields"]["privacy_notice_given"][0]
    assert not Student.objects.exists()


def contact(name, phone="024 111 2222", relationship="Aunt"):
    return {"name": name, "phone": phone, "relationship": relationship}


def test_admits_a_pupil_with_a_student_id_and_a_first_class(admin, school):
    basic = make_class(make_year(school), "basic_2", "A")
    response = admin.post(PUPILS, {**NEW, "school_class": basic.pk}, format="json")
    assert response.status_code == 201, response.json()
    body = response.json()
    assert len(body["student_id"]) == 7
    assert body["class"] == "Basic 2A"
    pupil = Student.objects.get(pk=body["id"])
    assert pupil.enrolments.get().school_class == basic
    assert AuditLog.objects.filter(action="CREATED", entity_type="people.student").exists()


def test_a_first_class_from_another_school_is_refused(admin, school, other_school):
    theirs = make_class(make_year(other_school), "kg_1")
    response = admin.post(PUPILS, {**NEW, "school_class": theirs.pk}, format="json")
    assert response.status_code == 400
    assert "school_class" in response.json()["fields"]


def test_lists_and_searches_pupils_by_name_or_id_with_filters(head, school):
    year = make_year(school)
    basic = make_class(year, "basic_2")
    ama = make_student(school)
    enrol(ama, basic, start_date=date(2026, 9, 8))
    yaw = make_student(school, first_name="Yaw", surname="Boateng", is_demo=True)
    rows = head.get(PUPILS).json()
    assert {row["name"] for row in rows} == {"Ama Mensah", "Yaw Boateng"}
    ama_row = next(row for row in rows if row["name"] == "Ama Mensah")
    assert ama_row["class"] == "Basic 2"
    assert ama_row["initials"] == "AM"
    assert ama_row["contacts_incomplete"] is True
    assert [row["name"] for row in head.get(f"{PUPILS}?q=boat").json()] == ["Yaw Boateng"]
    assert [row["id"] for row in head.get(f"{PUPILS}?q={ama.student_id}").json()] == [ama.pk]
    assert [row["id"] for row in head.get(f"{PUPILS}?class={basic.pk}").json()] == [ama.pk]
    assert [row["id"] for row in head.get(f"{PUPILS}?level=lower_primary").json()] == [ama.pk]
    assert [row["id"] for row in head.get(f"{PUPILS}?demo=1").json()] == [yaw.pk]
    assert [row["id"] for row in head.get(f"{PUPILS}?class=none").json()] == [yaw.pk]


def test_edits_the_profile_with_audit(admin, school):
    pupil = make_student(school)
    url = f"{PUPILS}/{pupil.pk}"
    response = admin.patch(url, {"middle_name": "Serwaa", "address": "Kronom"}, format="json")
    assert response.status_code == 200, response.json()
    assert response.json()["name"] == "Ama Serwaa Mensah"
    entry = AuditLog.objects.get(action="UPDATED", entity_type="people.student")
    assert set(entry.new_value) == {"middle_name", "address"}


def test_a_status_change_needs_a_reason(admin, school):
    pupil = make_student(school)
    url = f"{PUPILS}/{pupil.pk}/status"
    assert admin.post(url, {"status": "WITHDRAWN", "reason": ""}, format="json").status_code == 400
    response = admin.post(url, {"status": "WITHDRAWN", "reason": "Moved to Accra"}, format="json")
    assert response.json()["status"] == "WITHDRAWN"
    assert AuditLog.objects.get(action="STATUS_CHANGED").reason == "Moved to Accra"


def test_emergency_contacts_are_added_edited_and_removed(admin, school):
    pupil = make_student(school)
    url = f"{PUPILS}/{pupil.pk}/contacts"
    first = admin.post(url, contact("Aunt Esi"), format="json")
    assert first.status_code == 201, first.json()
    admin.post(url, contact("Uncle Yaw", "032 202 0000", "Uncle"), format="json")
    contact_url = f"/api/school/contacts/{first.json()['id']}"
    assert admin.patch(contact_url, {"name": "Auntie Esi"}, format="json").status_code == 200
    assert admin.delete(contact_url).status_code == 204
    third = admin.post(url, contact("Gran", "024 333 4444", "Grandmother"), format="json")
    assert third.status_code == 201  # a free priority even after a removal
    assert [row["name"] for row in admin.get(url).json()] == ["Uncle Yaw", "Gran"]
    history = admin.get(f"{PUPILS}/{pupil.pk}/history").json()
    assert any("Auntie Esi" in str(entry) for entry in history)


def test_the_photo_is_served_only_with_consent(admin, school):
    pupil = make_student(school)
    url = f"{PUPILS}/{pupil.pk}/photo"
    assert admin.post(url, {"photo": jpeg_upload()}).status_code == 200
    assert admin.get(url).status_code == 404  # no PHOTO_USE consent yet
    detail = admin.get(f"{PUPILS}/{pupil.pk}").json()
    assert detail["has_photo"] is False  # kept, but not shown without consent
    assert detail["photo_on_file"] is True
    set_consent(pupil, Consent.Type.PHOTO_USE, True)
    photo = admin.get(url)
    assert photo.status_code == 200
    assert photo["Cache-Control"] == "private, max-age=300"
    assert photo["Content-Type"] == "image/jpeg"
    set_consent(pupil, Consent.Type.PHOTO_USE, False)
    assert admin.get(url).status_code == 404
    assert admin.delete(url).status_code == 200
    pupil.refresh_from_db()
    assert not pupil.photo


def test_a_file_that_is_not_a_photo_is_refused(admin, school):
    pupil = make_student(school)
    bad = SimpleUploadedFile("x.jpg", b"nope", content_type="image/jpeg")
    response = admin.post(f"{PUPILS}/{pupil.pk}/photo", {"photo": bad})
    assert response.status_code == 400


def test_a_demo_pupil_can_be_made_real(admin, school):
    pupil = make_student(school, is_demo=True)
    assert admin.post(f"{PUPILS}/{pupil.pk}/make-real").json()["is_demo"] is False


def test_the_history_lists_changes_to_the_pupil(admin, school):
    pupil = make_student(school)
    change = {"status": "SUSPENDED", "reason": "One week"}
    admin.post(f"{PUPILS}/{pupil.pk}/status", change, format="json")
    actions = [entry["action"] for entry in admin.get(f"{PUPILS}/{pupil.pk}/history").json()]
    assert "STATUS_CHANGED" in actions
    assert "CREATED" in actions


def test_another_schools_pupil_is_not_found(admin, other_school):
    theirs = make_student(other_school)
    assert admin.get(f"{PUPILS}/{theirs.pk}").status_code == 404
    assert admin.post(f"{PUPILS}/{theirs.pk}/contacts", {}, format="json").status_code == 404
    their_contact = add_emergency_contact(theirs, **contact("X", "0241112222"))
    assert admin.delete(f"/api/school/contacts/{their_contact.pk}").status_code == 404
    assert EmergencyContact.objects.filter(pk=their_contact.pk).exists()
