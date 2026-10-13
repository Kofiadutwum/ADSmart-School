"""Placing pupils in classes, singly or in bulk, with their class history kept (Phase 1 spec
§7.2), and the Proprietor's enrolment overview (§7.3)."""

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response

from apps.academics.models import SchoolClass
from apps.academics.structure import BANDS, YEAR_GROUPS
from apps.accounts import roles
from apps.accounts.views import validated
from apps.people.models import Enrolment, Student
from apps.people.services import enrol
from apps.school_admin.dashboard import current_year
from apps.school_admin.pupils import pupil_of
from apps.school_admin.views import SchoolView

GROUP_ORDER = {code: index for index, code in enumerate(YEAR_GROUPS)}


class PlaceSerializer(serializers.Serializer):
    students = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)
    school_class = serializers.IntegerField()
    start_date = serializers.DateField(default=timezone.localdate)


class EnrolmentsView(SchoolView):
    """A pupil already in another class this year moves: the old place ends on the start date."""

    @transaction.atomic
    def post(self, request):
        data = validated(PlaceSerializer, request)
        classes = SchoolClass.objects.for_school(self.school)
        school_class = classes.filter(pk=data["school_class"]).first()
        if school_class is None:
            raise serializers.ValidationError({"school_class": ["Choose a class of this school."]})
        wanted = set(data["students"])
        pupils = list(Student.objects.for_school(self.school).filter(pk__in=wanted))
        if len(pupils) != len(wanted):
            raise serializers.ValidationError({"students": ["Choose pupils of this school."]})
        inactive = [pupil.full_name for pupil in pupils if pupil.status != Student.Status.ACTIVE]
        if inactive:
            raise serializers.ValidationError(
                {"students": [f"Only active pupils can be placed: {', '.join(inactive)}."]}
            )
        placed = already = 0
        for pupil in pupils:
            current = Enrolment.objects.filter(
                student=pupil, academic_year=school_class.academic_year, end_date__isnull=True
            ).first()
            if current and current.school_class_id == school_class.pk:
                already += 1
                continue
            if current:
                current.end_date = data["start_date"]
                current.save(update_fields=["end_date"])
            enrol(pupil, school_class, start_date=data["start_date"], by=request.user)
            placed += 1
        return Response({"placed": placed, "already": already})


class PupilEnrolmentsView(SchoolView):
    def get(self, request, pk):
        places = pupil_of(self.school, pk).enrolments.select_related(
            "school_class", "academic_year"
        )
        return Response(
            [
                {
                    "id": place.pk,
                    "class": place.school_class.name,
                    "year": place.academic_year.name,
                    "start_date": place.start_date,
                    "end_date": place.end_date,
                    "outcome": place.get_outcome_display() if place.outcome else "",
                }
                for place in places.order_by("-start_date", "-pk")
            ]
        )


class EnrolmentOverviewView(SchoolView):
    """Pupils by level and class this year (Phase 1 spec §7.3). Counts only, no names."""

    read_roles = (roles.ADMINISTRATOR, roles.HEAD_TEACHER, roles.PROPRIETOR)

    def get(self, request):
        year = current_year(self.school)
        active = Q(
            enrolments__end_date__isnull=True,
            enrolments__student__status=Student.Status.ACTIVE,
        )
        classes = sorted(
            SchoolClass.objects.for_school(self.school)
            .filter(academic_year=year)
            .annotate(pupils=Count("enrolments", filter=active)),
            key=lambda row: (GROUP_ORDER[row.year_group], row.stream),
        )
        levels = [
            {
                "band": code,
                "label": band.name,
                "count": sum(row.pupils for row in classes if row.band == code),
                "classes": [
                    {"id": row.pk, "name": row.name, "count": row.pupils}
                    for row in classes
                    if row.band == code
                ],
            }
            for code, band in BANDS.items()
            if code in self.school.levels_offered
        ]
        all_active = Student.objects.for_school(self.school).filter(status=Student.Status.ACTIVE)
        placed = all_active.filter(
            enrolments__academic_year=year, enrolments__end_date__isnull=True
        ).distinct()
        return Response(
            {
                "year": year.name if year else None,
                "levels": levels,
                "total": all_active.count(),
                "not_in_class": all_active.exclude(pk__in=placed.values("pk")).count(),
            }
        )
