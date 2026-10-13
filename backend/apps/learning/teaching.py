"""Teaching (SMS spec §19–§21): lesson notes reviewed by the Head Teacher, the timetable with
clash checks, cover for absent teachers, and learning resources shared with classes."""

from django.db import transaction
from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.academics.models import SchoolClass, Term
from apps.accounts import roles
from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError
from apps.core.resources import Resource
from apps.learning.attendance import own_staff
from apps.learning.models import (
    Cover,
    LearningResource,
    LeaveRequest,
    LessonNote,
    LessonNoteTemplate,
    Period,
    StaffAttendance,
    TimetableSlot,
)
from apps.people.models import Staff
from apps.people.services import STAFF_ROLES
from apps.school_admin.views import SchoolView

LEADERS = (roles.ADMINISTRATOR, roles.HEAD_TEACHER)
TEACHERS = (roles.TEACHER, roles.CAREGIVER)
RESOURCE_TYPES = {
    ".pdf",
    ".doc",
    ".docx",
    ".ppt",
    ".pptx",
    ".xls",
    ".xlsx",
    ".jpg",
    ".jpeg",
    ".png",
    ".txt",
}


class TemplateResource(Resource):
    model = LessonNoteTemplate
    fields = ("name", "bands", "sections")
    read_roles = (*LEADERS, *TEACHERS)
    write_roles = LEADERS

    @classmethod
    def validate(cls, view, data, instance=None):
        sections = data.get("sections")
        if sections is not None and (
            not isinstance(sections, list)
            or not all(isinstance(s, str) and s.strip() for s in sections)
        ):
            raise serializers.ValidationError({"sections": ["List the section headings."]})
        return data


class LessonNoteResource(Resource):
    """Teachers write their own notes; leaders read them all and review them."""

    model = LessonNote
    fields = ("school_class", "subject", "week_start", "template", "content")
    shown = ("status", "review_comment", "updated_at")
    labels = ("staff", "school_class", "subject")
    read_roles = (*LEADERS, *TEACHERS)
    write_roles = TEACHERS
    filters = {"status": "status", "class": "school_class_id", "week": "week_start"}
    ordering = ("-week_start", "-id")

    @classmethod
    def scope(cls, view, rows):
        if roles.has_role(view.request.user, *LEADERS):
            return rows
        return rows.filter(staff__user=view.request.user)

    @classmethod
    def validate(cls, view, data, instance=None):
        if instance is not None and instance.status not in (
            LessonNote.Status.DRAFT,
            LessonNote.Status.RETURNED,
        ):
            raise ApiError("locked", "A submitted note can't change until it is returned.")
        if not isinstance(data.get("content", {}), dict):
            raise serializers.ValidationError({"content": ["Fill in the note's sections."]})
        if instance is None:
            data["staff"] = own_staff(view.request.user)
        return data


class NoteSubmitView(SchoolView):
    read_roles = write_roles = TEACHERS

    @transaction.atomic
    def post(self, request, pk):
        note = get_object_or_404(
            LessonNote.objects.for_school(self.school), pk=pk, staff__user=request.user
        )
        if note.status not in (LessonNote.Status.DRAFT, LessonNote.Status.RETURNED):
            raise ApiError("submitted", "This note has already been submitted.")
        note.status = LessonNote.Status.SUBMITTED
        note.save(update_fields=["status", "updated_at"])
        return Response(LessonNoteResource.row(self, note))


class ReviewSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[LessonNote.Status.RETURNED, LessonNote.Status.REVIEWED, LessonNote.Status.APPROVED]
    )
    comment = serializers.CharField(max_length=500, required=False, default="", allow_blank=True)


class NoteReviewView(SchoolView):
    read_roles = write_roles = LEADERS

    @transaction.atomic
    def post(self, request, pk):
        note = get_object_or_404(LessonNote.objects.for_school(self.school), pk=pk)
        if note.status == LessonNote.Status.DRAFT:
            raise ApiError("draft", "This note hasn't been submitted yet.")
        data = validated(ReviewSerializer, request)
        if data["status"] == LessonNote.Status.RETURNED and not data["comment"]:
            raise serializers.ValidationError({"comment": ["Say what needs changing."]})
        note.status, note.review_comment, note.reviewed_by = (
            data["status"],
            data["comment"],
            request.user,
        )
        note.save()
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=note,
            new={"status": note.status},
            request=request,
        )
        return Response(LessonNoteResource.row(self, note))


