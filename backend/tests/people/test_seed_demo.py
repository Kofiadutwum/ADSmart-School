from datetime import date
from io import StringIO

import pytest
from django.contrib.auth.models import Group
from django.core.management import CommandError, call_command

from apps.academics.models import (
    AcademicYear,
    CalendarDay,
    ClassTeacherAssignment,
    SchoolClass,
    Subject,
    TeachingAssignment,
    Term,
)
from apps.academics.structure import YEAR_GROUPS
from apps.accounts import roles
from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.consent.models import Consent
from apps.people.models import Parent, PickupPerson, Staff, Student
from apps.people.seeding import seed_demo
from apps.people.services import STAFF_ROLES
from apps.people.student_ids import is_valid_student_id
from tests.helpers import sign_in

pytestmark = pytest.mark.django_db
TODAY = date(2026, 10, 10)


@pytest.fixture
def seeded(school, settings):
    settings.DEMO_LOGINS_ENABLED = False
    return seed_demo(school, pupils=40, today=TODAY)


def test_a_demo_school_has_a_current_year_three_terms_and_a_calendar(school, seeded):
    year = AcademicYear.objects.get(school=school)
    assert year.name == "2026/2027" and year.is_current and year.terms.count() == 3
    assert CalendarDay.objects.filter(school=school, type="HOLIDAY").exists()


def test_one_class_per_year_group_and_two_with_a_second_stream(school, seeded):
    names = {school_class.name for school_class in SchoolClass.objects.filter(school=school)}
    assert len(names) == 16 and {"Basic 1A", "Basic 1B", "KG 1A", "KG 1B", "JHS 3"} <= names
    assert seeded.counts["classes"] == 16


def test_only_the_levels_a_school_teaches(other_school, settings):
    settings.DEMO_LOGINS_ENABLED = False
    seed_demo(other_school, pupils=20, today=TODAY)
    codes = set(
        SchoolClass.objects.filter(school=other_school).values_list("year_group", flat=True)
    )
    assert codes == {"kg_1", "kg_2", "basic_1", "basic_2", "basic_3"}
    subjects = Subject.objects.filter(school=other_school)
    assert all(set(subject.bands) <= {"kg", "lower_primary"} for subject in subjects)
    assert not subjects.filter(code__in=["SOC", "COMP"]).exists()


def test_pupils_are_demo_records_with_checked_ids_and_fitting_ages(school, seeded):
    students = Student.objects.filter(school=school)
    assert students.count() == 40 and all(student.is_demo for student in students)
    for student in students:
        assert is_valid_student_id(student.student_id)
        enrolment = student.enrolments.get(end_date__isnull=True)
        start, born = enrolment.academic_year.start_date, student.date_of_birth
        age = start.year - born.year - ((start.month, start.day) < (born.month, born.day))
        assert age == YEAR_GROUPS[enrolment.school_class.year_group].age_from


def test_families_contacts_pickups_and_consents(school, seeded):
    parents = Parent.objects.filter(school=school)
    assert all(parent.is_demo and not parent.user.has_usable_password() for parent in parents)
    assert any(parent.guardianships.count() > 1 for parent in parents)  # brothers and sisters
    students = Student.objects.filter(school=school)
    assert all(student.emergency_contacts.exists() for student in students)
    complete = sum(student.emergency_contacts.count() >= 2 for student in students)
    assert complete >= 0.85 * students.count()
    assert PickupPerson.objects.filter(school=school, is_demo=True).exists()
    photos = Consent.objects.filter(school=school, type="PHOTO_USE")
    assert photos.count() == 40 and photos.filter(given=False).exists()
    assert Consent.objects.filter(school=school, type="SMS_CONTACT").count() == parents.count()


def test_staff_cover_every_role_with_classes_and_subjects(school, seeded):
    staff = Staff.objects.filter(school=school)
    held = set(Group.objects.filter(user__staff_profile__in=staff).values_list("name", flat=True))
    assert held == STAFF_ROLES and all(person.is_demo for person in staff)
    term = Term.objects.get(school=school, number=1)  # 10 October falls in the first term
    for school_class in SchoolClass.objects.filter(school=school):
        assert (
            ClassTeacherAssignment.objects.filter(school_class=school_class, term=term).count() == 1
        )
    teaching = TeachingAssignment.objects.filter(school=school).select_related(
        "subject", "school_class"
    )
    assert teaching.exists()
    assert all(item.school_class.band in item.subject.bands for item in teaching)


def test_demo_records_make_one_summary_audit_entry(school, seeded):
    entries = list(AuditLog.objects.filter(school=school).values_list("action", "entity_type"))
    assert entries.count(("CREATED", "academics.term")) == 3
    assert entries.count(("CREATED", "demo")) == 1 and len(entries) == 4


def test_seed_demo_refuses_a_school_with_pupils(school, seeded):
    with pytest.raises(CommandError, match="already has pupils"):
        call_command("seed_demo", school="adsmart", pupils=5)


def test_no_demo_sign_ins_unless_enabled(school, seeded):
    assert seeded.logins == [] and seeded.password == ""
    assert not User.objects.filter(school=school).exclude(password__startswith="!").exists()


def test_demo_sign_ins_when_enabled(api, school, settings):
    settings.DEMO_LOGINS_ENABLED = True
    result = seed_demo(school, pupils=40, today=TODAY)
    logins = dict(result.logins)
    assert set(logins) == STAFF_ROLES | {roles.PARENT, roles.STUDENT}
    assert sign_in(api, logins[roles.TEACHER], result.password).json()["status"] == "signed_in"
    pupil = sign_in(api, logins[roles.STUDENT], result.password, kind="student")
    assert pupil.json()["status"] == "signed_in"


def test_the_command_reports_what_it_made(school, settings):
    settings.DEMO_LOGINS_ENABLED = False
    out = StringIO()
    call_command("seed_demo", school="adsmart", pupils=10, stdout=out)
    assert "10 pupils" in out.getvalue()
