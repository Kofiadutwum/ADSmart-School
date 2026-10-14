"""Attendance (SMS spec §10, §12): the class register on open school days, a text to the family
when a child is marked absent, staff attendance and leave requests."""

from datetime import date as Date

from django.db import transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response

from apps.accounts import roles
from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError
from apps.core.resources import Resource
from apps.finance.daily import is_open_day
from apps.finance.services import text_family
from apps.learning.models import LeaveRequest, StaffAttendance, StudentAttendance
from apps.notifications.sms import Purpose
from apps.people.models import Staff, Student
from apps.people.services import STAFF_ROLES
from apps.school_admin.class_lists import class_access, pupils_in
from apps.school_admin.views import SchoolView

LEADERS = (roles.ADMINISTRATOR, roles.HEAD_TEACHER)
TEACHERS = (roles.TEACHER, roles.CAREGIVER)


def day_from(raw) -> Date:
    day = serializers.DateField().to_internal_value(raw) if raw else timezone.localdate()
    if day > timezone.localdate():
        raise ApiError("future", "Attendance can't be taken for a day that hasn't come yet.")
    return day


class RegisterView(SchoolView):
    """The class teacher (or a leader) marks the register for an open day."""

    read_roles = (*LEADERS, *TEACHERS)
    write_roles = (*LEADERS, *TEACHERS)

    def school_class(self, pk):
        school_class, class_teacher, _ = class_access(self.request, self.school, pk)
        if self.request.method != "GET" and not (
            class_teacher or roles.has_role(self.request.user, *LEADERS)
        ):
            raise ApiError("not_class_teacher", "Only the class teacher marks this register.", 403)
        return school_class

    def get(self, request, pk):
        school_class = self.school_class(pk)
        day = day_from(request.query_params.get("date"))
        marks = {
            row.student_id: row
            for row in StudentAttendance.objects.filter(school=self.school, date=day)
        }
        pupils = (
            pupils_in(school_class)
            .filter(status=Student.Status.ACTIVE)
            .order_by("surname", "first_name")
        )
        return Response(
            {
                "class": school_class.name,
                "date": day,
                "open_day": is_open_day(self.school, day),
                "pupils": [
                    {
                        "student": pupil.pk,
                        "name": f"{pupil.first_name} {pupil.surname}",
                        "status": marks[pupil.pk].status if pupil.pk in marks else "",
                        "arrival_time": marks[pupil.pk].arrival_time if pupil.pk in marks else None,
                        "note": marks[pupil.pk].note if pupil.pk in marks else "",
                    }
                    for pupil in pupils
                ],
            }
        )

    @transaction.atomic
    def post(self, request, pk):
        school_class = self.school_class(pk)
        data = validated(RegisterSerializer, request)
        day = day_from(data["date"].isoformat())
        if not is_open_day(self.school, day):
            raise ApiError("closed_day", "The school is closed on that day.")
        members = set(pupils_in(school_class).values_list("pk", flat=True))
        absent = []
        for mark in data["marks"]:
            if mark["student"] not in members:
                raise serializers.ValidationError({"marks": ["Every pupil must be in this class."]})
            row, _ = StudentAttendance.objects.update_or_create(
                school=self.school,
                student_id=mark["student"],
                date=day,
                defaults={
                    "status": mark["status"],
                    "arrival_time": mark.get("arrival_time"),
                    "note": mark.get("note", ""),
                    "marked_by": request.user,
                },
            )
            if (
                row.status == StudentAttendance.Status.ABSENT
                and not row.absence_texted
                and day == timezone.localdate()
            ):
                absent.append(row)
        for row in absent:
            row.absence_texted = True
            row.save(update_fields=["absence_texted"])
            pupil, when = row.student, day.strftime("%d %b")
            transaction.on_commit(
                lambda p=pupil, w=when: text_family(p, "ABSENCE", Purpose.ABSENCE, date=w)
            )
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=school_class,
            new={"register": day.isoformat()},
            request=request,
        )
        return Response({"saved": len(data["marks"]), "texts": len(absent)})


class MarkSerializer(serializers.Serializer):
    student = serializers.IntegerField()
    status = serializers.ChoiceField(choices=StudentAttendance.Status.choices)
    arrival_time = serializers.TimeField(required=False, allow_null=True)
    note = serializers.CharField(max_length=200, required=False, default="", allow_blank=True)


class RegisterSerializer(serializers.Serializer):
    date = serializers.DateField()
    marks = MarkSerializer(many=True)


def attendance_summary(pupil, since=None) -> dict:
    rows = StudentAttendance.objects.filter(student=pupil)
    if since:
        rows = rows.filter(date__gte=since)
    counts = dict(rows.values("status").annotate(n=Count("id")).values_list("status", "n"))
    days = sum(counts.values())
    present = counts.get("PRESENT", 0) + counts.get("LATE", 0)
    return {
        "days": days,
        "present": counts.get("PRESENT", 0),
        "late": counts.get("LATE", 0),
        "absent": counts.get("ABSENT", 0),
        "excused": counts.get("EXCUSED", 0),
        "rate": round(present * 100 / days, 1) if days else None,
        "recent": [{"date": r.date, "status": r.status} for r in rows.order_by("-date")[:30]],
    }