class PeriodResource(Resource):
    model = Period
    fields = ("name", "start_time", "end_time", "order")
    read_roles = tuple(STAFF_ROLES)
    write_roles = LEADERS

    @classmethod
    def validate(cls, view, data, instance=None):
        start = data.get("start_time", getattr(instance, "start_time", None))
        end = data.get("end_time", getattr(instance, "end_time", None))
        if start and end and end <= start:
            raise serializers.ValidationError(
                {"end_time": ["The period must end after it starts."]}
            )
        return data


class SlotResource(Resource):
    """One lesson in the week. A teacher can't be in two classes at once."""

    model = TimetableSlot
    fields = ("term", "school_class", "day", "period", "subject", "staff")
    labels = ("school_class", "period", "subject", "staff")
    read_roles = tuple(STAFF_ROLES)
    write_roles = LEADERS
    filters = {"term": "term_id", "class": "school_class_id", "staff": "staff_id", "day": "day"}

    @classmethod
    def validate(cls, view, data, instance=None):
        merged = {
            name: data.get(name, getattr(instance, name, None))
            for name in ("term", "school_class", "day", "period", "staff")
        }
        taken = TimetableSlot.objects.filter(
            term=merged["term"],
            school_class=merged["school_class"],
            day=merged["day"],
            period=merged["period"],
        )
        if instance:
            taken = taken.exclude(pk=instance.pk)
        if taken.exists():
            raise ApiError("clash", "This class already has a lesson then.")
        if merged["staff"]:
            busy = TimetableSlot.objects.filter(
                term=merged["term"],
                day=merged["day"],
                period=merged["period"],
                staff=merged["staff"],
            ).select_related("school_class")
            if instance:
                busy = busy.exclude(pk=instance.pk)
            clash = busy.first()
            if clash:
                raise ApiError(
                    "clash", f"{merged['staff']} is teaching {clash.school_class.name} then."
                )
        return data


class MyTimetableView(SchoolView):
    read_roles = tuple(STAFF_ROLES)

    def get(self, request):
        today = timezone.localdate()
        term = (
            Term.objects.for_school(self.school)
            .filter(start_date__lte=today, end_date__gte=today)
            .first()
        )
        staff = Staff.objects.filter(user=request.user).first()
        slots = TimetableSlot.objects.filter(term=term, staff=staff).select_related(
            "school_class", "period", "subject"
        )
        covers = Cover.objects.filter(substitute=staff, date__gte=today).select_related(
            "slot__school_class", "slot__period", "slot__subject"
        )
        return Response(
            {
                "term": str(term) if term else "",
                "slots": [
                    {
                        "day": s.day,
                        "period": s.period.name,
                        "start": s.period.start_time,
                        "class": s.school_class.name,
                        "subject": s.subject.name,
                    }
                    for s in slots
                ],
                "covers": [
                    {
                        "date": c.date,
                        "period": c.slot.period.name,
                        "class": c.slot.school_class.name,
                        "subject": c.slot.subject.name,
                    }
                    for c in covers
                ],
            }
        )


class CoverResource(Resource):
    model = Cover
    fields = ("slot", "date", "substitute", "note")
    labels = ("slot", "substitute")
    read_roles = tuple(STAFF_ROLES)
    write_roles = LEADERS
    filters = {"date": "date"}

    @classmethod
    def validate(cls, view, data, instance=None):
        slot = data.get("slot", getattr(instance, "slot", None))
        day = data.get("date", getattr(instance, "date", None))
        substitute = data.get("substitute", getattr(instance, "substitute", None))
        if slot and day and day.isoweekday() != slot.day:
            raise serializers.ValidationError(
                {"date": ["That lesson isn't on this day of the week."]}
            )
        if slot and substitute:
            if TimetableSlot.objects.filter(
                term=slot.term, day=slot.day, period=slot.period, staff=substitute
            ).exists():
                raise ApiError("clash", f"{substitute} is teaching then.")
            others = Cover.objects.filter(date=day, substitute=substitute, slot__period=slot.period)
            if instance:
                others = others.exclude(pk=instance.pk)
            if others.exists():
                raise ApiError("clash", f"{substitute} is already covering then.")
        return data


class CoverNeededView(SchoolView):
    """Lessons on a day whose teacher is on leave or marked absent, with no cover yet."""

    read_roles = LEADERS

    def get(self, request):
        raw = request.query_params.get("date")
        day = serializers.DateField().to_internal_value(raw) if raw else timezone.localdate()
        away = set(
            LeaveRequest.objects.filter(
                school=self.school,
                status=LeaveRequest.Status.APPROVED,
                start__lte=day,
                end__gte=day,
            ).values_list("staff_id", flat=True)
        ) | set(
            StaffAttendance.objects.filter(
                school=self.school, date=day, status__in=["ABSENT", "ON_LEAVE"]
            ).values_list("staff_id", flat=True)
        )
        covered = set(
            Cover.objects.filter(school=self.school, date=day).values_list("slot_id", flat=True)
        )
        slots = (
            TimetableSlot.objects.filter(
                school=self.school,
                day=day.isoweekday(),
                staff_id__in=away,
                term__start_date__lte=day,
                term__end_date__gte=day,
            )
            .exclude(pk__in=covered)
            .select_related("school_class", "period", "subject", "staff")
        )
        return Response(
            [
                {
                    "slot": s.pk,
                    "period": s.period.name,
                    "class": s.school_class.name,
                    "subject": s.subject.name,
                    "teacher": f"{s.staff.first_name} {s.staff.surname}",
                }
                for s in slots
            ]
        )


class ResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = LearningResource
        fields = ("title", "subject", "band", "school_class", "kind", "file", "url", "description")

    def validate(self, data):
        if data.get("kind") == LearningResource.Kind.FILE:
            upload = data.get("file")
            if not upload:
                raise serializers.ValidationError({"file": ["Choose a file."]})
            name = upload.name.lower()
            if (
                not any(name.endswith(ext) for ext in RESOURCE_TYPES)
                or upload.size > 10 * 1024 * 1024
            ):
                raise serializers.ValidationError(
                    {"file": ["Choose a document or picture under 10 MB."]}
                )
        elif not data.get("url"):
            raise serializers.ValidationError({"url": ["Enter the link."]})
        return data


def serve_resource(item: LearningResource) -> FileResponse:
    if not item.file:
        raise ApiError("no_file", "This resource is a link.", 404)
    return FileResponse(
        item.file.open("rb"), as_attachment=True, filename=item.file.name.rsplit("/", 1)[-1]
    )


def resource_row(item: LearningResource) -> dict:
    return {
        "id": item.pk,
        "title": item.title,
        "subject": item.subject.name if item.subject_id else "",
        "band": item.band,
        "class": item.school_class.name if item.school_class_id else "",
        "kind": item.kind,
        "url": item.url,
        "has_file": bool(item.file),
        "description": item.description,
        "created_at": item.created_at,
    }


def resources_for_class(school_class: SchoolClass):
    return LearningResource.objects.filter(school=school_class.school).filter(
        Q(school_class=school_class)
        | Q(school_class__isnull=True, band=school_class.band)
        | Q(school_class__isnull=True, band="")
    )


class ResourcesView(SchoolView):
    read_roles = tuple(STAFF_ROLES)
    write_roles = (*LEADERS, *TEACHERS)
    parser_classes = [MultiPartParser, JSONParser]

    def get(self, request):
        items = LearningResource.objects.for_school(self.school).select_related(
            "subject", "school_class"
        )
        if request.query_params.get("class"):
            items = items.filter(school_class_id=request.query_params["class"])
        return Response([resource_row(item) for item in items.order_by("-created_at")[:300]])

    @transaction.atomic
    def post(self, request):
        serializer = ResourceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        for name in ("subject", "school_class"):
            value = serializer.validated_data.get(name)
            if value is not None and value.school_id != self.school.pk:
                raise serializers.ValidationError({name: ["Choose one from your school."]})
        item = serializer.save(school=self.school, uploaded_by=request.user)
        record(AuditLog.Action.CREATED, actor=request.user, entity=item, request=request)
        return Response(resource_row(item), status=201)


class ResourceDetailView(SchoolView):
    read_roles = tuple(STAFF_ROLES)
    write_roles = (*LEADERS, *TEACHERS)

    def item(self, pk) -> LearningResource:
        return get_object_or_404(LearningResource.objects.for_school(self.school), pk=pk)

    def get(self, request, pk):
        return serve_resource(self.item(pk))

    @transaction.atomic
    def delete(self, request, pk):
        item = self.item(pk)
        if item.uploaded_by_id != request.user.pk and not roles.has_role(request.user, *LEADERS):
            raise ApiError(
                "not_yours", "Only the person who shared it, or a leader, can remove it.", 403
            )
        record(
            AuditLog.Action.DELETED,
            actor=request.user,
            entity=item,
            old={"title": item.title},
            request=request,
        )
        if item.file:
            item.file.delete(save=False)
        item.delete()
        return Response(status=204)


def timetable_for_class(school_class, term) -> list[dict]:
    slots = TimetableSlot.objects.filter(school_class=school_class, term=term).select_related(
        "period", "subject", "staff"
    )
    return [
        {
            "day": s.day,
            "period": s.period.name,
            "start": s.period.start_time,
            "end": s.period.end_time,
            "subject": s.subject.name,
            "teacher": f"{s.staff.first_name} {s.staff.surname}" if s.staff_id else "",
        }
        for s in slots
    ]
