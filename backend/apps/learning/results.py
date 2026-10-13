"""Assessment and report cards (SMS spec §7–§9): grading scales, components and rules set per
level and year, marks entered by the subject teacher, a submit → review → approve → publish
workflow, changes after approval only with a reason, positions where the level allows them,
descriptive results for younger pupils, and report cards that may be withheld for arrears with
the Head Teacher's override."""

from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response

from apps.academics.models import Subject, TeachingAssignment, Term
from apps.academics.structure import BANDS, DESCRIPTIVE
from apps.accounts import roles
from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError
from apps.core.resources import Resource
from apps.finance.services import balance
from apps.learning.attendance import attendance_summary
from apps.learning.models import (
    AssessmentComponent,
    DescriptiveResult,
    GradingScale,
    Mark,
    ReportCardEntry,
    ReportRelease,
    ReportSettings,
    ResultChange,
    ResultRules,
    ResultSheet,
)
from apps.people.models import Staff, Student
from apps.school_admin.class_lists import class_access, class_teacher_name, pupils_in
from apps.school_admin.views import SchoolView

LEADERS = (roles.ADMINISTRATOR, roles.HEAD_TEACHER)
TEACHERS = (roles.TEACHER, roles.CAREGIVER)


class ConfigResource(Resource):
    read_roles = (*LEADERS, *TEACHERS)
    write_roles = LEADERS

    @classmethod
    def validate(cls, view, data, instance=None):
        if "band" in data and data["band"] not in BANDS:
            raise serializers.ValidationError({"band": ["Choose a level."]})
        return data


class ScaleResource(ConfigResource):
    model = GradingScale
    fields = ("band", "academic_year", "rows")
    labels = ("academic_year",)
    filters = {"band": "band", "year": "academic_year_id"}

    @classmethod
    def validate(cls, view, data, instance=None):
        rows = data.get("rows")
        if rows is not None:
            try:
                ok = all(
                    float(row["min"]) <= float(row["max"]) and str(row["grade"]).strip()
                    for row in rows
                ) and bool(rows)
            except KeyError, TypeError, ValueError:
                ok = False
            if not ok:
                raise serializers.ValidationError(
                    {"rows": ["Each row needs a lowest mark, a highest mark and a grade."]}
                )
        return super().validate(view, data, instance)


class ComponentResource(ConfigResource):
    model = AssessmentComponent
    fields = ("band", "academic_year", "name", "weight", "max_score", "order")
    labels = ("academic_year",)
    filters = {"band": "band", "year": "academic_year_id"}


class RulesResource(ConfigResource):
    model = ResultRules
    fields = ("band", "academic_year", "pass_mark", "positions_enabled", "tie_rule")
    labels = ("academic_year",)
    filters = {"band": "band", "year": "academic_year_id"}

    @classmethod
    def validate(cls, view, data, instance=None):
        band = data.get("band", getattr(instance, "band", ""))
        if data.get("positions_enabled") and band in BANDS and not BANDS[band].positions_allowed:
            raise serializers.ValidationError(
                {"positions_enabled": ["Positions aren't used at this level."]}
            )
        return super().validate(view, data, instance)


def components_for(school_class) -> list[AssessmentComponent]:
    return list(
        AssessmentComponent.objects.filter(
            school=school_class.school,
            band=school_class.band,
            academic_year=school_class.academic_year,
        )
    )


def rules_for(school_class) -> ResultRules:
    return ResultRules.objects.filter(
        school=school_class.school, band=school_class.band, academic_year=school_class.academic_year
    ).first() or ResultRules(
        pass_mark=50, positions_enabled=False, tie_rule=ResultRules.TieRule.SHARED
    )


def grade_for(total, school_class) -> tuple[str, str]:
    scale = GradingScale.objects.filter(
        school=school_class.school, band=school_class.band, academic_year=school_class.academic_year
    ).first()
    for row in scale.rows if scale else []:
        if Decimal(str(row["min"])) <= total <= Decimal(str(row["max"])):
            return str(row["grade"]), str(row.get("remark", ""))
    return "", ""


