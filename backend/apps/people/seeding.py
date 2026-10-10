"""seed_demo: a realistic demo school (Phase 1 spec §9).

Every person it makes is flagged is_demo and shows a DEMO badge, and numbers linked only to
demo records are never texted. Records are written directly rather than through the services,
so the append-only audit log gets one summary entry instead of hundreds.
"""

import random
import secrets
from dataclasses import dataclass, field
from datetime import date, timedelta

from django.conf import settings
from django.contrib.auth.models import Group
from django.db import transaction
from django.utils import timezone

from apps.academics.calendar import create_term
from apps.academics.models import (
    AcademicYear,
    ClassTeacherAssignment,
    SchoolClass,
    Subject,
    TeachingAssignment,
)
from apps.academics.structure import BANDS, YEAR_GROUPS, year_groups_for
from apps.accounts import roles
from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.consent.models import Consent, PrivacyNotice
from apps.core.phones import format_gh_local
from apps.people import demo_data
from apps.people.models import (
    EmergencyContact,
    Enrolment,
    Guardianship,
    Parent,
    PickupPerson,
    Staff,
    Student,
)
from apps.people.student_ids import allocate_student_id, format_student_id

CARE_BANDS = {"creche", "nursery"}  # their classes have caregivers rather than teachers
PICKUP_BANDS = {"creche", "nursery", "kg", "lower_primary"}
MOTHER, FATHER = Guardianship.Relationship.MOTHER, Guardianship.Relationship.FATHER


@dataclass
class DemoResult:
    counts: dict[str, int]
    password: str = ""
    logins: list[tuple[str, str]] = field(default_factory=list)


class _Maker:
    """One run's random source, plus every phone number and login already taken."""

    def __init__(self, school, seed: int):
        self.school = school
        self.rng = random.Random(f"{school.slug}:{seed}")
        self.phones = set(Parent.objects.for_school(school).values_list("phone", flat=True))
        self.logins = set(User.objects.filter(school=school).values_list("login", flat=True))
        self.groups = {
            group.name: group for group in Group.objects.filter(name__in=roles.SCHOOL_ROLES)
        }
        self.offered = [group.code for group in year_groups_for(school.levels_offered)]
        self.notice = PrivacyNotice.current(school)
        self.now = timezone.now()

    def phone(self) -> str:
        while True:
            prefix = self.rng.choice(demo_data.MOBILE_PREFIXES)
            number = f"+233{prefix}{self.rng.randrange(10**7):07d}"
            if number not in self.phones:
                self.phones.add(number)
                return number

    def name(self, gender: str) -> tuple[str, str]:
        first = self.rng.choice(demo_data.GIRLS if gender == "F" else demo_data.BOYS)
        return first, self.rng.choice(demo_data.SURNAMES)

    def username(self, first: str, surname: str) -> str:
        base = f"{first}.{surname}".lower()
        login, number = base, 1
        while login in self.logins:
            number += 1
            login = f"{base}{number}"
        self.logins.add(login)
        return login

    def consent(self, kind: str, chance: float, **subject) -> Consent:
        given = self.rng.random() < chance
        return Consent(
            school=self.school,
            type=kind,
            given=given,
            given_at=self.now if given else None,
            privacy_notice=self.notice,
            **subject,
        )


@transaction.atomic
def seed_demo(school, *, pupils: int = 250, seed: int = 1, today: date | None = None) -> DemoResult:
    if Student.objects.for_school(school).exists():
        raise ValueError(
            f"{school.name} already has pupils. Demo records only go into a school without any; "
            "if they are demo records, remove them with purge_demo first."
        )
    maker = _Maker(school, seed)
    year, term = _school_year(school, today or timezone.localdate())
    classes = _classes(year)
    subjects = _subjects(school)
    staff = _staff(maker, classes, subjects, term)
    enrolled, parents = _pupils(maker, year, classes, pupils)
    counts = {
        "classes": len(classes),
        "pupils": len(enrolled),
        "parents": len(parents),
        "staff": len(staff),
    }
    record(
        AuditLog.Action.CREATED,
        school=school,
        entity_type="demo",
        new=counts,
        reason="Demo records made with manage.py seed_demo",
    )
    result = DemoResult(counts)
    if settings.DEMO_LOGINS_ENABLED:
        result.password, result.logins = _demo_logins(maker, staff, enrolled, parents)
    return result


def _school_year(school, today: date):
    """The school year containing today, September to July, with three terms (demo dates)."""
    start = today.year if today.month >= 8 else today.year - 1
    year, _ = AcademicYear.objects.get_or_create(
        school=school,
        name=f"{start}/{start + 1}",
        defaults={
            "start_date": date(start, 9, 1),
            "end_date": date(start + 1, 7, 31),
            "is_current": not AcademicYear.objects.for_school(school)
            .filter(is_current=True)
            .exists(),
        },
    )
    if not year.terms.exists():
        create_term(year, 1, date(start, 9, 8), date(start, 12, 18))
        create_term(year, 2, date(start + 1, 1, 12), date(start + 1, 4, 9))
        create_term(year, 3, date(start + 1, 5, 4), date(start + 1, 7, 30))
    terms = list(year.terms.all())
    current = next((term for term in terms if term.start_date <= today <= term.end_date), None)
    upcoming = next((term for term in terms if term.start_date > today), terms[-1])
    return year, current or upcoming


