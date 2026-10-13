from datetime import date

import pytest

from apps.academics.models import ClassTeacherAssignment, Subject, TeachingAssignment
from apps.consent.models import Consent
from apps.consent.services import set_consent
from apps.people.services import add_emergency_contact, enrol, link_guardian
from tests.helpers import jpeg_upload
from tests.records import make_class, make_parent, make_student, make_term, make_year

pytestmark = pytest.mark.django_db


@pytest.fixture
def setting(school, client_for):
    """A Basic 2 class with one pupil, a parent, an emergency contact, a subject teacher and
    a class teacher."""
    year = make_year(school)
    term = make_term(year)
    basic = make_class(year, "basic_2")
    pupil = make_student(school, address="12 Palm Street")
    enrol(pupil, basic, start_date=date(2026, 9, 8))
    link_guardian(make_parent(school), pupil, "MOTHER", is_primary_contact=True)
    add_emergency_contact(pupil, name="Aunt Esi", phone="0241112222", relationship="Aunt")
    maths = Subject.objects.create(school=school, name="Maths", code="M", bands=["lower_primary"])
    subject_teacher, class_teacher = client_for("Teacher"), client_for("Teacher")
    TeachingAssignment.objects.create(
        school=school, staff=subject_teacher.staff, school_class=basic, subject=maths, term=term
    )
    ClassTeacherAssignment.objects.create(
        school=school, staff=class_teacher.staff, school_class=basic, term=term
    )
    return {
        "class": basic,
        "pupil": pupil,
        "subject_teacher": subject_teacher,
        "class_teacher": class_teacher,
    }


def test_a_subject_teacher_sees_the_class_list_without_contacts(setting):
    teacher, basic, pupil = setting["subject_teacher"], setting["class"], setting["pupil"]
    rows = teacher.get(f"/api/school/classes/{basic.pk}/pupils").json()
    assert [row["name"] for row in rows["pupils"]] == ["Ama Mensah"]
    assert rows["class"] == {"id": basic.pk, "name": "Basic 2", "is_class_teacher": False}
    profile = teacher.get(f"/api/school/classes/{basic.pk}/pupils/{pupil.pk}").json()
    assert profile["student_id"] == pupil.student_id
    assert "address" not in profile
    assert "parents" not in profile
    assert "emergency_contacts" not in profile


def test_the_class_teacher_also_sees_parent_and_emergency_contacts(setting):
    teacher, basic, pupil = setting["class_teacher"], setting["class"], setting["pupil"]
    profile = teacher.get(f"/api/school/classes/{basic.pk}/pupils/{pupil.pk}").json()
    assert profile["parents"][0]["phone"] == "+233241234567"
    assert profile["emergency_contacts"][0]["name"] == "Aunt Esi"


def test_a_teacher_of_another_class_sees_nothing(setting, client_for):
    stranger = client_for("Teacher")
    basic, pupil = setting["class"], setting["pupil"]
    assert stranger.get(f"/api/school/classes/{basic.pk}/pupils").status_code == 404
    assert stranger.get(f"/api/school/classes/{basic.pk}/pupils/{pupil.pk}").status_code == 404


def test_a_pupil_of_another_class_is_not_shown_through_this_one(setting, school):
    teacher, basic = setting["subject_teacher"], setting["class"]
    other = make_student(school, first_name="Yaw")
    assert teacher.get(f"/api/school/classes/{basic.pk}/pupils/{other.pk}").status_code == 404


def test_teachers_see_a_pupils_photo_only_with_consent(setting):
    teacher, basic, pupil = setting["subject_teacher"], setting["class"], setting["pupil"]
    pupil.photo = jpeg_upload()
    pupil.save()
    url = f"/api/school/classes/{basic.pk}/pupils/{pupil.pk}/photo"
    assert teacher.get(url).status_code == 404
    set_consent(pupil, Consent.Type.PHOTO_USE, True)
    assert teacher.get(url).status_code == 200


def test_the_head_teacher_sees_any_class_with_contacts(setting, head):
    basic, pupil = setting["class"], setting["pupil"]
    profile = head.get(f"/api/school/classes/{basic.pk}/pupils/{pupil.pk}").json()
    assert profile["parents"]