def rank(values: dict[int, Decimal], tie_rule: str) -> dict[int, int]:
    """Positions by value, highest first; ties share a position (1, 1, 3 or 1, 1, 2)."""
    ordered = sorted(values.items(), key=lambda item: -item[1])
    positions, last, position, distinct = {}, None, 0, 0
    for index, (key, value) in enumerate(ordered, start=1):
        if value != last:
            distinct += 1
            position = index if tie_rule == ResultRules.TieRule.SHARED else distinct
            last = value
        positions[key] = position
    return positions


def subject_totals(school_class, subject, term, pupils) -> dict[int, Decimal]:
    components = components_for(school_class)
    marks: dict[int, Decimal] = {}
    for mark in Mark.objects.filter(
        subject=subject, term=term, student__in=pupils, component__in=components
    ).select_related("component"):
        share = Decimal(mark.score) / mark.component.max_score * mark.component.weight
        marks[mark.student_id] = marks.get(mark.student_id, Decimal(0)) + share
    return {pk: round(value, 1) for pk, value in marks.items()}


def class_results(school_class, term, published_only: bool = False) -> dict:
    """Every pupil's subject totals, grades and positions for a term."""
    pupils = list(pupils_in(school_class).order_by("surname", "first_name"))
    rules = rules_for(school_class)
    positions_on = rules.positions_enabled and BANDS[school_class.band].positions_allowed
    sheets = {
        s.subject_id: s for s in ResultSheet.objects.filter(school_class=school_class, term=term)
    }
    subjects = [
        sheets[pk].subject
        for pk in sheets
        if not published_only or sheets[pk].status == ResultSheet.Status.PUBLISHED
    ]
    table = {
        p.pk: {"student": p.pk, "name": f"{p.first_name} {p.surname}", "subjects": {}}
        for p in pupils
    }
    for subject in subjects:
        totals = subject_totals(school_class, subject, term, pupils)
        places = rank(totals, rules.tie_rule) if positions_on else {}
        for pk, total in totals.items():
            grade, remark = grade_for(total, school_class)
            table[pk]["subjects"][subject.name] = {
                "total": total,
                "grade": grade,
                "remark": remark,
                "passed": total >= rules.pass_mark,
                "position": places.get(pk),
            }
    averages = {}
    for pk, row in table.items():
        totals = [s["total"] for s in row["subjects"].values()]
        row["average"] = round(sum(totals) / len(totals), 1) if totals else None
        if totals:
            averages[pk] = row["average"]
    overall = rank(averages, rules.tie_rule) if positions_on else {}
    for pk, row in table.items():
        row["position"] = overall.get(pk)
    return {
        "class": school_class.name,
        "term": str(term),
        "positions": positions_on,
        "class_size": len(pupils),
        "subjects": [s.name for s in subjects],
        "pupils": list(table.values()),
    }


def may_enter(user, school_class, subject, term) -> bool:
    if roles.has_role(user, *LEADERS):
        return True
    staff = Staff.objects.filter(user=user).first()
    return (
        bool(staff)
        and TeachingAssignment.objects.filter(
            staff=staff, school_class=school_class, subject=subject, term=term
        ).exists()
    )


class SheetMixin:
    def context(self, class_pk, subject_pk, term_pk):
        school_class, _, _ = class_access(self.request, self.school, class_pk)
        subject = get_object_or_404(Subject.objects.for_school(self.school), pk=subject_pk)
        term = get_object_or_404(Term.objects.for_school(self.school), pk=term_pk)
        if not may_enter(self.request.user, school_class, subject, term):
            raise ApiError("not_your_subject", "You don't teach this subject in this class.", 403)
        sheet, _ = ResultSheet.objects.get_or_create(
            school=self.school, school_class=school_class, subject=subject, term=term
        )
        return school_class, subject, term, sheet


