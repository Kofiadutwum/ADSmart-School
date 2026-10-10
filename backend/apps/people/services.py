"""Admitting pupils and recording their families and staff (Phase 1 spec §3.2).

The changes the spec asks to audit (§11.3) are recorded here: admissions, status changes,
enrolments, pick-up people, guardians and new accounts.
"""

from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.db import transaction

from apps.academics.structure import BANDS
from apps.accounts import roles
from apps.accounts.identifiers import normalise_identifier
from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.phones import normalise_gh_phone
from apps.people.models import (
    EmergencyContact,
    Enrolment,
    Guardianship,
    Parent,
    PickupPerson,
    Staff,
    Student,
)
from apps.people.student_ids import allocate_student_id

STAFF_ROLES = frozenset(roles.SCHOOL_ROLES) - {roles.PARENT, roles.STUDENT}


@transaction.atomic
def admit_student(
    school, *, first_name, surname, date_of_birth, gender, admission_date, by=None, **fields
) -> Student:
    student = Student.objects.create(
        school=school,
        student_id=allocate_student_id(school, admission_date.year),
        first_name=first_name,
        surname=surname,
        date_of_birth=date_of_birth,
        gender=gender,
        admission_date=admission_date,
        **fields,
    )
    record(
        AuditLog.Action.CREATED, actor=by, entity=student, new={"student_id": student.student_id}
    )
    return student


def change_student_status(student, status: str, *, reason: str, by=None) -> Student:
    """Pupils are never deleted; leaving, transfer or suspension is a status with a reason."""
    if not reason.strip():
        raise ValueError("Give a reason for the status change.")
    old = student.status
    student.status = status
    student.save(update_fields=["status"])
    record(
        AuditLog.Action.STATUS_CHANGED,
        actor=by,
        entity=student,
        old={"status": old},
        new={"status": status},
        reason=reason,
    )
    return student


@transaction.atomic
def create_parent(school, *, phone, first_name, surname, by=None, **fields) -> Parent:
    """The account is made at admission and waits for the parent to activate it (§5.2)."""
    phone = normalise_gh_phone(phone)
    user = User.objects.create_user(
        phone,
        kind=User.Kind.PARENT,
        school=school,
        display_name=f"{first_name} {surname}",
        phone=phone,
    )
    user.groups.add(Group.objects.get(name=roles.PARENT))
    parent = Parent.objects.create(
        school=school, user=user, phone=phone, first_name=first_name, surname=surname, **fields
    )
    record(
        AuditLog.Action.USER_CREATED,
        actor=by,
        entity=user,
        new={"kind": "parent", "roles": [roles.PARENT]},
    )
    return parent


def link_guardian(
    parent, student, relationship: str, *, is_payer=False, is_primary_contact=False, by=None
) -> Guardianship:
    link = Guardianship.objects.create(
        parent=parent,
        student=student,
        relationship=relationship,
        is_payer=is_payer,
        is_primary_contact=is_primary_contact,
    )
    record(
        AuditLog.Action.CREATED,
        actor=by,
        entity=link,
        new={"parent": parent.pk, "student": student.pk, "relationship": relationship},
    )
    return link


@transaction.atomic
def create_staff(
    school, *, username, first_name, surname, roles_held, by=None, phone="", email="", **fields
) -> Staff:
    unknown = set(roles_held) - STAFF_ROLES
    if unknown:
        raise ValueError(f"Not a staff role: {', '.join(sorted(unknown))}.")
    login = normalise_identifier(User.Kind.STAFF, username)
    phone = normalise_gh_phone(phone) if phone else ""
    user = User.objects.create_user(
        login,
        kind=User.Kind.STAFF,
        school=school,
        display_name=f"{first_name} {surname}",
        phone=phone,
        email=email,
    )
    user.groups.set(Group.objects.filter(name__in=roles_held))
    staff = Staff.objects.create(
        school=school,
        user=user,
        first_name=first_name,
        surname=surname,
        phone=phone,
        email=email,
        **fields,
    )
    record(
        AuditLog.Action.USER_CREATED,
        actor=by,
        entity=user,
        new={"kind": "staff", "roles": sorted(roles_held)},
    )
    return staff


def enrol(student, school_class, *, start_date, by=None) -> Enrolment:
    enrolment = Enrolment.objects.create(
        student=student, school_class=school_class, start_date=start_date
    )
    record(
        AuditLog.Action.CREATED,
        actor=by,
        entity=enrolment,
        new={"student": student.student_id, "class": school_class.name},
    )
    return enrolment


def add_emergency_contact(student, *, name, phone, relationship) -> EmergencyContact:
    """Any Ghana number will do: a contact may only have a landline."""
    return EmergencyContact.objects.create(
        student=student,
        name=name,
        phone=normalise_gh_phone(phone, mobile_only=False),
        relationship=relationship,
        priority=student.emergency_contacts.count() + 1,
    )


def add_pickup_person(
    student, *, name, phone, relationship, valid_from, valid_to=None, by=None, **fields
) -> PickupPerson:
    person = PickupPerson.objects.create(
        student=student,
        name=name,
        phone=normalise_gh_phone(phone),
        relationship=relationship,
        valid_from=valid_from,
        valid_to=valid_to,
        **fields,
    )
    record(
        AuditLog.Action.CREATED,
        actor=by,
        entity=person,
        new={"student": student.student_id, "name": name},
    )
    return person


@transaction.atomic
def give_student_login(student, password: str, *, by=None) -> User:
    """Pupils from Basic 4 sign in with their Student ID and choose their own password first."""
    enrolment = (
        student.enrolments.filter(end_date__isnull=True).select_related("school_class").first()
    )
    if enrolment is None or not BANDS[enrolment.school_class.band].student_login:
        raise ValueError("Only pupils from Basic 4 up sign in.")
    user = User(
        login=student.student_id,
        kind=User.Kind.STUDENT,
        school=student.school,
        display_name=f"{student.first_name} {student.surname}",
        must_change_password=True,
    )
    validate_password(password, user)
    user.set_password(password)
    user.save()
    user.groups.add(Group.objects.get(name=roles.STUDENT))
    student.user = user
    student.save(update_fields=["user"])
    record(
        AuditLog.Action.USER_CREATED,
        actor=by,
        entity=user,
        new={"kind": "student", "roles": [roles.STUDENT]},
    )
    return user
