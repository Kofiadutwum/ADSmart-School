from datetime import date

import pytest
from django.db import IntegrityError, transaction

from apps.audit.models import AuditLog
from apps.people import services
from apps.people.models import Student
from apps.people.student_ids import is_valid_student_id
from tests.helpers import jpeg_upload, sign_in
from tests.records import make_class, make_parent, make_staff, make_student, make_year

pytestmark = pytest.mark.django_db
START = date(2026, 9, 8)


def test_admitting_a_pupil_gives_a_checked_student_id(school):
    student = make_student(school)
    assert student.school == school and student.student_id.startswith("26")
    assert is_valid_student_id(student.student_id) and student.status == "ACTIVE"
    assert AuditLog.objects.get(action="CREATED").entity_id == str(student.pk)


def test_student_ids_are_unique_within_a_school(school):
    student = make_student(school)
    with pytest.raises(IntegrityError), transaction.atomic():
        Student.objects.create(
            school=school,
            student_id=student.student_id,
            first_name="Kofi",
            surname="Boateng",
            date_of_birth=date(2018, 1, 1),
            gender="M",
            admission_date=START,
        )


def test_status_changes_need_a_reason_and_are_audited(school):
    student = make_student(school)
    with pytest.raises(ValueError, match="reason"):
        services.change_student_status(student, Student.Status.TRANSFERRED, reason=" ")
    services.change_student_status(student, Student.Status.TRANSFERRED, reason="Moved to Accra")
    entry = AuditLog.objects.get(action="STATUS_CHANGED")
    assert entry.old_value == {"status": "ACTIVE"} and entry.new_value == {"status": "TRANSFERRED"}
    assert entry.reason == "Moved to Accra"


def test_parents_get_an_account_awaiting_activation(school, other_school):
    parent = make_parent(school, title="Mrs")
    user = parent.user
    assert parent.phone == "+233241234567" and user.login == "+233241234567"
    assert user.kind == "parent" and user.school == school and not user.has_usable_password()
    assert user.groups.filter(name="Parent").exists()
    assert make_parent(other_school).school == other_school  # the same number at another school
    with pytest.raises(IntegrityError), transaction.atomic():
        make_parent(school)


def test_siblings_share_a_parent_but_never_across_schools(school, other_school):
    parent = make_parent(school)
    for first_name in ("Ama", "Kojo"):
        child = make_student(school, first_name=first_name)
        services.link_guardian(parent, child, "MOTHER", is_primary_contact=True)
    assert parent.guardianships.count() == 2
    with pytest.raises(ValueError, match="different schools"):
        services.link_guardian(parent, make_student(other_school), "MOTHER")


def test_one_open_enrolment_per_pupil_per_year(school, other_school):
    year = make_year(school)
    student = make_student(school)
    enrolment = services.enrol(student, make_class(year, "basic_2", "A"), start_date=START)
    assert enrolment.academic_year == year and enrolment.school == school
    with pytest.raises(IntegrityError), transaction.atomic():
        services.enrol(student, make_class(year, "basic_2", "B"), start_date=date(2026, 10, 1))
    with pytest.raises(ValueError, match="different schools"):
        services.enrol(make_student(other_school), make_class(year, "basic_3"), start_date=START)


def test_staff_accounts_hold_staff_roles_only(school):
    staff = make_staff(school, roles_held=["Teacher", "Head Teacher"], phone="020 123 4567")
    assert staff.user.kind == "staff" and staff.user.login == "k.mensah"
    assert sorted(staff.user.groups.values_list("name", flat=True)) == ["Head Teacher", "Teacher"]
    assert staff.phone == staff.user.phone == "+233201234567"
    for number, role in enumerate(("Parent", "Platform Admin")):
        with pytest.raises(ValueError, match="staff role"):
            make_staff(school, username=f"someone{number}", roles_held=[role])


def test_contacts_and_pickup_people(school):
    student = make_student(school)
    mother = services.add_emergency_contact(
        student, name="Akua Mensah", phone="024 123 4567", relationship="Mother"
    )
    uncle = services.add_emergency_contact(
        student, name="Yaw Mensah", phone="055 987 6543", relationship="Uncle"
    )
    assert (mother.priority, uncle.priority) == (1, 2) and uncle.phone == "+233559876543"
    person = services.add_pickup_person(
        student, name="Kwame Asante", phone="055 111 2222", relationship="Driver", valid_from=START
    )
    assert person.school == school
    assert AuditLog.objects.filter(entity_type="people.pickupperson").count() == 1


def test_photos_are_filed_by_school_under_a_random_name(school):
    student = make_student(school, photo=jpeg_upload("ama-mensah.jpg"))
    assert student.photo.name.startswith(f"schools/{school.pk}/student/")
    assert "ama" not in student.photo.name and student.photo.name.endswith(".jpg")


def test_pupils_from_basic_4_can_be_given_a_sign_in(api, school):
    year = make_year(school)
    younger = make_student(school)
    services.enrol(younger, make_class(year, "basic_3"), start_date=START)
    with pytest.raises(ValueError, match="Basic 4"):
        services.give_student_login(younger, "first password 1")
    older = make_student(school, first_name="Kojo")
    services.enrol(older, make_class(year, "basic_5"), start_date=START)
    user = services.give_student_login(older, "first password 1")
    assert user.kind == "student" and user.must_change_password and older.user == user
    response = sign_in(api, older.student_id, "first password 1", kind="student")
    assert response.json()["status"] == "signed_in"
