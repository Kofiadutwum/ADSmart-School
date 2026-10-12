"""Classes and streams, class teachers, subjects and teaching assignments (Phase 1 spec §3.1,
§7.2; SMS spec §7). Every record named in a request must belong to the user's own school."""

import re

from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.response import Response

from apps.academics.models import (
    AcademicYear,
    ClassTeacherAssignment,
    SchoolClass,
    Subject,
    TeachingAssignment,
    Term,
)
from apps.academics.structure import BANDS, YEAR_GROUPS, year_groups_for
from apps.accounts import roles
from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError
from apps.people.models import Staff
from apps.school_admin.calendar_views import term_row
from apps.school_admin.dashboard import current_year
from apps.school_admin.views import SchoolView

TEACHING_ROLES = (roles.TEACHER, roles.CAREGIVER)
GROUP_ORDER = {code: index for index, code in enumerate(YEAR_GROUPS)}


def teachers(school):
    return (
        Staff.objects.for_school(school)
        .filter(user__is_active=True, user__groups__name__in=TEACHING_ROLES)
        .distinct()
        .order_by("first_name", "surname")
    )


def _name(staff: Staff) -> str:
    return f"{staff.first_name} {staff.surname}"


def class_row(school_class: SchoolClass) -> dict:
    rows = school_class.class_teachers.select_related("staff", "term").order_by("term__number")
    pupils = getattr(school_class, "pupils", None)
    if pupils is None:
        pupils = school_class.enrolments.filter(end_date__isnull=True).count()
    return {
        "id": school_class.pk,
        "name": school_class.name,
        "year_group": school_class.year_group,
        "stream": school_class.stream,
        "band": school_class.band,
        "academic_year": school_class.academic_year_id,
        "pupils": pupils,
        "class_teachers": [
            {
                "term_id": row.term_id,
                "term": row.term.number,
                "staff_id": row.staff_id,
                "staff_name": _name(row.staff),
            }
            for row in rows
        ],
    }


def _owned(model, school, pk, field: str):
    """A record of this school, or a field error naming the field that pointed elsewhere."""
    found = model.objects.for_school(school).filter(pk=pk).first()
    if found is None:
        raise serializers.ValidationError({field: ["Choose one from this school."]})
    return found


def _teacher(school, pk) -> Staff:
    staff = teachers(school).filter(pk=pk).first()
    if staff is None:
        raise serializers.ValidationError(
            {"staff": ["Choose a Teacher or Early Years Caregiver of this school."]}
        )
    return staff


class StreamField(serializers.CharField):
    def to_internal_value(self, data):
        value = super().to_internal_value(data).upper()
        if not re.fullmatch(r"[A-Z0-9]{0,2}", value):
            raise serializers.ValidationError("Use up to two letters or numbers, like A.")
        return value


class ClassSerializer(serializers.Serializer):
    academic_year = serializers.IntegerField()
    year_group = serializers.ChoiceField(choices=list(YEAR_GROUPS))
    stream = StreamField(max_length=2, allow_blank=True, default="")


class StreamSerializer(serializers.Serializer):
    stream = StreamField(max_length=2, allow_blank=True)


def _save_class(school_class: SchoolClass) -> None:
    taken = (
        SchoolClass.objects.filter(
            academic_year=school_class.academic_year,
            year_group=school_class.year_group,
            stream=school_class.stream,
        )
        .exclude(pk=school_class.pk)
        .exists()
    )
    if taken:
        raise serializers.ValidationError(
            {"stream": [f"{school_class.name} already exists this year. Give it another stream."]}
        )
    try:
        school_class.save()
    except ValueError as exc:  # a level the school does not teach
        raise serializers.ValidationError({"year_group": [str(exc)]}) from exc


