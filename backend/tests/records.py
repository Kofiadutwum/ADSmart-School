"""Factories for school records in tests."""

from datetime import date, timedelta

from apps.academics.models import AcademicYear, SchoolClass, Term
from apps.people import services


def make_year(school, name="2026/2027", current=True):
    start = int(name[:4])
    return AcademicYear.objects.create(
        school=school,
        name=name,
        start_date=date(start, 9, 1),
        end_date=date(start + 1, 7, 31),
        is_current=current,
    )


def make_term(year, number=1):
    start = year.start_date + timedelta(days=7)
    return Term.objects.create(
        academic_year=year, number=number, start_date=start, end_date=start + timedelta(days=90)
    )


def make_class(year, year_group, stream=""):
    return SchoolClass.objects.create(academic_year=year, year_group=year_group, stream=stream)


def make_student(school, first_name="Ama", surname="Mensah", **fields):
    defaults = {
        "date_of_birth": date(2019, 3, 14),
        "gender": "F",
        "admission_date": date(2026, 9, 8),
    }
    return services.admit_student(
        school, first_name=first_name, surname=surname, **{**defaults, **fields}
    )


def make_parent(school, phone="024 123 4567", first_name="Akua", surname="Mensah", **fields):
    return services.create_parent(
        school, phone=phone, first_name=first_name, surname=surname, **fields
    )


def make_staff(
    school,
    username="k.mensah",
    roles_held=("Teacher",),
    first_name="Kofi",
    surname="Mensah",
    **fields,
):
    return services.create_staff(
        school,
        username=username,
        first_name=first_name,
        surname=surname,
        roles_held=list(roles_held),
        **fields,
    )