class PupilAttendanceView(SchoolView):
    read_roles = (*LEADERS, *TEACHERS, roles.NURSE)

    def get(self, request, pk):
        pupil = get_object_or_404(Student.objects.for_school(self.school), pk=pk)
        return Response(attendance_summary(pupil, request.query_params.get("since")))


class StaffMarkSerializer(serializers.Serializer):
    staff = serializers.IntegerField()
    status = serializers.ChoiceField(choices=StaffAttendance.Status.choices)
    time_in = serializers.TimeField(required=False, allow_null=True)
    note = serializers.CharField(max_length=200, required=False, default="", allow_blank=True)


class StaffRegisterSerializer(serializers.Serializer):
    date = serializers.DateField()
    marks = StaffMarkSerializer(many=True)


class StaffRegisterView(SchoolView):
    read_roles = write_roles = (*LEADERS, roles.FRONT_DESK)

    def get(self, request):
        day = day_from(request.query_params.get("date"))
        marks = {
            row.staff_id: row
            for row in StaffAttendance.objects.filter(school=self.school, date=day)
        }
        on_leave = set(
            LeaveRequest.objects.filter(
                school=self.school,
                status=LeaveRequest.Status.APPROVED,
                start__lte=day,
                end__gte=day,
            ).values_list("staff_id", flat=True)
        )
        staff = (
            Staff.objects.for_school(self.school).filter(user__is_active=True).order_by("surname")
        )
        return Response(
            [
                {
                    "staff": member.pk,
                    "name": f"{member.first_name} {member.surname}",
                    "status": marks[member.pk].status
                    if member.pk in marks
                    else ("ON_LEAVE" if member.pk in on_leave else ""),
                    "time_in": marks[member.pk].time_in if member.pk in marks else None,
                }
                for member in staff
            ]
        )

    @transaction.atomic
    def post(self, request):
        data = validated(StaffRegisterSerializer, request)
        day = day_from(data["date"].isoformat())
        ids = set(Staff.objects.for_school(self.school).values_list("pk", flat=True))
        for mark in data["marks"]:
            if mark["staff"] not in ids:
                raise serializers.ValidationError(
                    {"marks": ["Every person must be on this school's staff."]}
                )
            StaffAttendance.objects.update_or_create(
                school=self.school,
                staff_id=mark["staff"],
                date=day,
                defaults={
                    "status": mark["status"],
                    "time_in": mark.get("time_in"),
                    "note": mark["note"],
                    "marked_by": request.user,
                },
            )
        return Response({"saved": len(data["marks"])})


def own_staff(user) -> Staff:
    staff = Staff.objects.filter(user=user).first()
    if staff is None:
        raise ApiError("no_staff_record", "Your staff record isn't set up yet.")
    return staff


class LeaveResource(Resource):
    """Staff ask for leave; the Head Teacher decides. Staff see their own; leaders see all."""

    model = LeaveRequest
    fields = ("kind", "start", "end", "reason")
    shown = ("status",)
    labels = ("staff", "decided_by")
    read_roles = write_roles = tuple(STAFF_ROLES)
    deletable = False
    filters = {"status": "status"}

    @classmethod
    def scope(cls, view, rows):
        if roles.has_role(view.request.user, *LEADERS):
            return rows
        return rows.filter(staff__user=view.request.user)

    @classmethod
    def validate(cls, view, data, instance=None):
        if instance is not None and instance.status != LeaveRequest.Status.PENDING:
            raise ApiError("decided", "A decided request can't change.")
        if data.get("start") and data.get("end") and data["end"] < data["start"]:
            raise serializers.ValidationError({"end": ["The last day can't be before the first."]})
        if instance is None:
            data["staff"] = own_staff(view.request.user)
        return data


class DecideSerializer(serializers.Serializer):
    approve = serializers.BooleanField()


class LeaveDecideView(SchoolView):
    read_roles = write_roles = (roles.HEAD_TEACHER, roles.ADMINISTRATOR)

    @transaction.atomic
    def post(self, request, pk):
        leave = get_object_or_404(LeaveRequest.objects.for_school(self.school), pk=pk)
        if leave.staff.user_id == request.user.pk:
            raise ApiError("own_request", "Someone else must decide your own leave.")
        approve = validated(DecideSerializer, request)["approve"]
        leave.status = LeaveRequest.Status.APPROVED if approve else LeaveRequest.Status.REJECTED
        leave.decided_by = request.user
        leave.save(update_fields=["status", "decided_by"])
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=leave,
            new={"status": leave.status},
            request=request,
        )
        return Response(LeaveResource.row(self, leave))
