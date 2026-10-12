from datetime import date

import pytest

from apps.academics.models import ClassTeacherAssignment, SchoolClass, Subject, TeachingAssignment
from apps.audit.models import AuditLog
from apps.people.services import enrol
from tests.records import make_class, make_staff, make_student, make_term, make_year

pytestmark = pytest.mark.django_db


@pytest.fixture
def year(school):
    return make_year(school)


@pytest.fixture
def term(year):
    return make_term(year)


@pytest.fixture
def teacher(school):
    return make_staff(school, username="a.teacher", first_name="Abena", surname="Owusu")


def subject(school, name="Mathematics", code="MATH", bands=("lower_primary", "upper_primary")):
    return Subject.objects.create(school=school, name=name, code=code, bands=list(bands))


def test_lists_the_current_years_classes_with_what_the_form_needs(
    head, school, year, term, teacher
):
    make_class(year, "basic_2", "A")
    body = head.get("/api/school/classes").json()
    assert body["year"]["id"] == year.pk
    assert [row["name"] for row in body["classes"]] == ["Basic 2A"]
    assert body["classes"][0]["pupils"] == 0
    assert {"code": "basic_2", "name": "Basic 2"} in body["year_groups"]
    assert body["terms"][0]["id"] == term.pk
    assert body["teachers"] == [{"id": teacher.pk, "name": "Abena Owusu"}]


def test_adds_a_class_and_refuses_a_repeat_or_an_untaught_level(admin, school, year):
    school.levels_offered = ["lower_primary"]
    school.save()
    new = {"academic_year": year.pk, "year_group": "basic_1", "stream": "a"}
    response = admin.post("/api/school/classes", new, format="json")
    assert response.status_code == 201, response.json()
    assert response.json()["name"] == "Basic 1A"
    again = admin.post("/api/school/classes", new, format="json")
    assert again.status_code == 400
    assert "stream" in again.json()["fields"]
    jhs = admin.post("/api/school/classes", {**new, "year_group": "basic_7"}, format="json")
    assert jhs.status_code == 400
    assert "year_group" in jhs.json()["fields"]
    assert AuditLog.objects.filter(entity_type="academics.schoolclass", action="CREATED").exists()


def test_renames_the_stream_and_deletes_an_empty_class(admin, school, year):
    basic = make_class(year, "basic_3")
    response = admin.patch(f"/api/school/classes/{basic.pk}", {"stream": "B"}, format="json")
    assert response.json()["name"] == "Basic 3B"
    assert admin.delete(f"/api/school/classes/{basic.pk}").status_code == 204
    assert not SchoolClass.objects.filter(pk=basic.pk).exists()


def test_a_class_with_pupils_cannot_be_deleted(admin, school, year):
    basic = make_class(year, "basic_3")
    enrol(make_student(school), basic, start_date=date(2026, 9, 8))
    response = admin.delete(f"/api/school/classes/{basic.pk}")
    assert response.status_code == 400
    assert "pupils" in response.json()["message"]


def test_sets_changes_and_removes_the_class_teacher(admin, school, year, term, teacher):
    basic = make_class(year, "basic_1")
    url = f"/api/school/classes/{basic.pk}/class-teacher"
    response = admin.put(url, {"term": term.pk, "staff": teacher.pk}, format="json")
    assert response.status_code == 200, response.json()
    assert response.json()["class_teachers"] == [
        {"term_id": term.pk, "term": 1, "staff_id": teacher.pk, "staff_name": "Abena Owusu"}
    ]
    other = make_staff(school, username="b.teacher", first_name="Yaw", surname="Boateng")
    admin.put(url, {"term": term.pk, "staff": other.pk}, format="json")
    assert ClassTeacherAssignment.objects.get().staff == other
    admin.put(url, {"term": term.pk, "staff": None}, format="json")
    assert not ClassTeacherAssignment.objects.exists()


