from datetime import date

import pytest
from rest_framework.test import APIClient

from apps.academics.models import ClassTeacherAssignment
from apps.consent.models import Consent, PrivacyNotice
from apps.consent.services import set_consent
from apps.people.services import add_pickup_person, enrol, link_guardian
from tests.helpers import jpeg_upload
from tests.records import make_class, make_parent, make_staff, make_student, make_term, make_year

pytestmark = pytest.mark.django_db


def signed_in(user, host="adsmart.localhost"):
    client = APIClient(HTTP_HOST=host)
    client.force_login(user)
    return client


@pytest.fixture
def family(school):
    year = make_year(school)
    basic = make_class(year, "basic_2", "A")
    teacher = make_staff(school, username="class.teacher", first_name="Abena", surname="Owusu")
    ClassTeacherAssignment.objects.create(
        school=school, school_class=basic, staff=teacher, term=make_term(year)
    )
    parent = make_parent(school)
    ama = make_student(school)
    enrol(ama, basic, start_date=date(2026, 9, 8))
    link_guardian(parent, ama, "MOTHER", is_primary_contact=True)
    add_pickup_person(
        ama,
        name="Uncle Kofi",
        phone="0247770001",
        relationship="Uncle",
        valid_from=date(2026, 1, 1),
    )
    stranger = make_student(school, first_name="Yaw")
    return {"client": signed_in(parent.user), "parent": parent, "ward": ama, "stranger": stranger}


def test_a_parent_sees_their_wards_with_class_teacher_and_pick_up_persons(family):
    (ward,) = family["client"].get("/api/parent/wards").json()
    assert ward["name"] == "Ama Mensah"
    assert ward["student_id"] == family["ward"].student_id
    assert ward["class"] == "Basic 2A"
    assert ward["class_teacher"] == "Abena Owusu"
    assert ward["initials"] == "AM"
    assert [person["name"] for person in ward["pickups"]] == ["Uncle Kofi"]


def test_a_parent_never_sees_a_pupil_who_is_not_their_ward(family):
    client, stranger = family["client"], family["stranger"]
    stranger.photo = jpeg_upload()
    stranger.save()
    set_consent(stranger, Consent.Type.PHOTO_USE, True)
    assert client.get(f"/api/parent/wards/{stranger.pk}/photo").status_code == 404
    body = {"student": stranger.pk, "type": "PHOTO_USE", "given": False}
    assert client.put("/api/parent/consents", body, format="json").status_code == 404


def test_a_wards_photo_is_shown_only_with_consent(family):
    client, ward = family["client"], family["ward"]
    ward.photo = jpeg_upload()
    ward.save()
    assert client.get(f"/api/parent/wards/{ward.pk}/photo").status_code == 404
    set_consent(ward, Consent.Type.PHOTO_USE, True)
    assert client.get(f"/api/parent/wards/{ward.pk}/photo").status_code == 200


def test_a_parent_reads_the_notice_and_changes_consents(family, school):
    PrivacyNotice.objects.create(
        school=school,
        version="3",
        title="How we use data",
        body="## Photos\nOnly with consent.",
        effective_from=date(2026, 1, 1),
        is_draft=False,
    )
    client, ward = family["client"], family["ward"]
    body = client.get("/api/parent/consents").json()
    assert body["notice"]["version"] == "3"
    assert body["wards"][0]["id"] == ward.pk
    assert {row["type"] for row in body["wards"][0]["consents"]} == {
        "PHOTO_USE",
        "MEDICAL_SHARING",
        "SCHOOL_TRIPS",
    }
    assert body["own"][0]["type"] == "SMS_CONTACT"
    give = {"student": ward.pk, "type": "PHOTO_USE", "given": True}
    assert client.put("/api/parent/consents", give, format="json").json()["given"] is True
    own = {"student": None, "type": "SMS_CONTACT", "given": False}
    assert client.put("/api/parent/consents", own, format="json").json()["given"] is False
    consent = Consent.objects.get(student=ward, type="PHOTO_USE")
    assert consent.recorded_by == family["parent"].user
    assert consent.privacy_notice.version == "3"


def test_a_draft_notice_is_not_shown(family, school):
    PrivacyNotice.objects.create(
        school=school, version="1", body="Draft", effective_from=date(2026, 1, 1)
    )
    assert family["client"].get("/api/parent/consents").json()["notice"] is None


def test_staff_are_refused_the_parent_area(admin):
    assert admin.get("/api/parent/wards").status_code == 403


def test_a_pick_up_persons_photo_is_shown_to_the_wards_parent_only(family, school):
    person = family["ward"].pickup_people.get()
    person.photo = jpeg_upload()
    person.save()
    url = f"/api/parent/pickups/{person.pk}/photo"
    assert family["client"].get(url).status_code == 200
    other_parent = make_parent(school, phone="024 999 0000")
    assert signed_in(other_parent.user).get(url).status_code == 404