def _classes(year) -> list[SchoolClass]:
    groups = year_groups_for(year.school.levels_offered)
    offered = [group.code for group in groups]
    doubled = [code for code in demo_data.SECOND_STREAMS if code in offered][:2]
    classes = []
    for group in groups:
        for stream in ("A", "B") if group.code in doubled else ("",):
            school_class, _ = SchoolClass.objects.get_or_create(
                academic_year=year, year_group=group.code, stream=stream
            )
            classes.append(school_class)
    return classes


def _subjects(school) -> list[Subject]:
    made = []
    for name, code, bands, learning_area in demo_data.SUBJECTS:
        taught = [band for band in bands if band in school.levels_offered]
        if taught:
            subject, _ = Subject.objects.get_or_create(
                school=school,
                code=code,
                defaults={"name": name, "bands": taught, "is_learning_area": learning_area},
            )
            made.append(subject)
    return made


def _hire(maker, role: str, qualification: str, number: int, *, licensed: bool) -> Staff:
    first, surname = maker.name(maker.rng.choice("FM"))
    login = maker.username(first, surname)
    phone = maker.phone()
    user = User.objects.create_user(
        login,
        kind=User.Kind.STAFF,
        school=maker.school,
        display_name=f"{first} {surname}",
        phone=phone,
    )
    user.groups.add(maker.groups[role])
    contact = " ".join(maker.name(maker.rng.choice("FM")))
    return Staff.objects.create(
        school=maker.school,
        user=user,
        staff_number=f"ST{number:03d}",
        first_name=first,
        surname=surname,
        phone=phone,
        email=f"{login}@example.com",
        qualifications=qualification,
        licence_number=f"DEMO-{number:05d}" if licensed else "",
        emergency_contact=f"{contact}, {format_gh_local(maker.phone())}",
        is_demo=True,
    )


def _staff(maker, classes, subjects, term) -> list[tuple[Staff, str]]:
    """Every role the school needs, a class teacher per class and teachers for each subject."""
    hired: list[tuple[Staff, str]] = []

    def hire(role: str, qualification: str, licensed: bool = False) -> Staff:
        person = _hire(maker, role, qualification, len(hired) + 1, licensed=licensed)
        hired.append((person, role))
        return person

    def teacher() -> Staff:
        qualification = maker.rng.choice(demo_data.TEACHER_QUALIFICATIONS)
        return hire(roles.TEACHER, qualification, licensed=True)

    for role, qualification in demo_data.SUPPORT_ROLES:
        hire(role, qualification)
    has_jhs = any(school_class.band == "jhs" for school_class in classes)
    specialists = {
        subject.pk: teacher() for subject in subjects if has_jhs and "jhs" in subject.bands
    }
    jhs_teachers = list(specialists.values())
    for index, school_class in enumerate(classes):
        if school_class.band == "jhs":
            class_teacher = jhs_teachers[index % len(jhs_teachers)]
        elif school_class.band in CARE_BANDS:
            class_teacher = hire(roles.CAREGIVER, demo_data.CAREGIVER_QUALIFICATION)
        else:
            class_teacher = teacher()
        ClassTeacherAssignment.objects.create(
            school_class=school_class, staff=class_teacher, term=term
        )
        for subject in subjects:
            if school_class.band in subject.bands:
                # In JHS each subject has its own teacher; below JHS the class teacher teaches all.
                taught_by = specialists[subject.pk] if school_class.band == "jhs" else class_teacher
                TeachingAssignment.objects.create(
                    staff=taught_by, school_class=school_class, subject=subject, term=term
                )
    return hired


def _pupils(maker, year, classes, pupils):
    """Families of one to three children, so brothers and sisters share parents."""
    places = [classes[number % len(classes)] for number in range(pupils)]
    maker.rng.shuffle(places)
    enrolled: list[tuple[Student, SchoolClass]] = []
    parents: list[Parent] = []
    while places:
        size = maker.rng.choices((1, 2, 3), weights=(60, 30, 10))[0]
        family, places = places[:size], places[size:]
        children, family_parents = _family(maker, year, family)
        enrolled += children
        parents += family_parents
    return enrolled, parents


def _parent(maker, gender: str, surname: str, address: str) -> Parent:
    first, _ = maker.name(gender)
    phone = maker.phone()
    user = User.objects.create_user(
        phone,
        kind=User.Kind.PARENT,
        school=maker.school,
        display_name=f"{first} {surname}",
        phone=phone,
    )
    user.groups.add(maker.groups[roles.PARENT])
    with_email = maker.rng.random() < 0.3
    parent = Parent.objects.create(
        school=maker.school,
        user=user,
        title="Mr" if gender == "M" else maker.rng.choice(("Mrs", "Ms")),
        first_name=first,
        surname=surname,
        phone=phone,
        email=f"{first}.{surname}{maker.rng.randint(1, 99)}@example.com".lower()
        if with_email
        else "",
        address=address,
        is_demo=True,
    )
    Consent.objects.bulk_create(
        maker.consent(kind, chance, parent=parent) for kind, chance in demo_data.PARENT_CONSENTS
    )
    return parent


