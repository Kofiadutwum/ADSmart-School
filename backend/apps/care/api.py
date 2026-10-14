"""Care and safety in the school portal (SMS spec §6, §11A, §15, §27, §37).

- Early-years daily reports and the carers' notes.
- Pick-up control at the gate: only listed people, or someone the parent approved for today.
  Anyone else is not released, and the family is told at once.
- Visitors and late arrivals or early departures.
- Medical records, the sickbay, incidents and special needs are restricted, and every read is
  logged.
"""

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response

from apps.academics.models import ClassTeacherAssignment, TeachingAssignment
from apps.accounts import roles
from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.care.models import (
    CareNote,
    DailyCare,
    GateEvent,
    IncidentLog,
    MedicalRecord,
    OneTimeApproval,
    Release,
    SickbayVisit,
    SpecialNeed,
    Visitor,
)
from apps.core.exceptions import ApiError
from apps.core.resources import Resource
from apps.finance.services import text_family
from apps.notifications.sms import Purpose
from apps.people.models import PickupPerson, Staff, Student
from apps.school_admin.views import SchoolView

LEADERS = (roles.ADMINISTRATOR, roles.HEAD_TEACHER)
CARERS = (roles.CAREGIVER, roles.TEACHER)
GATE = (roles.FRONT_DESK,)
HEALTH = (roles.NURSE,)


def taught_pupils(user):
    staff = Staff.objects.filter(user=user).first()
    classes = list(
        ClassTeacherAssignment.objects.filter(staff=staff).values_list("school_class", flat=True)
    )
    classes += list(
        TeachingAssignment.objects.filter(staff=staff).values_list("school_class", flat=True)
    )
    return Student.objects.filter(
        enrolments__school_class__in=classes, enrolments__end_date__isnull=True
    )


class ClassScoped(Resource):
    """Teachers and carers see and record only the pupils in the classes they teach."""

    @classmethod
    def own_only(cls, view) -> bool:
        return not roles.has_role(view.request.user, *LEADERS, *GATE, *HEALTH)

    @classmethod
    def scope(cls, view, rows):
        return (
            rows.filter(student__in=taught_pupils(view.request.user))
            if cls.own_only(view)
            else rows
        )

    @classmethod
    def validate(cls, view, data, instance=None):
        pupil = data.get("student")
        if (
            pupil is not None
            and cls.own_only(view)
            and not taught_pupils(view.request.user).filter(pk=pupil.pk).exists()
        ):
            raise serializers.ValidationError(
                {"student": ["Choose a pupil in one of your classes."]}
            )
        return data


class DailyCareResource(ClassScoped):
    model = DailyCare
    fields = (
        "student",
        "date",
        "arrival",
        "departure",
        "meals",
        "ate_well",
        "sleep",
        "toilet",
        "mood",
        "activities",
        "incident",
        "staff_signed",
        "supplies_needed",
    )
    labels = ("student", "recorded_by")
    read_roles = (*LEADERS, *CARERS)
    write_roles = CARERS
    stamp_user = "recorded_by"
    filters = {"student": "student_id", "date": "date"}


class CareNoteResource(ClassScoped):
    """Staff notes go straight to the parent; parents' notes wait for the class teacher."""

    model = CareNote
    fields = ("student", "text")
    shown = ("from_parent", "approved", "created_at")
    labels = ("student", "author")
    read_roles = (*LEADERS, *CARERS)
    write_roles = CARERS
    stamp_user = "author"
    filters = {"student": "student_id"}

    @classmethod
    def validate(cls, view, data, instance=None):
        if instance is not None and instance.from_parent:
            raise ApiError("parent_note", "A parent's note can be approved but not changed.")
        data["approved"] = True
        return super().validate(view, data, instance)


class NoteApproveView(SchoolView):
    read_roles = write_roles = (*LEADERS, *CARERS)

    @transaction.atomic
    def post(self, request, pk):
        note = get_object_or_404(CareNoteResource.queryset(self), pk=pk)
        note.approved, note.approved_by = True, request.user
        note.save(update_fields=["approved", "approved_by"])
        return Response(CareNoteResource.row(self, note))


def allowed_collectors(pupil: Student, today=None) -> dict:
    today = today or timezone.localdate()
    people = PickupPerson.objects.filter(student=pupil, valid_from__lte=today).filter(
        Q(valid_to__isnull=True) | Q(valid_to__gte=today)
    )
    approvals = OneTimeApproval.objects.filter(student=pupil, date=today)
    return {
        "people": [
            {
                "id": p.pk,
                "name": p.name,
                "relationship": p.relationship,
                "phone": p.phone,
                "has_photo": bool(p.photo),
            }
            for p in people
        ],
        "approvals": [{"id": a.pk, "name": a.name, "phone": a.phone} for a in approvals],
    }


class PickupCheckView(SchoolView):
    read_roles = (*GATE, *LEADERS, *CARERS)

    def get(self, request, pk):
        pupil = get_object_or_404(Student.objects.for_school(self.school), pk=pk)
        return Response(
            {
                "pupil": {"id": pupil.pk, "name": f"{pupil.first_name} {pupil.surname}"},
                **allowed_collectors(pupil),
            }
        )


class ReleaseSerializer(serializers.Serializer):
    student = serializers.IntegerField()
    pickup_person = serializers.IntegerField(required=False)
    approval = serializers.IntegerField(required=False)
    collector_name = serializers.CharField(max_length=120)
    note = serializers.CharField(max_length=200, required=False, default="", allow_blank=True)