def test_only_teachers_and_caregivers_can_be_class_teachers(admin, school, year, term):
    accountant = make_staff(school, username="acc", roles_held=["Accountant"])
    basic = make_class(year, "basic_1")
    response = admin.put(
        f"/api/school/classes/{basic.pk}/class-teacher",
        {"term": term.pk, "staff": accountant.pk},
        format="json",
    )
    assert response.status_code == 400
    assert "staff" in response.json()["fields"]


def test_another_schools_teacher_or_class_is_not_found(admin, school, other_school, year, term):
    theirs = make_staff(other_school, username="theirs")
    basic = make_class(year, "basic_1")
    response = admin.put(
        f"/api/school/classes/{basic.pk}/class-teacher",
        {"term": term.pk, "staff": theirs.pk},
        format="json",
    )
    assert response.status_code == 400
    their_class = make_class(make_year(other_school), "kg_1")
    assert admin.delete(f"/api/school/classes/{their_class.pk}").status_code == 404


def test_adds_edits_and_deletes_subjects(admin, school):
    new = {"name": "English", "code": "eng", "bands": ["jhs", "kg"], "is_learning_area": False}
    response = admin.post("/api/school/subjects", new, format="json")
    assert response.status_code == 201, response.json()
    row = response.json()
    assert row["code"] == "ENG"
    assert row["bands"] == ["kg", "jhs"]
    assert admin.post("/api/school/subjects", new, format="json").json()["fields"]["code"]
    url = f"/api/school/subjects/{row['id']}"
    edited = admin.patch(url, {"name": "English Language"}, format="json")
    assert edited.json()["name"] == "English Language"
    assert admin.get("/api/school/subjects").json()[0]["name"] == "English Language"
    assert admin.delete(url).status_code == 204


def test_a_subject_needs_a_band(admin):
    response = admin.post(
        "/api/school/subjects", {"name": "Art", "code": "ART", "bands": []}, format="json"
    )
    assert response.status_code == 400
    assert "bands" in response.json()["fields"]


def test_assigns_teaching_and_refuses_a_subject_the_class_does_not_study(
    admin, school, year, term, teacher
):
    maths = subject(school)
    basic = make_class(year, "basic_2")
    nursery = make_class(year, "nursery_1")
    new = {"staff": teacher.pk, "school_class": basic.pk, "subject": maths.pk, "term": term.pk}
    response = admin.post("/api/school/teaching", new, format="json")
    assert response.status_code == 201, response.json()
    assert response.json()["class"] == "Basic 2"
    assert admin.post("/api/school/teaching", new, format="json").status_code == 400  # a repeat
    wrong = admin.post("/api/school/teaching", {**new, "school_class": nursery.pk}, format="json")
    assert wrong.status_code == 400
    assert "subject" in wrong.json()["fields"]
    listed = admin.get(f"/api/school/teaching?term={term.pk}").json()
    assert [row["teacher"] for row in listed] == ["Abena Owusu"]
    assigned = response.json()["id"]
    assert admin.delete(f"/api/school/teaching/{assigned}").status_code == 204
    assert not TeachingAssignment.objects.exists()


def test_a_taught_subject_cannot_be_deleted(admin, school, year, term, teacher):
    maths = subject(school)
    TeachingAssignment.objects.create(
        school=school,
        staff=teacher,
        school_class=make_class(year, "basic_2"),
        subject=maths,
        term=term,
    )
    response = admin.delete(f"/api/school/subjects/{maths.pk}")
    assert response.status_code == 400
    assert "taught" in response.json()["message"]


def test_me_lists_a_teachers_classes(client_for, school, year, term):
    teacher = client_for("Teacher")
    basic = make_class(year, "basic_2")
    TeachingAssignment.objects.create(
        school=school, staff=teacher.staff, school_class=basic, subject=subject(school), term=term
    )
    ClassTeacherAssignment.objects.create(
        school=school, staff=teacher.staff, school_class=basic, term=term
    )
    body = teacher.get("/api/school/me").json()
    assert body["teaching"][0]["subject"] == "Mathematics"
    assert body["class_teacher_of"][0]["class"] == "Basic 2"
