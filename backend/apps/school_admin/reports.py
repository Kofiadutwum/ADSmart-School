"""Downloads for Excel (SMS spec §31): pupils, debtors, payments and attendance as CSV files,
and the school's own audit log. Each download is limited to the school and to the roles that
may see it."""

from django.utils import timezone
from rest_framework.response import Response

from apps.accounts import roles
from apps.audit.models import AuditLog
from apps.billing.api import csv_response
from apps.finance.api import owed_by_pupil
from apps.finance.models import Payment
from apps.learning.models import StudentAttendance
from apps.people.models import Student
from apps.school_admin.views import SchoolView

LEADERS = (roles.ADMINISTRATOR, roles.HEAD_TEACHER, roles.PROPRIETOR)
MONEY = (roles.ACCOUNTANT, *LEADERS)


def class_name(pupil) -> str:
    place = next((e for e in pupil.enrolments.all() if e.end_date is None), None)
    return place.school_class.name if place else ""


class PupilsCsvView(SchoolView):
    read_roles = LEADERS

    def get(self, request):
        pupils = (
            Student.objects.for_school(self.school)
            .prefetch_related("enrolments__school_class")
            .order_by("surname")
        )
        return csv_response(
            "pupils",
            [
                "Student ID",
                "First name",
                "Surname",
                "Gender",
                "Date of birth",
                "Class",
                "Status",
                "Admitted",
            ],
            [
                [
                    p.student_id,
                    p.first_name,
                    p.surname,
                    p.gender,
                    p.date_of_birth,
                    class_name(p),
                    p.status,
                    p.admission_date,
                ]
                for p in pupils
            ],
        )


class DebtorsCsvView(SchoolView):
    read_roles = MONEY

    def get(self, request):
        totals = {row["student"]: row["total"] for row in owed_by_pupil(self.school)}
        pupils = (
            Student.objects.filter(pk__in=totals)
            .prefetch_related("enrolments__school_class")
            .order_by("surname")
        )
        return csv_response(
            "debtors",
            ["Student ID", "Name", "Class", "Owed (GHS)"],
            [
                [p.student_id, f"{p.first_name} {p.surname}", class_name(p), totals[p.pk] / 100]
                for p in pupils
            ],
        )


class PaymentsCsvView(SchoolView):
    read_roles = MONEY

    def get(self, request):
        payments = (
            Payment.objects.for_school(self.school)
            .select_related("student")
            .order_by("received_at")
        )
        if request.query_params.get("from"):
            payments = payments.filter(received_at__date__gte=request.query_params["from"])
        if request.query_params.get("to"):
            payments = payments.filter(received_at__date__lte=request.query_params["to"])
        return csv_response(
            "payments",
            [
                "Receipt",
                "Date",
                "Student ID",
                "Pupil",
                "Amount (GHS)",
                "Method",
                "For",
                "Reference",
                "Status",
            ],
            [
                [
                    p.receipt_number,
                    timezone.localtime(p.received_at).date(),
                    p.student.student_id,
                    f"{p.student.first_name} {p.student.surname}",
                    p.amount / 100,
                    p.method,
                    p.purpose,
                    p.reference,
                    p.status,
                ]
                for p in payments
            ],
        )


class AttendanceCsvView(SchoolView):
    read_roles = LEADERS

    def get(self, request):
        rows = (
            StudentAttendance.objects.for_school(self.school)
            .select_related("student")
            .order_by("date")
        )
        if request.query_params.get("from"):
            rows = rows.filter(date__gte=request.query_params["from"])
        if request.query_params.get("to"):
            rows = rows.filter(date__lte=request.query_params["to"])
        return csv_response(
            "attendance",
            ["Date", "Student ID", "Pupil", "Status", "Note"],
            [
                [
                    r.date,
                    r.student.student_id,
                    f"{r.student.first_name} {r.student.surname}",
                    r.status,
                    r.note,
                ]
                for r in rows[:50000]
            ],
        )


def audit_rows(logs) -> list[list]:
    return [
        [
            timezone.localtime(log.created_at),
            log.actor_name or str(log.actor or ""),
            log.action,
            log.entity_type,
            log.entity_id,
            log.reason,
        ]
        for log in logs
    ]


AUDIT_HEADER = ["When", "Who", "Action", "Record type", "Record", "Reason"]


class AuditCsvView(SchoolView):
    read_roles = (roles.ADMINISTRATOR, roles.HEAD_TEACHER)

    def get(self, request):
        logs = (
            AuditLog.objects.filter(school=self.school)
            .select_related("actor")
            .order_by("-created_at")[:20000]
        )
        return csv_response("audit-log", AUDIT_HEADER, audit_rows(logs))


class DashboardView(SchoolView):
    """Headline numbers for a leader's home page (SMS spec §31)."""

    read_roles = LEADERS

    def get(self, request):
        today = timezone.localdate()
        active = Student.objects.for_school(self.school).filter(status=Student.Status.ACTIVE)
        marks = StudentAttendance.objects.for_school(self.school).filter(date=today)
        present = marks.filter(status__in=["PRESENT", "LATE"]).count()
        owed = [row["total"] for row in owed_by_pupil(self.school)]
        return Response(
            {
                "pupils": active.count(),
                "marked_today": marks.count(),
                "present_today": present,
                "absent_today": marks.filter(status="ABSENT").count(),
                "outstanding_fees": sum(owed),
                "debtors": len(owed),
                "collected_today": sum(
                    Payment.objects.for_school(self.school)
                    .filter(received_at__date=today, status=Payment.Status.CONFIRMED)
                    .values_list("amount", flat=True)
                ),
            }
        )