def _family(maker, year, places):
    rng = maker.rng
    surname = rng.choice(demo_data.SURNAMES)
    landmark = rng.choice(demo_data.LANDMARKS)
    address = f"House {rng.randint(1, 120)}, near {landmark}, {maker.school.town}"
    shape = rng.random()  # 70% both parents, 22% the mother alone, 8% the father alone
    parents = []
    if shape < 0.92:
        mother_surname = rng.choice(demo_data.SURNAMES) if rng.random() < 0.4 else surname
        parents.append((_parent(maker, "F", mother_surname, address), MOTHER))
    if shape >= 0.22:
        parents.append((_parent(maker, "M", surname, address), FATHER))
    father = next((parent for parent, relationship in parents if relationship == FATHER), None)
    payer = father or parents[0][0]
    contacts = [(str(parent), parent.phone, relationship.label) for parent, relationship in parents]
    if len(contacts) < 2 and rng.random() < 0.9:  # the rest show the Incomplete warning
        relationship, gender = rng.choice(demo_data.RELATIVES)
        contacts.append((" ".join(maker.name(gender)), maker.phone(), relationship))

    children = []
    start = year.start_date
    for school_class in places:
        group = YEAR_GROUPS[school_class.year_group]
        gender = rng.choice("FM")
        first, _ = maker.name(gender)
        middle = maker.name(gender)[0] if rng.random() < 0.4 else ""
        born = date(start.year - group.age_from, start.month, start.day) - timedelta(
            days=rng.randint(1, 360)
        )
        joined = start.year - rng.randint(0, min(maker.offered.index(group.code), 4))
        admitted = date(joined, 9, rng.randint(8, 20))
        student = Student.objects.create(
            school=maker.school,
            student_id=allocate_student_id(maker.school, joined),
            first_name=first,
            middle_name="" if middle == first else middle,
            surname=(father or parents[0][0]).surname,
            date_of_birth=born,
            gender=gender,
            admission_date=admitted,
            address=address,
            pickup_point=rng.choice(demo_data.PICKUP_POINTS) if rng.random() < 0.3 else "",
            is_demo=True,
        )
        Enrolment.objects.create(
            student=student, school_class=school_class, start_date=max(admitted, start)
        )
        EmergencyContact.objects.bulk_create(
            EmergencyContact(
                school=maker.school,
                student=student,
                name=name,
                phone=phone,
                relationship=relation,
                priority=priority,
            )
            for priority, (name, phone, relation) in enumerate(contacts, start=1)
        )
        for parent, relationship in parents:
            Guardianship.objects.create(
                parent=parent,
                student=student,
                relationship=relationship,
                is_payer=parent == payer,
                is_primary_contact=parent == parents[0][0],
            )
        if group.band in PICKUP_BANDS:
            for _ in range(rng.randint(1, 2)):
                relation, pickup_gender = rng.choice(demo_data.PICKUP_RELATIONSHIPS)
                PickupPerson.objects.create(
                    student=student,
                    name=" ".join(maker.name(pickup_gender)),
                    phone=maker.phone(),
                    relationship=relation,
                    valid_from=start,
                    is_demo=True,
                )
        Consent.objects.bulk_create(
            maker.consent(kind, chance, student=student)
            for kind, chance in demo_data.PUPIL_CONSENTS
        )
        children.append((student, school_class))
    return children, [parent for parent, _ in parents]


def _demo_logins(maker, staff, enrolled, parents) -> tuple[str, list[tuple[str, str]]]:
    """One sign-in per role for trying the system (§9). Development only: settings refuse
    DEMO_LOGINS_ENABLED unless DJANGO_DEBUG is on."""
    password = secrets.token_urlsafe(12)
    logins: list[tuple[str, str]] = []
    seen = set()
    for person, role in staff:
        if role not in seen:
            seen.add(role)
            person.user.set_password(password)
            person.user.save(update_fields=["password"])
            logins.append((role, person.user.login))
    if parents:
        parent = parents[0]
        parent.user.set_password(password)
        parent.user.activated_at = maker.now
        parent.user.save(update_fields=["password", "activated_at"])
        logins.append((roles.PARENT, format_gh_local(parent.phone)))
    pupil = next(
        (student for student, school_class in enrolled if BANDS[school_class.band].student_login),
        None,
    )
    if pupil is not None:
        user = User.objects.create_user(
            pupil.student_id,
            kind=User.Kind.STUDENT,
            school=maker.school,
            password=password,
            display_name=f"{pupil.first_name} {pupil.surname}",
        )
        user.groups.add(maker.groups[roles.STUDENT])
        pupil.user = user
        pupil.save(update_fields=["user"])
        logins.append((roles.STUDENT, format_student_id(pupil.student_id)))
    return password, logins