class ReleaseView(SchoolView):
    """Released only to a listed person or today's approved person; otherwise blocked."""

    read_roles = (*GATE, *LEADERS, *CARERS)
    write_roles = (*GATE, *CARERS, roles.HEAD_TEACHER)

    def get(self, request):
        releases = Release.objects.for_school(self.school).select_related("student")
        date = request.query_params.get("date")
        releases = (
            releases.filter(at__date=date)
            if date
            else releases.filter(at__date=timezone.localdate())
        )
        return Response(
            [
                {
                    "id": r.pk,
                    "student": f"{r.student.first_name} {r.student.surname}",
                    "collector": r.collector_name,
                    "status": r.status,
                    "at": r.at,
                    "note": r.note,
                }
                for r in releases[:500]
            ]
        )

    @transaction.atomic
    def post(self, request):
        data = validated(ReleaseSerializer, request)
        pupil = get_object_or_404(Student.objects.for_school(self.school), pk=data["student"])
        allowed = allowed_collectors(pupil)
        person = approval = None
        if data.get("pickup_person") in {p["id"] for p in allowed["people"]}:
            person = PickupPerson.objects.get(pk=data["pickup_person"])
        elif data.get("approval") in {a["id"] for a in allowed["approvals"]}:
            approval = OneTimeApproval.objects.get(pk=data["approval"])
        status = Release.Status.RELEASED if person or approval else Release.Status.BLOCKED
        release = Release.objects.create(
            school=self.school,
            student=pupil,
            collector_name=data["collector_name"],
            pickup_person=person,
            approval=approval,
            status=status,
            released_by=request.user,
            note=data["note"],
        )
        when = timezone.localtime(release.at).strftime("%H:%M")
        if status == Release.Status.RELEASED:
            transaction.on_commit(
                lambda: text_family(
                    pupil, "RELEASED", Purpose.ALERT, collector=release.collector_name, time=when
                )
            )
        else:
            transaction.on_commit(
                lambda: text_family(
                    pupil, "BLOCKED_COLLECTION", Purpose.ALERT, collector=release.collector_name
                )
            )
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=release,
            new={"status": status},
            request=request,
        )
        return Response({"id": release.pk, "status": status}, status=201)


class VisitorResource(Resource):
    model = Visitor
    fields = ("name", "phone", "purpose", "host", "time_out")
    shown = ("time_in",)
    read_roles = (*GATE, *LEADERS)
    write_roles = GATE
    stamp_user = "recorded_by"
    deletable = False
    ordering = ("-time_in",)


class GateEventResource(ClassScoped):
    model = GateEvent
    fields = ("student", "kind", "reason")
    shown = ("at",)
    labels = ("student",)
    read_roles = (*GATE, *LEADERS, *CARERS)
    write_roles = GATE
    stamp_user = "recorded_by"
    deletable = False
    filters = {"student": "student_id", "kind": "kind"}


class MedicalResource(Resource):
    model = MedicalRecord
    fields = ("student", "allergies", "conditions", "medication", "clinic", "clinic_phone", "notes")
    shown = ("updated_at",)
    labels = ("student",)
    read_roles = (*HEALTH, *LEADERS)
    write_roles = (*HEALTH, roles.ADMINISTRATOR)
    restricted = True
    deletable = False
    filters = {"student": "student_id"}


class SickbayResource(Resource):
    model = SickbayVisit
    fields = ("student", "complaint", "action", "time_out", "parent_informed")
    shown = ("time_in",)
    labels = ("student",)
    read_roles = (*HEALTH, *LEADERS)
    write_roles = HEALTH
    stamp_user = "recorded_by"
    restricted = True
    deletable = False
    filters = {"student": "student_id"}


class IncidentResource(ClassScoped):
    model = IncidentLog
    fields = ("student", "date", "kind", "description", "action_taken", "parent_informed")
    labels = ("student", "recorded_by")
    read_roles = (*LEADERS, *HEALTH)
    write_roles = (*LEADERS, *HEALTH, *CARERS, *GATE)
    stamp_user = "recorded_by"
    restricted = True
    deletable = False
    filters = {"student": "student_id", "kind": "kind"}


class IncidentNotifySerializer(serializers.Serializer):
    detail = serializers.CharField(max_length=200)


class IncidentNotifyView(SchoolView):
    """Text the family about an incident, in words the staff member chooses."""

    read_roles = write_roles = (*LEADERS, *HEALTH)

    @transaction.atomic
    def post(self, request, pk):
        incident = get_object_or_404(
            IncidentLog.objects.for_school(self.school).select_related("student"), pk=pk
        )
        detail = validated(IncidentNotifySerializer, request)["detail"]
        sent = text_family(incident.student, "INCIDENT", Purpose.ALERT, detail=detail)
        incident.parent_informed = True
        incident.save(update_fields=["parent_informed"])
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=incident,
            new={"texts": sent},
            request=request,
        )
        return Response({"texts": sent})


class SpecialNeedResource(ClassScoped):
    model = SpecialNeed
    fields = ("student", "need", "support_plan")
    labels = ("student",)
    read_roles = (*LEADERS, *HEALTH, *CARERS)
    write_roles = (*LEADERS, *HEALTH)
    stamp_user = "recorded_by"
    restricted = True
    filters = {"student": "student_id"}
