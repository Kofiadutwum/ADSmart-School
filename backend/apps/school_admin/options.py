"""Choices for the portal's drop-down lists, always from the user's own school."""

from django.http import Http404
from rest_framework.response import Response

from apps.academics.models import AcademicYear, SchoolClass, Subject, Term
from apps.people.models import Enrolment, Parent, Staff, Student
from apps.people.services import STAFF_ROLES
from apps.school_admin.dashboard import current_year
from apps.school_admin.views import SchoolView


def _pupils(school):
    year = current_year(school)
    rows = Student.objects.for_school(school).filter(status=Student.Status.ACTIVE)
    places = {
        place.student_id: place.school_class.name
        for place in Enrolment.objects.filter(
            school=school, academic_year=year, end_date__isnull=True
        ).select_related("school_class")
    }
    return [
        {"id": pupil.pk, "name": f"{pupil.full_name} ({places.get(pupil.pk, 'no class')})"}
        for pupil in rows.order_by("first_name", "surname")
    ]


def _classes(school):
    year = current_year(school)
    rows = SchoolClass.objects.for_school(school).filter(academic_year=year)
    return sorted(({"id": row.pk, "name": row.name} for row in rows), key=lambda item: item["name"])


SOURCES = {
    "pupils": _pupils,
    "staff": lambda school: [
        {"id": row.pk, "name": f"{row.first_name} {row.surname}"}
        for row in Staff.objects.for_school(school).filter(user__is_active=True).order_by("first_name")
    ],
    "parents": lambda school: [
        {"id": row.pk, "name": f"{row} ({row.phone})"} for row in Parent.objects.for_school(school)
    ],
    "classes": _classes,
    "subjects": lambda school: [{"id": row.pk, "name": row.name} for row in Subject.objects.for_school(school)],
    "terms": lambda school: [
        {"id": row.pk, "name": str(row)}
        for row in Term.objects.for_school(school).select_related("academic_year").order_by("-start_date")
    ],
    "years": lambda school: [{"id": row.pk, "name": row.name} for row in AcademicYear.objects.for_school(school)],
}


def register(kind: str, source) -> None:
    """Other apps add their own lists (buses, books, …)."""
    SOURCES[kind] = source


class OptionsView(SchoolView):
    read_roles = tuple(STAFF_ROLES)

    def get(self, request, kind):
        source = SOURCES.get(kind)
        if source is None:
            raise Http404
        return Response(source(self.school))