class ClassesView(SchoolView):
    def get(self, request):
        years = AcademicYear.objects.for_school(self.school)
        chosen = request.query_params.get("year")
        year = years.filter(pk=chosen).first() if chosen else current_year(self.school)
        classes = (
            SchoolClass.objects.for_school(self.school)
            .filter(academic_year=year)
            .annotate(pupils=Count("enrolments", filter=Q(enrolments__end_date__isnull=True)))
        )
        classes = sorted(classes, key=lambda row: (GROUP_ORDER[row.year_group], row.stream))
        groups = year_groups_for(self.school.levels_offered)
        staff = teachers(self.school)
        return Response(
            {
                "year": {"id": year.pk, "name": year.name} if year else None,
                "years": [
                    {"id": row.pk, "name": row.name, "is_current": row.is_current} for row in years
                ],
                "classes": [class_row(row) for row in classes],
                "year_groups": [{"code": group.code, "name": group.name} for group in groups],
                "terms": [term_row(term) for term in year.terms.all()] if year else [],
                "teachers": [{"id": row.pk, "name": _name(row)} for row in staff],
            }
        )

    @transaction.atomic
    def post(self, request):
        data = validated(ClassSerializer, request)
        year = _owned(AcademicYear, self.school, data["academic_year"], "academic_year")
        school_class = SchoolClass(
            academic_year=year, year_group=data["year_group"], stream=data["stream"]
        )
        _save_class(school_class)
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=school_class,
            new={"name": school_class.name, "year": year.name},
            request=request,
        )
        return Response(class_row(school_class), status=201)


class ClassDetailView(SchoolView):
    def _class(self, pk) -> SchoolClass:
        return get_object_or_404(SchoolClass.objects.for_school(self.school), pk=pk)

    @transaction.atomic
    def patch(self, request, pk):
        school_class = self._class(pk)
        data = validated(StreamSerializer, request)
        old = school_class.name
        school_class.stream = data["stream"]
        _save_class(school_class)
        if school_class.name != old:
            record(
                AuditLog.Action.UPDATED,
                actor=request.user,
                entity=school_class,
                old={"name": old},
                new={"name": school_class.name},
                request=request,
            )
        return Response(class_row(school_class))

    @transaction.atomic
    def delete(self, request, pk):
        school_class = self._class(pk)
        if school_class.enrolments.exists():
            raise ApiError("in_use", "This class has pupils; move them to another class first.")
        record(
            AuditLog.Action.DELETED,
            actor=request.user,
            entity=school_class,
            old={"name": school_class.name},
            request=request,
        )
        school_class.delete()
        return Response(status=204)


class ClassTeacherSerializer(serializers.Serializer):
    term = serializers.IntegerField()
    staff = serializers.IntegerField(allow_null=True)


class ClassTeacherView(SchoolView):
    @transaction.atomic
    def put(self, request, pk):
        school_class = get_object_or_404(SchoolClass.objects.for_school(self.school), pk=pk)
        data = validated(ClassTeacherSerializer, request)
        term = school_class.academic_year.terms.filter(pk=data["term"]).first()
        if term is None:
            raise serializers.ValidationError({"term": ["Choose a term of this class's year."]})
        where = {"class": school_class.name, "term": term.number}
        current = ClassTeacherAssignment.objects.filter(
            school_class=school_class, term=term
        ).first()
        old = {"staff": _name(current.staff), **where} if current else None
        if data["staff"] is None:
            if current:
                record(
                    AuditLog.Action.DELETED,
                    actor=request.user,
                    entity=current,
                    old=old,
                    request=request,
                )
                current.delete()
            return Response(class_row(school_class))
        staff = _teacher(self.school, data["staff"])
        if current is None:
            current = ClassTeacherAssignment(school_class=school_class, term=term)
        current.staff = staff
        current.save()
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=current,
            old=old,
            new={"staff": _name(staff), **where},
            request=request,
        )
        return Response(class_row(school_class))


def subject_row(subject: Subject) -> dict:
    return {
        "id": subject.pk,
        "name": subject.name,
        "code": subject.code,
        "bands": subject.bands,
        "is_learning_area": subject.is_learning_area,
    }


class SubjectSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80)
    code = serializers.CharField(max_length=10)
    bands = serializers.ListField(child=serializers.ChoiceField(choices=list(BANDS)))
    is_learning_area = serializers.BooleanField(default=False)

    def validate_code(self, value):
        value = value.upper()
        if not re.fullmatch(r"[A-Z0-9]{1,10}", value):
            raise serializers.ValidationError("Use letters and numbers only, like MATH.")
        return value

    def validate_bands(self, value):
        if not value:
            raise serializers.ValidationError("Choose the levels that study it.")
        return [code for code in BANDS if code in value]


def _code_taken(school, code: str, exclude=None) -> None:
    rows = Subject.objects.for_school(school).filter(code=code)
    if exclude is not None:
        rows = rows.exclude(pk=exclude.pk)
    if rows.exists():
        raise serializers.ValidationError({"code": ["Another subject already uses this code."]})