def sheet_row(sheet: ResultSheet) -> dict:
    return {
        "id": sheet.pk,
        "class": sheet.school_class.name,
        "subject": sheet.subject.name,
        "term": str(sheet.term),
        "status": sheet.status,
        "published_at": sheet.published_at,
    }


class MarkSerializer(serializers.Serializer):
    student = serializers.IntegerField()
    component = serializers.IntegerField()
    score = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=Decimal(0))


class MarksSerializer(serializers.Serializer):
    school_class = serializers.IntegerField()
    subject = serializers.IntegerField()
    term = serializers.IntegerField()
    marks = MarkSerializer(many=True)
    reason = serializers.CharField(max_length=300, required=False, default="", allow_blank=True)


class MarksView(SheetMixin, SchoolView):
    read_roles = write_roles = (*LEADERS, *TEACHERS)

    def get(self, request):
        params = request.query_params
        school_class, subject, term, sheet = self.context(
            params.get("class"), params.get("subject"), params.get("term")
        )
        style = BANDS[school_class.band].assessment_style
        pupils = (
            pupils_in(school_class)
            .filter(status=Student.Status.ACTIVE)
            .order_by("surname", "first_name")
        )
        components = components_for(school_class)
        marks = {
            (m.student_id, m.component_id): m.score
            for m in Mark.objects.filter(subject=subject, term=term, student__in=pupils)
        }
        descriptive = {
            d.student_id: {"level": d.level, "comment": d.comment}
            for d in DescriptiveResult.objects.filter(
                subject=subject, term=term, student__in=pupils
            )
        }
        return Response(
            {
                "sheet": sheet_row(sheet),
                "style": style,
                "components": [
                    {"id": c.pk, "name": c.name, "weight": c.weight, "max_score": c.max_score}
                    for c in components
                ],
                "pupils": [
                    {
                        "student": p.pk,
                        "name": f"{p.first_name} {p.surname}",
                        "marks": {str(c.pk): marks.get((p.pk, c.pk)) for c in components},
                        "descriptive": descriptive.get(p.pk),
                    }
                    for p in pupils
                ],
            }
        )

    @transaction.atomic
    def post(self, request):
        data = validated(MarksSerializer, request)
        school_class, subject, term, sheet = self.context(
            data["school_class"], data["subject"], data["term"]
        )
        locked = sheet.status != ResultSheet.Status.DRAFT
        if locked:
            if sheet.status == ResultSheet.Status.SUBMITTED or not roles.has_role(
                request.user, roles.HEAD_TEACHER
            ):
                raise ApiError(
                    "locked", "These marks are with the Head Teacher. Ask for them to be returned."
                )
            if not data["reason"]:
                raise serializers.ValidationError(
                    {"reason": ["Say why approved marks are changing."]}
                )
        components = {c.pk: c for c in components_for(school_class)}
        members = set(pupils_in(school_class).values_list("pk", flat=True))
        for item in data["marks"]:
            component = components.get(item["component"])
            if component is None or item["student"] not in members:
                raise serializers.ValidationError(
                    {"marks": ["Each mark must be for a pupil and a part of this class."]}
                )
            if item["score"] > component.max_score:
                raise serializers.ValidationError(
                    {"marks": [f"{component.name} is out of {component.max_score}."]}
                )
            existing = Mark.objects.filter(
                student_id=item["student"], subject=subject, term=term, component=component
            ).first()
            if locked and (existing is None or existing.score != item["score"]):
                ResultChange.objects.create(
                    school=self.school,
                    sheet=sheet,
                    student_id=item["student"],
                    component=component,
                    old_score=existing.score if existing else None,
                    new_score=item["score"],
                    reason=data["reason"],
                    changed_by=request.user,
                )
            Mark.objects.update_or_create(
                school=self.school,
                student_id=item["student"],
                subject=subject,
                term=term,
                component=component,
                defaults={"score": item["score"], "entered_by": request.user},
            )
        return Response({"saved": len(data["marks"])})


