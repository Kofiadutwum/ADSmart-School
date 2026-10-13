from datetime import date

import pytest
from rest_framework.test import APIClient

from apps.people.services import enrol, give_student_login
from tests.records import make_class, make_student, make_year

pytestmark = pytest.mark.django_db


def test_a_pupil_sees_their_own_profile_and_class(school):
    pupil = make_student(school)
    enrol(pupil, make_class(make_year(school), "basic_5", "B"), start_date=date(2026, 9, 8))
    user = give_student_login(pupil, "a long first password")
    user.must_change_password = False  # they chose their own at the first sign-in
    user.save()
    client = APIClient(HTTP_HOST="adsmart.localhost")
    client.force_login(user)
    body = client.get("/api/student/me").json()
    assert body["name"] == "Ama Mensah"
    assert body["student_id"] == pupil.student_id
    assert body["class"] == "Basic 5B"
    assert body["class_teacher"] is None
    assert client.get("/api/student/photo").status_code == 404  # no photo, no consent
    assert client.get("/api/parent/wards").status_code == 403


def test_staff_are_refused_the_pupil_area(admin):
    assert admin.get("/api/student/me").status_code == 403
