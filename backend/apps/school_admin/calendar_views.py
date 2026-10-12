"""School years, terms and the calendar (Phase 1 spec §3.1, §7.2). Creating a term fills its
weekdays; the Administrator then edits single days, and every change is audited."""

import calendar
import re
from datetime import date

from django.db import transaction
from django.db.models import Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.response import Response

from apps.academics.calendar import create_term
from apps.academics.models import (
    AcademicYear,
    CalendarDay,
    ClassTeacherAssignment,
    TeachingAssignment,
    Term,
)
from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError
from apps.school_admin.views import SchoolView

YEAR_NAME = re.compile(r"^\d{4}/\d{4}$")
TAKEN = "That year is already set up."


def term_row(term: Term) -> dict:
    return {
        "id": term.pk,
        "number": term.number,
        "name": str(term),
        "start_date": term.start_date,
        "end_date": term.end_date,
    }


def year_row(year: AcademicYear) -> dict:
    return {
        "id": year.pk,
        "name": year.name,
        "start_date": year.start_date,
        "end_date": year.end_date,
        "is_current": year.is_current,
        "terms": [term_row(term) for term in year.terms.all()],
    }


class YearSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=9)
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    is_current = serializers.BooleanField(default=False)

    def validate_name(self, value):
        if not YEAR_NAME.match(value):
            raise serializers.ValidationError("Write the year like 2026/2027.")
        return value

    def validate(self, data):
        start = data.get("start_date", getattr(self.instance, "start_date", None))
        end = data.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and start >= end:
            raise serializers.ValidationError({"end_date": "The year must end after it starts."})
        return data


class YearsView(SchoolView):
    def get(self, request):
        years = AcademicYear.objects.for_school(self.school).prefetch_related("terms")
        return Response([year_row(year) for year in years])

    @transaction.atomic
    def post(self, request):
        data = validated(YearSerializer, request)
        years = AcademicYear.objects.for_school(self.school)
        if years.filter(name=data["name"]).exists():
            raise serializers.ValidationError({"name": [TAKEN]})
        if data["is_current"]:
            years.update(is_current=False)
        year = AcademicYear.objects.create(school=self.school, **data)
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=year,
            new={"name": year.name},
            request=request,
        )
        return Response(year_row(year), status=201)


