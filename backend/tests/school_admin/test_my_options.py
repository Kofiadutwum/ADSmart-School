"""A teacher's drop-downs list only their own classes and subjects this school year."""

import pytest
from rest_framework.test import APIClient

from apps.academics.models import ClassTeacherAssignment, Subject, TeachingAssignment
from tests.records import make_class, make_staff, make_term, make_year

pytestmark = pytest.mark.django_db


def test_a_teacher_sees_only_their_own_classes_and_subjects(school):
    year = make_year(school)
    term = make_term(year)
    mine, theirs, taught = (make_class(year, group) for group in ("basic_2", "basic_3", "basic_4"))
    maths = Subject.objects.create(
        school=school, name="Mathematics", code="MATH", bands=["lower_primary", "upper_primary"]
    )
    Subject.objects.create(school=school, name="Science", code="SCI", bands=["lower_primary"])
    teacher = make_staff(school, username="abena.teacher")
    ClassTeacherAssignment.objects.create(
        school=school, school_class=mine, staff=teacher, term=term
    )
    TeachingAssignment.objects.create(
        school=school, staff=teacher, school_class=taught, subject=maths, term=term
    )

    client = APIClient(HTTP_HOST="adsmart.localhost")
    client.force_login(teacher.user)
    classes = [row["name"] for row in client.get("/api/school/options/my-classes").json()]
    subjects = [row["name"] for row in client.get("/api/school/options/my-subjects").json()]
    assert classes == [mine.name, taught.name]
    assert theirs.name not in classes
    assert subjects == ["Mathematics"]