class DescriptiveItemSerializer(serializers.Serializer):
    student = serializers.IntegerField()
    level = serializers.ChoiceField(choices=DescriptiveResult.Level.choices)
    comment = serializers.CharField(max_length=300, required=False, default="", allow_blank=True)


class DescriptiveSerializer(serializers.Serializer):
    school_class = serializers.IntegerField()
    subject = serializers.IntegerField()
    term = serializers.IntegerField()
    results = DescriptiveItemSerializer(many=True)


class DescriptiveView(SheetMixin, SchoolView):
    read_roles = write_roles = (*LEADERS, *TEACHERS)

    @transaction.atomic
    def post(self, request):
        data = validated(DescriptiveSerializer, request)
        school_class, subject, term, sheet = self.context(
            data["school_class"], data["subject"], data["term"]
        )
        if BANDS[school_class.band].assessment_style != DESCRIPTIVE:
            raise ApiError("scored_level", "This level is marked with scores.")
        if sheet.status != ResultSheet.Status.DRAFT:
            raise ApiError("locked", "These results are with the Head Teacher.")
        members = set(pupils_in(school_class).values_list("pk", flat=True))
        for item in data["results"]:
            if item["student"] not in members:
                raise serializers.ValidationError(
                    {"results": ["Each pupil must be in this class."]}
                )
            DescriptiveResult.objects.update_or_create(
                school=self.school,
                student_id=item["student"],
                subject=subject,
                term=term,
                defaults={"level": item["level"], "comment": item["comment"]},
            )
        return Response({"saved": len(data["results"])})


FLOW = {
    "submit": ((ResultSheet.Status.DRAFT,), ResultSheet.Status.SUBMITTED, (*LEADERS, *TEACHERS)),
    "review": ((ResultSheet.Status.SUBMITTED,), ResultSheet.Status.REVIEWED, LEADERS),
    "approve": (
        (ResultSheet.Status.SUBMITTED, ResultSheet.Status.REVIEWED),
        ResultSheet.Status.APPROVED,
        (roles.HEAD_TEACHER,),
    ),
    "return": (
        (ResultSheet.Status.SUBMITTED, ResultSheet.Status.REVIEWED),
        ResultSheet.Status.DRAFT,
        LEADERS,
    ),
    "publish": (
        (ResultSheet.Status.APPROVED,),
        ResultSheet.Status.PUBLISHED,
        (roles.HEAD_TEACHER,),
    ),
}


class SheetsView(SchoolView):
    read_roles = (*LEADERS, *TEACHERS)

    def get(self, request):
        sheets = ResultSheet.objects.for_school(self.school).select_related(
            "school_class", "subject", "term"
        )
        params = request.query_params
        if params.get("term"):
            sheets = sheets.filter(term_id=params["term"])
        if params.get("status") in ResultSheet.Status.values:
            sheets = sheets.filter(status=params["status"])
        if params.get("class"):
            sheets = sheets.filter(school_class_id=params["class"])
        if not roles.has_role(request.user, *LEADERS):
            sheets = sheets.filter(school_class__teaching__staff__user=request.user).distinct()
        return Response([sheet_row(sheet) for sheet in sheets[:500]])


class SheetActionView(SchoolView):
    read_roles = write_roles = (*LEADERS, *TEACHERS)

    @transaction.atomic
    def post(self, request, pk, action):
        sheet = get_object_or_404(
            ResultSheet.objects.for_school(self.school).select_for_update(), pk=pk
        )
        allowed_from, to, who = FLOW[action]
        if not roles.has_role(request.user, *who):
            raise ApiError("permission_denied", "Your role doesn't include this step.", 403)
        if action == "submit" and not may_enter(
            request.user, sheet.school_class, sheet.subject, sheet.term
        ):
            raise ApiError("not_your_subject", "You don't teach this subject in this class.", 403)
        if sheet.status not in allowed_from:
            raise ApiError("wrong_step", f"These results are {sheet.get_status_display().lower()}.")
        sheet.status = to
        stamp = {"submit": "submitted_by", "review": "reviewed_by", "approve": "approved_by"}.get(
            action
        )
        if stamp:
            setattr(sheet, stamp, request.user)
        if action == "publish":
            sheet.published_at = timezone.now()
        sheet.save()
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=sheet,
            new={"status": to},
            request=request,
        )
        return Response(sheet_row(sheet))


