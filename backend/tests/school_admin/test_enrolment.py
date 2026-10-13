from datetime import date

import pytest

from apps.academics.models import ClassTeacherAssignment
from apps.people.models import Enrolment
from apps.people.services import enrol
from tests.records import make_class, make_staff, make_student, make_term, make_year

pytestmark = pytest.mark.django_db


@pytest.fixture
def year(school):
    return make_year(school)


def place(admin, pupils, school_class, start="2026-09-08"):
    body = {
        "students": [pupil.pk for pupil in pupils],
        "school_class": school_class.pk,
        "start_date": start,
    }
    return admin.post("/api/school/enrolments", body, format="json")


def test_places_several_pupils_in_a_class_at_once(admin, school, year):
    basic = make_class(year, "basic_2")
    pupils = [make_student(school, first_name=name) for name in ("Ama", "Yaw", "Esi")]
    response = place(admin, pupils, basic)
    assert response.status_code == 200, response.json()
    assert response.json() == {"placed": 3, "already": 0}
    assert Enrolment.objects.filter(school_class=basic, end_date__isnull=True).count() == 3


def test_moving_a_pupil_keeps_their_history(admin, school, year):
    first, second = make_class(year, "basic_2", "A"), make_class(year, "basic_2", "B")
    pupil = make_student(school)
    enrol(pupil, first, start_date=date(2026, 9, 8))
    assert place(admin, [pupil], second, "2026-10-12").json() == {"placed": 1, "already": 0}
    assert place(admin, [pupil], second, "2026-10-13").json() == {"placed": 0, "already": 1}
    history = admin.get(f"/api/school/pupils/{pupil.pk}/enrolments").json()
    assert [(row["class"], row["end_date"]) for row in history] == [
        ("Basic 2B", None),
        ("Basic 2A", "2026-10-12"),
    ]


def test_only_this_schools_active_pupils_are_placed(admin, school, other_school, year):
    basic = make_class(year, "basic_2")
    assert place(admin, [make_student(other_school)], basic).status_code == 400
    response = place(admin, [make_student(school, status="WITHDRAWN")], basic)
    assert response.status_code == 400
    assert "Ama Mensah" in response.json()["fields"]["students"][0]


def test_the_proprietor_sees_enrolment_by_level_and_class(client_for, school, year):
    proprietor = client_for("Proprietor")
    basic_a, basic_b = make_class(year, "basic_2", "A"), make_class(year, "basic_2", "B")
    make_class(year, "kg_1")
    for name, school_class in (("Ama", basic_a), ("Yaw", basic_a), ("Esi", basic_b)):
        enrol(make_student(school, first_name=name), school_class, start_date=date(2026, 9, 8))
    make_student(school, first_name="Kofi")  # not yet in a class
    body = proprietor.get("/api/school/enrolment-overview").json()
    assert body["total"] == 4
    assert body["not_in_class"] == 1
    levels = {level["band"]: level for level in body["levels"]}
    assert levels["lower_primary"]["count"] == 3
    assert [(row["name"], row["count"]) for row in levels["lower_primary"]["classes"]] == [
        ("Basic 2A", 2),
        ("Basic 2B", 1),
    ]
    assert levels["kg"]["count"] == 0
    assert proprietor.get("/api/school/pupils").status_code == 403


def test_the_class_teacher_issues_and_resets_a_basic_4_pupils_sign_in(client_for, school, year):
    teacher = client_for("Teacher")
    basic4 = make_class(year, "basic_4")
    ClassTeacherAssignment.objects.create(
        school=school, school_class=basic4, staff=teacher.staff, term=make_term(year)
    )
    pupil = make_student(school)
    enrol(pupil, basic4, start_date=date(2026, 9, 8))
    first = teacher.post(f"/api/school/pupils/{pupil.pk}/login")
    assert first.status_code == 200, first.json()
    assert first.json()["username"] == pupil.student_id
    pupil.refresh_from_db()
    assert pupil.user.must_change_password
    assert pupil.user.check_password(first.json()["one_time_password"])
    second = teacher.post(f"/api/school/pupils/{pupil.pk}/login").json()
    pupil.user.refresh_from_db()
    assert pupil.user.check_password(second["one_time_password"])


def test_younger_pupils_and_other_teachers_get_no_sign_in(admin, client_for, school, year):
    young = make_student(school)
    enrol(young, make_class(year, "basic_2"), start_date=date(2026, 9, 8))
    response = admin.post(f"/api/school/pupils/{young.pk}/login")
    assert response.status_code == 400
    assert "Basic 4" in response.json()["message"]
    stranger = client_for("Teacher")
    older = make_student(school, first_name="Yaw")
    enrol(older, make_class(year, "basic_4"), start_date=date(2026, 9, 8))
    assert stranger.post(f"/api/school/pupils/{older.pk}/login").status_code == 404


def test_me_lists_the_classes_a_teacher_has(client_for, school, year):
    teacher = client_for("Teacher")
    basic = make_class(year, "basic_2")
    ClassTeacherAssignment.objects.create(
        school=school, school_class=basic, staff=teacher.staff, term=make_term(year)
    )
    make_staff(school, username="someone.else")
    assert teacher.get("/api/school/me").json()["classes"] == [
        {"id": basic.pk, "name": "Basic 2", "is_class_teacher": True}
    ]