class YearDetailView(SchoolView):
    def _year(self, pk) -> AcademicYear:
        return get_object_or_404(AcademicYear.objects.for_school(self.school), pk=pk)

    @transaction.atomic
    def patch(self, request, pk):
        year = self._year(pk)
        serializer = YearSerializer(year, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        others = AcademicYear.objects.for_school(self.school).exclude(pk=year.pk)
        if others.filter(name=data.get("name", year.name)).exists():
            raise serializers.ValidationError({"name": [TAKEN]})
        start, end = data.get("start_date", year.start_date), data.get("end_date", year.end_date)
        if year.terms.filter(Q(start_date__lt=start) | Q(end_date__gt=end)).exists():
            raise serializers.ValidationError(
                {"start_date": ["Every term must stay inside the year. Change the terms first."]}
            )
        old = {key: str(getattr(year, key)) for key in data if getattr(year, key) != data[key]}
        for key, value in data.items():
            setattr(year, key, value)
        if data.get("is_current"):
            others.update(is_current=False)
        year.save()
        if old:
            record(
                AuditLog.Action.UPDATED,
                actor=request.user,
                entity=year,
                old=old,
                new={key: str(getattr(year, key)) for key in old},
                request=request,
            )
        return Response(year_row(year))

    @transaction.atomic
    def delete(self, request, pk):
        year = self._year(pk)
        if year.classes.exists():
            raise ApiError("in_use", "This year has classes; remove them first.")
        record(
            AuditLog.Action.DELETED,
            actor=request.user,
            entity=year,
            old={"name": year.name},
            request=request,
        )
        year.delete()
        return Response(status=204)


class TermSerializer(serializers.Serializer):
    number = serializers.IntegerField(min_value=1, max_value=3)
    start_date = serializers.DateField()
    end_date = serializers.DateField()

    def validate(self, data):
        if data["start_date"] >= data["end_date"]:
            raise serializers.ValidationError({"end_date": "The term must end after it starts."})
        return data


class TermsView(SchoolView):
    @transaction.atomic
    def post(self, request, pk):
        year = get_object_or_404(AcademicYear.objects.for_school(self.school), pk=pk)
        data = validated(TermSerializer, request)
        number, start, end = data["number"], data["start_date"], data["end_date"]
        if year.terms.filter(number=number).exists():
            raise serializers.ValidationError({"number": [f"Term {number} is already set up."]})
        overlap = (
            Term.objects.for_school(self.school)
            .filter(start_date__lte=end, end_date__gte=start)
            .select_related("academic_year")
            .first()
        )
        if overlap:
            raise serializers.ValidationError({"start_date": [f"These dates overlap {overlap}."]})
        try:
            term = create_term(year, number, start, end, by=request.user)
        except ValueError as exc:
            raise serializers.ValidationError({"start_date": [str(exc)]}) from exc
        return Response(term_row(term), status=201)


class TermDetailView(SchoolView):
    @transaction.atomic
    def delete(self, request, pk):
        term = get_object_or_404(Term.objects.for_school(self.school), pk=pk)
        used = (
            ClassTeacherAssignment.objects.filter(term=term).exists()
            or TeachingAssignment.objects.filter(term=term).exists()
        )
        if used:
            raise ApiError("in_use", "Teachers are assigned in this term; remove them first.")
        record(
            AuditLog.Action.DELETED,
            actor=request.user,
            entity=term,
            old={"name": str(term)},
            request=request,
        )
        term.delete()
        return Response(status=204)


def day_row(day: CalendarDay) -> dict:
    return {"date": day.date, "type": day.type, "note": day.note}


def _month(value: str) -> tuple[date, date]:
    match = re.fullmatch(r"(\d{4})-(\d{2})", value)
    if not match or not 1 <= int(match[2]) <= 12:
        raise ApiError("bad_month", "Choose a month like 2026-10.")
    year, month = int(match[1]), int(match[2])
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


class CalendarView(SchoolView):
    def get(self, request):
        value = request.query_params.get("month") or date.today().strftime("%Y-%m")
        first, last = _month(value)
        days = CalendarDay.objects.for_school(self.school).filter(date__range=(first, last))
        terms = Term.objects.for_school(self.school).filter(
            start_date__lte=last, end_date__gte=first
        )
        return Response(
            {
                "month": value,
                "days": [day_row(day) for day in days.order_by("date")],
                "terms": [term_row(term) for term in terms.select_related("academic_year")],
            }
        )


class DaySerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=CalendarDay.Type.choices)
    note = serializers.CharField(max_length=120, allow_blank=True, default="")


def _day(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise Http404 from exc


class CalendarDayView(SchoolView):
    @transaction.atomic
    def put(self, request, day):
        when = _day(day)
        data = validated(DaySerializer, request)
        term = (
            Term.objects.for_school(self.school)
            .filter(start_date__lte=when, end_date__gte=when)
            .first()
        )
        if term is None:
            raise ApiError("outside_term", "That day is outside every term. Add the term first.")
        row = CalendarDay.objects.for_school(self.school).filter(date=when).first()
        old = {"type": row.type, "note": row.note} if row else None
        if row is None:
            row = CalendarDay(school=self.school, date=when, term=term)
        row.term, row.type, row.note = term, data["type"], data["note"]
        row.save()
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=row,
            old=old,
            new={"date": when.isoformat(), "type": row.type, "note": row.note},
            request=request,
        )
        return Response(day_row(row))

    @transaction.atomic
    def delete(self, request, day):
        row = CalendarDay.objects.for_school(self.school).filter(date=_day(day)).first()
        if row:
            record(
                AuditLog.Action.DELETED,
                actor=request.user,
                entity=row,
                old={"date": row.date.isoformat(), "type": row.type, "note": row.note},
                request=request,
            )
            row.delete()
        return Response(status=204)