class ChangesView(SchoolView):
    read_roles = LEADERS

    def get(self, request, pk):
        sheet = get_object_or_404(ResultSheet.objects.for_school(self.school), pk=pk)
        return Response(
            [
                {
                    "student": str(c.student),
                    "component": c.component.name,
                    "old": c.old_score,
                    "new": c.new_score,
                    "reason": c.reason,
                    "by": str(c.changed_by),
                    "at": c.created_at,
                }
                for c in sheet.changes.select_related("student", "component", "changed_by")
            ]
        )


class ClassResultsView(SchoolView):
    read_roles = (*LEADERS, *TEACHERS)

    def get(self, request, pk):
        school_class, _, _ = class_access(request, self.school, pk)
        term = get_object_or_404(
            Term.objects.for_school(self.school), pk=request.query_params.get("term") or 0
        )
        return Response(class_results(school_class, term))


def withheld(pupil, term) -> bool:
    settings = ReportSettings.objects.filter(school=pupil.school).first()
    if not settings or not settings.withhold_for_arrears or balance(pupil) <= 0:
        return False
    return not ReportRelease.objects.filter(student=pupil, term=term).exists()


def report_card(pupil: Student, term: Term, *, for_family: bool) -> dict:
    """One pupil's report card; families see published results only, and none while withheld."""
    enrolment = (
        pupil.enrolments.filter(school_class__academic_year=term.academic_year)
        .select_related("school_class")
        .first()
    )
    school_class = enrolment.school_class if enrolment else None
    base = {
        "school": {
            "name": pupil.school.name,
            "phone": pupil.school.phone,
            "email": pupil.school.email,
        },
        "pupil": {
            "id": pupil.pk,
            "name": f"{pupil.first_name} {pupil.surname}",
            "student_id": pupil.student_id,
        },
        "class": school_class.name if school_class else "",
        "term": str(term),
        "withheld": for_family and withheld(pupil, term),
    }
    if base["withheld"] or school_class is None:
        return {**base, "subjects": {}, "descriptive": [], "attendance": None, "remarks": None}
    results = class_results(school_class, term, published_only=for_family)
    mine = next(
        (row for row in results["pupils"] if row["student"] == pupil.pk),
        {"subjects": {}, "average": None, "position": None},
    )
    descriptive = DescriptiveResult.objects.filter(student=pupil, term=term).select_related(
        "subject"
    )
    if for_family:
        published = ResultSheet.objects.filter(
            school_class=school_class, term=term, status=ResultSheet.Status.PUBLISHED
        ).values_list("subject_id", flat=True)
        descriptive = descriptive.filter(subject_id__in=list(published))
    entry = ReportCardEntry.objects.filter(student=pupil, term=term).first()
    attendance = attendance_summary(pupil, term.start_date)
    return {
        **base,
        "style": BANDS[school_class.band].assessment_style,
        "class_teacher": class_teacher_name(school_class),
        "class_size": results["class_size"],
        "positions": results["positions"],
        "subjects": mine["subjects"],
        "average": mine["average"],
        "position": mine["position"],
        "descriptive": [
            {"subject": d.subject.name, "level": d.get_level_display(), "comment": d.comment}
            for d in descriptive
        ],
        "attendance": {k: attendance[k] for k in ("days", "present", "late", "absent", "rate")},
        "remarks": {
            "conduct": entry.conduct,
            "interest": entry.interest,
            "class_teacher": entry.class_teacher_remark,
            "head_teacher": entry.head_teacher_remark,
            "promotion": entry.promotion,
            "reopening_date": entry.reopening_date,
        }
        if entry
        else None,
    }


