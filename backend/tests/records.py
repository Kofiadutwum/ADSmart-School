"""Factories for school records in tests."""

from datetime import date, timedelta

from apps.academics.models import AcademicYear, SchoolClass, Term


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