class SubjectsView(SchoolView):
    def get(self, request):
        return Response([subject_row(row) for row in Subject.objects.for_school(self.school)])

    @transaction.atomic
    def post(self, request):
        data = validated(SubjectSerializer, request)
        _code_taken(self.school, data["code"])
        subject = Subject.objects.create(school=self.school, **data)
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=subject,
            new={"name": subject.name, "code": subject.code},
            request=request,
        )
        return Response(subject_row(subject), status=201)


class SubjectDetailView(SchoolView):
    def _subject(self, pk) -> Subject:
        return get_object_or_404(Subject.objects.for_school(self.school), pk=pk)

    @transaction.atomic
    def patch(self, request, pk):
        subject = self._subject(pk)
        serializer = SubjectSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if "code" in data:
            _code_taken(self.school, data["code"], exclude=subject)
        old = {key: getattr(subject, key) for key in data if getattr(subject, key) != data[key]}
        for key, value in data.items():
            setattr(subject, key, value)
        subject.save()
        if old:
            record(
                AuditLog.Action.UPDATED,
                actor=request.user,
                entity=subject,
                old=old,
                new={key: getattr(subject, key) for key in old},
                request=request,
            )
        return Response(subject_row(subject))

    @transaction.atomic
    def delete(self, request, pk):
        subject = self._subject(pk)
        if TeachingAssignment.objects.filter(subject=subject).exists():
            raise ApiError("in_use", "This subject is taught; remove its teaching first.")
        record(
            AuditLog.Action.DELETED,
            actor=request.user,
            entity=subject,
            old={"name": subject.name},
            request=request,
        )
        subject.delete()
        return Response(status=204)


def teaching_row(row: TeachingAssignment) -> dict:
    return {
        "id": row.pk,
        "staff_id": row.staff_id,
        "teacher": _name(row.staff),
        "school_class_id": row.school_class_id,
        "class": row.school_class.name,
        "subject_id": row.subject_id,
        "subject": row.subject.name,
        "term_id": row.term_id,
        "term": row.term.number,
    }


def _described(row: TeachingAssignment) -> dict:
    return {
        "teacher": _name(row.staff),
        "class": row.school_class.name,
        "subject": str(row.subject),
    }


class TeachingSerializer(serializers.Serializer):
    staff = serializers.IntegerField()
    school_class = serializers.IntegerField()
    subject = serializers.IntegerField()
    term = serializers.IntegerField()


class TeachingView(SchoolView):
    def get(self, request):
        rows = TeachingAssignment.objects.for_school(self.school).select_related(
            "staff", "school_class", "subject", "term"
        )
        term = request.query_params.get("term")
        if term:
            rows = rows.filter(term_id=term)
        else:
            rows = rows.filter(school_class__academic_year=current_year(self.school))
        rows = sorted(
            rows,
            key=lambda row: (
                row.term.number,
                GROUP_ORDER[row.school_class.year_group],
                row.school_class.stream,
                row.subject.name,
            ),
        )
        return Response([teaching_row(row) for row in rows])

    @transaction.atomic
    def post(self, request):
        data = validated(TeachingSerializer, request)
        row = TeachingAssignment(
            staff=_teacher(self.school, data["staff"]),
            school_class=_owned(SchoolClass, self.school, data["school_class"], "school_class"),
            subject=_owned(Subject, self.school, data["subject"], "subject"),
            term=_owned(Term, self.school, data["term"], "term"),
        )
        if row.term.academic_year_id != row.school_class.academic_year_id:
            raise serializers.ValidationError({"term": ["Choose a term of this class's year."]})
        if row.school_class.band not in row.subject.bands:
            raise serializers.ValidationError(
                {"subject": [f"{row.subject} is not studied in {row.school_class}."]}
            )
        try:
            with transaction.atomic():
                row.save()
        except IntegrityError as exc:
            raise ApiError(
                "already_assigned",
                "This teacher already teaches that subject to this class this term.",
            ) from exc
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=row,
            new=_described(row),
            request=request,
        )
        return Response(teaching_row(row), status=201)


class TeachingDetailView(SchoolView):
    @transaction.atomic
    def delete(self, request, pk):
        rows = TeachingAssignment.objects.for_school(self.school)
        row = get_object_or_404(rows.select_related("staff", "school_class", "subject"), pk=pk)
        record(
            AuditLog.Action.DELETED,
            actor=request.user,
            entity=row,
            old=_described(row),
            request=request,
        )
        row.delete()
        return Response(status=204)