class ReportCardView(SchoolView):
    read_roles = (*LEADERS, *TEACHERS)

    def get(self, request, pk):
        pupil = get_object_or_404(Student.objects.for_school(self.school), pk=pk)
        term = get_object_or_404(
            Term.objects.for_school(self.school), pk=request.query_params.get("term") or 0
        )
        return Response(
            {
                **report_card(pupil, term, for_family=False),
                "would_be_withheld": withheld(pupil, term),
            }
        )


class RemarksSerializer(serializers.Serializer):
    term = serializers.IntegerField()
    conduct = serializers.CharField(max_length=120, required=False, allow_blank=True)
    interest = serializers.CharField(max_length=120, required=False, allow_blank=True)
    class_teacher_remark = serializers.CharField(max_length=300, required=False, allow_blank=True)
    head_teacher_remark = serializers.CharField(max_length=300, required=False, allow_blank=True)
    promotion = serializers.CharField(max_length=120, required=False, allow_blank=True)
    reopening_date = serializers.DateField(required=False, allow_null=True)


class RemarksView(SchoolView):
    """The class teacher writes the class remarks; only the Head Teacher writes theirs."""

    read_roles = write_roles = (*LEADERS, *TEACHERS)

    @transaction.atomic
    def put(self, request, pk):
        pupil = get_object_or_404(Student.objects.for_school(self.school), pk=pk)
        data = validated(RemarksSerializer, request)
        term = get_object_or_404(Term.objects.for_school(self.school), pk=data.pop("term"))
        head = roles.has_role(request.user, roles.HEAD_TEACHER)
        if "head_teacher_remark" in data and not head:
            raise ApiError(
                "head_only", "Only the Head Teacher writes the head teacher's remark.", 403
            )
        if not roles.has_role(request.user, *LEADERS):
            enrolment = pupil.enrolments.filter(end_date__isnull=True).first()
            if enrolment is None:
                raise ApiError("no_class", "This pupil isn't in a class.")
            _, class_teacher, _ = class_access(request, self.school, enrolment.school_class_id)
            if not class_teacher:
                raise ApiError(
                    "not_class_teacher", "Only the class teacher writes these remarks.", 403
                )
        entry, _ = ReportCardEntry.objects.get_or_create(
            school=self.school, student=pupil, term=term
        )
        for key, value in data.items():
            setattr(entry, key, value)
        entry.save()
        return Response(report_card(pupil, term, for_family=False))


class ReportSettingsView(SchoolView):
    read_roles = LEADERS
    write_roles = (roles.HEAD_TEACHER, roles.ADMINISTRATOR)

    def get(self, request):
        settings, _ = ReportSettings.objects.get_or_create(school=self.school)
        return Response({"withhold_for_arrears": settings.withhold_for_arrears})

    def patch(self, request):
        settings, _ = ReportSettings.objects.get_or_create(school=self.school)
        settings.withhold_for_arrears = bool(request.data.get("withhold_for_arrears"))
        settings.save()
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=settings,
            new={"withhold": settings.withhold_for_arrears},
            request=request,
        )
        return self.get(request)


class ReleaseSerializer(serializers.Serializer):
    term = serializers.IntegerField()
    reason = serializers.CharField(max_length=300)


class ReportReleaseView(SchoolView):
    """The Head Teacher releases a withheld report card, with a reason."""

    read_roles = write_roles = (roles.HEAD_TEACHER,)

    @transaction.atomic
    def post(self, request, pk):
        pupil = get_object_or_404(Student.objects.for_school(self.school), pk=pk)
        data = validated(ReleaseSerializer, request)
        term = get_object_or_404(Term.objects.for_school(self.school), pk=data["term"])
        release = ReportRelease.objects.create(
            school=self.school,
            student=pupil,
            term=term,
            released_by=request.user,
            reason=data["reason"],
        )
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=release,
            new={"reason": data["reason"]},
            request=request,
        )
        return Response({"released": True}, status=201)
