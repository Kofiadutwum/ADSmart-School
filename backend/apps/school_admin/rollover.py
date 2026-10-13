"""The end-of-year rollover (SMS spec §34): every class moves up a year group into next year's
classes, pupils the school chooses repeat the year, leavers leave, and the final year completes.
History is kept: each old enrolment is closed with its outcome and a new one opened."""

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.response import Response

from apps.academics.models import AcademicYear, SchoolClass
from apps.academics.structure import YEAR_GROUP_CHOICES, YEAR_GROUPS
from apps.accounts import roles
from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError
from apps.people.models import Enrolment, Student
from apps.school_admin.views import SchoolView

ORDER = [code for code, _ in YEAR_GROUP_CHOICES]


def next_group(code: str, school) -> str | None:
    """The next year group, or None when the pupil finishes the levels this school teaches."""
    index = ORDER.index(code)
    if index + 1 == len(ORDER):
        return None
    following = ORDER[index + 1]
    return following if YEAR_GROUPS[following].band in school.levels_offered else None


def plan(from_year: AcademicYear, to_year: AcademicYear) -> list[dict]:
    rows = []
    for school_class in SchoolClass.objects.filter(academic_year=from_year).order_by(
        "year_group", "stream"
    ):
        target = next_group(school_class.year_group, school_class.school)
        pupils = Enrolment.objects.filter(
            school_class=school_class, end_date__isnull=True, student__status=Student.Status.ACTIVE
        ).count()
        rows.append(
            {
                "class": school_class.name,
                "class_id": school_class.pk,
                "pupils": pupils,
                "moves_to": SchoolClass(year_group=target, stream=school_class.stream).name
                if target
                else "Completes school",
            }
        )
    return rows


class RolloverSerializer(serializers.Serializer):
    from_year = serializers.IntegerField()
    to_year = serializers.IntegerField()
    repeaters = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )
    leavers = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)


class RolloverView(SchoolView):
    read_roles = (roles.ADMINISTRATOR, roles.HEAD_TEACHER)
    write_roles = (roles.ADMINISTRATOR,)

    def years(self, from_pk, to_pk):
        years = AcademicYear.objects.for_school(self.school)
        from_year = get_object_or_404(years, pk=from_pk)
        to_year = get_object_or_404(years, pk=to_pk)
        if to_year.start_date <= from_year.start_date:
            raise ApiError("wrong_order", "Choose a later year to move into.")
        return from_year, to_year

    def get(self, request):
        from_year, to_year = self.years(
            request.query_params.get("from") or 0, request.query_params.get("to") or 0
        )
        return Response(plan(from_year, to_year))

    @transaction.atomic
    def post(self, request):
        data = validated(RolloverSerializer, request)
        from_year, to_year = self.years(data["from_year"], data["to_year"])
        repeaters, leavers = set(data["repeaters"]), set(data["leavers"])
        counts = {"promoted": 0, "repeated": 0, "left": 0, "completed": 0}
        for school_class in SchoolClass.objects.filter(academic_year=from_year):
            target_group = next_group(school_class.year_group, self.school)
            places = Enrolment.objects.filter(
                school_class=school_class,
                end_date__isnull=True,
                student__status=Student.Status.ACTIVE,
            ).select_related("student")
            for place in places:
                pupil = place.student
                if pupil.pk in leavers:
                    outcome, group = Enrolment.Outcome.LEFT, None
                    pupil.status = Student.Status.WITHDRAWN
                    counts["left"] += 1
                elif pupil.pk in repeaters:
                    outcome, group = Enrolment.Outcome.REPEATED, school_class.year_group
                    counts["repeated"] += 1
                elif target_group is None:
                    outcome, group = Enrolment.Outcome.PROMOTED, None
                    pupil.status = Student.Status.COMPLETED
                    counts["completed"] += 1
                else:
                    outcome, group = Enrolment.Outcome.PROMOTED, target_group
                    counts["promoted"] += 1
                place.end_date, place.outcome = from_year.end_date, outcome
                place.save(update_fields=["end_date", "outcome"])
                pupil.save(update_fields=["status"])
                if group:
                    new_class, _ = SchoolClass.objects.get_or_create(
                        school=self.school,
                        academic_year=to_year,
                        year_group=group,
                        stream=school_class.stream,
                    )
                    if not Enrolment.objects.filter(
                        student=pupil, academic_year=to_year, end_date__isnull=True
                    ).exists():
                        Enrolment.objects.create(
                            student=pupil, school_class=new_class, start_date=to_year.start_date
                        )
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=to_year,
            new={"rollover_from": from_year.name, **counts},
            request=request,
        )
        return Response(counts)
