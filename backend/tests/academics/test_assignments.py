import pytest
from django.db import IntegrityError, transaction

from apps.academics.models import ClassTeacherAssignment, Subject, TeachingAssignment
from tests.records import make_class, make_staff, make_term, make_year

pytestmark = pytest.mark.django_db


def test_one_class_teacher_per_class_per_term(school):
    year = make_year(school)
    term = make_term(year)
    school_class = make_class(year, "basic_2", "A")
    made = ClassTeacherAssignment.objects.create(
        school_class=school_class, staff=make_staff(school), term=term
    )
    assert made.school == school
    with pytest.raises(IntegrityError), transaction.atomic():
        ClassTeacherAssignment.objects.create(
            school_class=school_class, staff=make_staff(school, username="ama.owusu"), term=term
        )


def test_assignments_stay_within_one_school_and_year(school, other_school):
    year = make_year(school)
    term = make_term(year)
    school_class = make_class(year, "basic_2")
    with pytest.raises(ValueError, match="different schools"):
        ClassTeacherAssignment.objects.create(
            school_class=school_class, staff=make_staff(other_school), term=term
        )
    old_term = make_term(make_year(school, "2025/2026", current=False))
    with pytest.raises(ValueError, match="school year"):
        ClassTeacherAssignment.objects.create(
            school_class=school_class, staff=make_staff(school), term=old_term
        )


def test_subjects_are_taught_only_in_their_bands(school):
    year = make_year(school)
    term = make_term(year)
    maths = Subject.objects.create(
        school=school, name="Mathematics", code="MATH", bands=["lower_primary", "jhs"]
    )
    literacy = Subject.objects.create(
        school=school, name="Language and Literacy", code="LL", bands=["kg"], is_learning_area=True
    )
    teacher = make_staff(school)
    school_class = make_class(year, "basic_2")
    assignment = TeachingAssignment.objects.create(
        staff=teacher, school_class=school_class, subject=maths, term=term
    )
    assert assignment.school == school
    with pytest.raises(ValueError, match="not taught"):
        TeachingAssignment.objects.create(
            staff=teacher, school_class=school_class, subject=literacy, term=term
        )
