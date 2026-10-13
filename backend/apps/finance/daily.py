"""The daily canteen, extra-class and bus charge (SMS spec §14): rates per category approved by
the Head Teacher, exemptions, a list per class per open day, closing the day, late edits,
hand-overs, cash-ups, weekly statements and extra-class pay for teachers.

Ruling: what a pupil does not pay in cash on the day is taken from their prepaid wallet, which
may go below zero; a negative wallet is money owed, and a top-up settles it.
"""

from datetime import timedelta

from django.db import transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response

from apps.academics.models import CalendarDay, ClassTeacherAssignment, SchoolClass
from apps.accounts import roles
from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError
from apps.core.resources import Resource
from apps.finance import services
from apps.finance.models import (
    Account,
    CashUp,
    Category,
    CategoryRate,
    ChargeExemption,
    DailyCharge,
    DailyList,
    Handover,
    LateEdit,
    LedgerEntry,
    PayLine,
    Payment,
    PayRule,
    PayRun,
    WeeklyStatement,
)
from apps.notifications.sms import Purpose
from apps.people.models import Staff, Student
from apps.school_admin.class_lists import class_access, pupils_in
from apps.school_admin.views import SchoolView
from apps.transport.models import BusAssignment

LEADERS = (roles.ADMINISTRATOR, roles.HEAD_TEACHER, roles.PROPRIETOR)
APPROVERS = (roles.HEAD_TEACHER, roles.PROPRIETOR)
MONEY = (roles.ACCOUNTANT, roles.CANTEEN)
EVERY_CLASS = (*LEADERS, *MONEY)
MARKERS = (roles.TEACHER, *MONEY, roles.HEAD_TEACHER)


class RateResource(Resource):
    model = CategoryRate
    fields = ("category", "daily_amount", "canteen_amount")
    shown = ("status",)
    labels = ("set_by", "approved_by")
    read_roles = (*LEADERS, *MONEY)
    write_roles = (roles.ACCOUNTANT,)

    @classmethod
    def validate(cls, view, data, instance=None):
        daily = data.get("daily_amount", instance.daily_amount if instance else 0)
        if data.get("canteen_amount", instance.canteen_amount if instance else 0) > daily:
            raise serializers.ValidationError(
                {"canteen_amount": ["The canteen part can't exceed the daily amount."]}
            )
        data.update(status=CategoryRate.Status.PENDING, set_by=view.request.user, approved_by=None)
        return data


class RateApproveView(SchoolView):
    read_roles = write_roles = APPROVERS

    @transaction.atomic
    def post(self, request, pk):
        rate = get_object_or_404(CategoryRate.objects.for_school(self.school), pk=pk)
        rate.status, rate.approved_by = CategoryRate.Status.APPROVED, request.user
        rate.save(update_fields=["status", "approved_by"])
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=rate,
            new={"approved": True},
            request=request,
        )
        return Response(RateResource.row(self, rate))


class ExemptionResource(Resource):
    model = ChargeExemption
    fields = ("student", "kind", "daily_amount", "reason", "active")
    labels = ("student",)
    read_roles = (*LEADERS, *MONEY)
    write_roles = (roles.ACCOUNTANT, roles.HEAD_TEACHER)
    filters = {"student": "student_id"}


def is_open_day(school, date) -> bool:
    if date.weekday() >= 5:
        return False
    return (
        not CalendarDay.objects.filter(school=school, date=date)
        .exclude(type=CalendarDay.Type.OPEN)
        .exists()
    )


@transaction.atomic
def open_list(school_class: SchoolClass, date) -> DailyList:
    """The day's list, adding any pupil who joined the class since it was opened."""
    school = school_class.school
    daily, _ = DailyList.objects.get_or_create(school=school, school_class=school_class, date=date)
    if daily.status != DailyList.Status.OPEN:
        return daily
    rate = CategoryRate.objects.filter(
        school=school,
        category=services.category_of(school_class),
        status=CategoryRate.Status.APPROVED,
    ).first()
    have = set(daily.charges.values_list("student_id", flat=True))
    exemptions = {
        row.student_id: row for row in ChargeExemption.objects.filter(school=school, active=True)
    }
    buses = {
        row.student_id: row.route.daily_fee
        for row in BusAssignment.objects.filter(school=school, active=True).select_related("route")
    }
    for pupil in pupils_in(school_class).filter(status=Student.Status.ACTIVE).exclude(pk__in=have):
        canteen = rate.canteen_amount if rate else 0
        extra = rate.daily_amount - rate.canteen_amount if rate else 0
        bus = buses.get(pupil.pk, 0)
        exemption = exemptions.get(pupil.pk)
        if exemption and exemption.kind == ChargeExemption.Kind.FULL:
            canteen = extra = 0
        elif exemption:
            canteen = min(canteen, exemption.daily_amount)
            extra = exemption.daily_amount - canteen
        status = (
            DailyCharge.Status.EXEMPT if canteen + extra + bus == 0 else DailyCharge.Status.UNPAID
        )
        DailyCharge.objects.create(
            school=school,
            daily_list=daily,
            student=pupil,
            canteen=canteen,
            extra=extra,
            bus=bus,
            status=status,
        )
    return daily


def charge_row(charge: DailyCharge) -> dict:
    return {
        "id": charge.pk,
        "student": charge.student_id,
        "name": f"{charge.student.first_name} {charge.student.surname}",
        "canteen": charge.canteen,
        "extra": charge.extra,
        "bus": charge.bus,
        "total": charge.total,
        "status": charge.status,
        "paid": charge.paid,
        "method": charge.method,
        "wallet": services.balance(charge.student, Account.WALLET),
    }


def list_row(daily: DailyList) -> dict:
    charges = list(
        daily.charges.select_related("student").order_by("student__surname", "student__first_name")
    )
    cash = sum(c.paid for c in charges if c.method != "WALLET")
    return {
        "id": daily.pk,
        "class": daily.school_class.name,
        "class_id": daily.school_class_id,
        "date": daily.date,
        "status": daily.status,
        "charges": [charge_row(c) for c in charges],
        "cash_collected": cash,
        "expected": sum(c.total for c in charges if c.status not in ("ABSENT", "EXEMPT")),
    }


class DailyView(SchoolView):
    read_roles = (*LEADERS, *MONEY, roles.TEACHER)
    write_roles = MARKERS

    def school_class(self, pk) -> SchoolClass:
        if roles.has_role(self.request.user, *EVERY_CLASS):
            return get_object_or_404(SchoolClass.objects.for_school(self.school), pk=pk)
        school_class, class_teacher, _ = class_access(self.request, self.school, pk)
        if not class_teacher:
            raise ApiError(
                "not_class_teacher", "Only the class teacher keeps this class's daily list.", 403
            )
        return school_class


class DailyListView(DailyView):
    def get(self, request, pk):
        school_class = self.school_class(pk)
        raw = request.query_params.get("date")
        date = serializers.DateField().to_internal_value(raw) if raw else timezone.localdate()
        existing = DailyList.objects.filter(school_class=school_class, date=date).first()
        if existing is None and not is_open_day(self.school, date):
            raise ApiError("closed_day", "The school is closed on that day.")
        return Response(
            list_row(
                existing
                if existing and existing.status != "OPEN"
                else open_list(school_class, date)
            )
        )


class MarkSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["PAID", "PART", "UNPAID", "ABSENT"])
    paid = serializers.IntegerField(min_value=0, required=False, default=0)
    method = serializers.ChoiceField(
        choices=["CASH", "MOMO", "WALLET"], required=False, default="CASH"
    )


class DailyChargeView(DailyView):
    @transaction.atomic
    def patch(self, request, pk):
        charge = get_object_or_404(
            DailyCharge.objects.for_school(self.school).select_related("daily_list"), pk=pk
        )
        self.school_class(charge.daily_list.school_class_id)
        if charge.daily_list.status != DailyList.Status.OPEN:
            raise ApiError("closed", "This day is closed. Ask for a late edit instead.")
        if charge.status == DailyCharge.Status.EXEMPT:
            raise ApiError("exempt", "This pupil is exempt.")
        data = validated(MarkSerializer, request)
        paid = {"PAID": charge.total, "PART": data["paid"], "UNPAID": 0, "ABSENT": 0}[
            data["status"]
        ]
        if data["status"] == "PART" and not 0 < paid < charge.total:
            raise serializers.ValidationError({"paid": ["Enter part of the day's amount."]})
        charge.status, charge.paid, charge.method, charge.marked_by = (
            data["status"],
            paid,
            data["method"],
            request.user,
        )
        charge.save()
        return Response(charge_row(charge))


def wallet_take(status: str, paid: int, method: str, total: int) -> int:
    """What the day takes from the wallet: wallet payments plus anything left unpaid."""
    taken = paid if method == "WALLET" else 0
    if status in (DailyCharge.Status.UNPAID, DailyCharge.Status.PART):
        taken += total - paid
    return taken


class DailyCloseView(DailyView):
    @transaction.atomic
    def post(self, request, pk):
        daily = get_object_or_404(
            DailyList.objects.for_school(self.school).select_for_update(), pk=pk
        )
        self.school_class(daily.school_class_id)
        if daily.status == DailyList.Status.CLOSED:
            raise ApiError("closed", "This day is already closed.")
        for charge in daily.charges.select_related("student"):
            taken = wallet_take(charge.status, charge.paid, charge.method, charge.total)
            if taken:
                services.post(
                    charge.student,
                    Account.WALLET,
                    LedgerEntry.Kind.SPEND,
                    -taken,
                    f"Daily charge {daily.date} ({daily.school_class.name})",
                    by=request.user,
                )
        daily.status, daily.closed_by, daily.closed_at = (
            DailyList.Status.CLOSED,
            request.user,
            timezone.now(),
        )
        daily.save()
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=daily,
            new={"closed": True},
            request=request,
        )
        return Response(list_row(daily))


class LateEditSerializer(serializers.Serializer):
    new_status = serializers.ChoiceField(choices=["PAID", "UNPAID", "ABSENT", "EXEMPT"])
    reason = serializers.CharField(max_length=200)


class LateEditRequestView(DailyView):
    @transaction.atomic
    def post(self, request, pk):
        charge = get_object_or_404(
            DailyCharge.objects.for_school(self.school).select_related("daily_list"), pk=pk
        )
        self.school_class(charge.daily_list.school_class_id)
        if charge.daily_list.status != DailyList.Status.CLOSED:
            raise ApiError("open", "The day is still open; change the mark directly.")
        data = validated(LateEditSerializer, request)
        edit = LateEdit.objects.create(
            school=self.school, charge=charge, requested_by=request.user, **data
        )
        return Response(late_edit_row(edit), status=201)


def late_edit_row(edit: LateEdit) -> dict:
    return {
        "id": edit.pk,
        "pupil": str(edit.charge.student),
        "class": edit.charge.daily_list.school_class.name,
        "date": edit.charge.daily_list.date,
        "from_status": edit.charge.status,
        "new_status": edit.new_status,
        "reason": edit.reason,
        "status": edit.status,
        "requested_by": str(edit.requested_by),
    }


class LateEditsView(SchoolView):
    read_roles = (*LEADERS, *MONEY)

    def get(self, request):
        edits = LateEdit.objects.for_school(self.school).select_related(
            "charge__student", "charge__daily_list__school_class", "requested_by"
        )
        return Response([late_edit_row(edit) for edit in edits.order_by("-id")[:200]])


class DecideSerializer(serializers.Serializer):
    approve = serializers.BooleanField()


class LateEditDecideView(SchoolView):
    """The Head Teacher approves a change to a closed day; the wallet is put right."""

    read_roles = write_roles = APPROVERS

    @transaction.atomic
    def post(self, request, pk):
        edit = get_object_or_404(
            LateEdit.objects.for_school(self.school).select_related("charge__student"), pk=pk
        )
        if edit.status != LateEdit.Status.PENDING:
            raise ApiError("decided", "This late edit has already been decided.")
        approve = validated(DecideSerializer, request)["approve"]
        if approve:
            charge = edit.charge
            before = wallet_take(charge.status, charge.paid, charge.method, charge.total)
            charge.status = edit.new_status
            charge.paid = charge.total if edit.new_status == "PAID" else 0
            if edit.new_status == "PAID" and charge.method == "":
                charge.method = "CASH"
            charge.save()
            after = wallet_take(charge.status, charge.paid, charge.method, charge.total)
            if before != after:
                services.post(
                    charge.student,
                    Account.WALLET,
                    LedgerEntry.Kind.ADJUSTMENT,
                    before - after,
                    f"Late edit {charge.daily_list.date}: {edit.reason}",
                    by=request.user,
                )
        edit.status = LateEdit.Status.APPROVED if approve else LateEdit.Status.REJECTED
        edit.decided_by = request.user
        edit.save(update_fields=["status", "decided_by"])
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=edit,
            new={"status": edit.status},
            request=request,
        )
        return Response(late_edit_row(edit))


class HandoverResource(Resource):
    model = Handover
    fields = ("date", "school_class", "collector", "expected", "counted", "note")
    shown = ("difference",)
    labels = ("school_class", "collector", "signed_by")
    read_roles = (*LEADERS, *MONEY)
    write_roles = MONEY
    stamp_user = "signed_by"
    filters = {"date": "date"}
    ordering = ("-date", "-id")


class CashUpResource(Resource):
    model = CashUp
    fields = ("date", "collector", "expected", "counted", "note")
    shown = ("difference", "created_at")
    labels = ("collector", "signed_off_by")
    read_roles = (*LEADERS, *MONEY, roles.BOOKSHOP)
    write_roles = (*MONEY, roles.BOOKSHOP)
    filters = {"date": "date"}
    deletable = False


class CashExpectedView(SchoolView):
    """What a collector should hold for a day: the cash payments they took and the daily cash
    they marked."""

    read_roles = (*LEADERS, *MONEY, roles.BOOKSHOP)

    def get(self, request):
        raw = request.query_params.get("date")
        date = serializers.DateField().to_internal_value(raw) if raw else timezone.localdate()
        collector = request.query_params.get("collector") or request.user.pk
        payments = Payment.objects.for_school(self.school).filter(
            received_by_id=collector,
            received_at__date=date,
            method=Payment.Method.CASH,
            status=Payment.Status.CONFIRMED,
        )
        daily = DailyCharge.objects.for_school(self.school).filter(
            marked_by_id=collector, daily_list__date=date, method="CASH"
        )
        return Response(
            {
                "payments": payments.aggregate(t=Sum("amount"))["t"] or 0,
                "daily": daily.aggregate(t=Sum("paid"))["t"] or 0,
            }
        )


class CashUpSignOffView(SchoolView):
    read_roles = write_roles = (roles.ACCOUNTANT, *APPROVERS)

    @transaction.atomic
    def post(self, request, pk):
        cash_up = get_object_or_404(CashUp.objects.for_school(self.school), pk=pk)
        if cash_up.collector_id == request.user.pk:
            raise ApiError("own_cash_up", "Someone else must sign off your own cash-up.")
        cash_up.signed_off_by = request.user
        cash_up.save(update_fields=["signed_off_by"])
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=cash_up,
            new={"signed_off": True},
            request=request,
        )
        return Response(CashUpResource.row(self, cash_up))


def week_charges(school_class, week_start):
    return DailyCharge.objects.filter(
        daily_list__school_class=school_class,
        daily_list__date__gte=week_start,
        daily_list__date__lt=week_start + timedelta(days=7),
    ).select_related("student")


def statement_totals(school_class, week_start) -> dict:
    pupils: dict[int, dict] = {}
    for charge in week_charges(school_class, week_start):
        row = pupils.setdefault(
            charge.student_id,
            {
                "name": f"{charge.student.first_name} {charge.student.surname}",
                "days": 0,
                "charged": 0,
                "paid": 0,
            },
        )
        if charge.status in ("ABSENT", "EXEMPT"):
            continue
        row["days"] += 1
        row["charged"] += charge.total
        row["paid"] += charge.paid
    for pk, row in pupils.items():
        row["wallet"] = services.balance(Student(pk=pk), Account.WALLET)
    return {
        "pupils": {str(pk): row for pk, row in pupils.items()},
        "charged": sum(row["charged"] for row in pupils.values()),
        "paid": sum(row["paid"] for row in pupils.values()),
    }


def statement_row(statement: WeeklyStatement) -> dict:
    return {
        "id": statement.pk,
        "class": statement.school_class.name,
        "class_id": statement.school_class_id,
        "week_start": statement.week_start,
        "status": statement.status,
        "totals": statement.totals,
        "sent_at": statement.sent_at,
    }


class StatementSerializer(serializers.Serializer):
    school_class = serializers.IntegerField()
    week_start = serializers.DateField()


class StatementsView(SchoolView):
    read_roles = (*LEADERS, *MONEY)
    write_roles = (roles.ACCOUNTANT, *APPROVERS)

    def get(self, request):
        rows = WeeklyStatement.objects.for_school(self.school).select_related("school_class")
        return Response([statement_row(row) for row in rows[:200]])

    @transaction.atomic
    def post(self, request):
        data = validated(StatementSerializer, request)
        school_class = get_object_or_404(
            SchoolClass.objects.for_school(self.school), pk=data["school_class"]
        )
        week_start = data["week_start"] - timedelta(days=data["week_start"].weekday())
        statement, _ = WeeklyStatement.objects.get_or_create(
            school=self.school, school_class=school_class, week_start=week_start
        )
        if statement.status != WeeklyStatement.Status.DRAFT:
            raise ApiError("approved", "This week's statement is already approved.")
        statement.totals = statement_totals(school_class, week_start)
        statement.save(update_fields=["totals"])
        return Response(statement_row(statement), status=201)


class StatementActionView(SchoolView):
    read_roles = (*LEADERS, *MONEY)
    write_roles = (roles.ACCOUNTANT, *APPROVERS)

    @transaction.atomic
    def post(self, request, pk, action):
        statement = get_object_or_404(WeeklyStatement.objects.for_school(self.school), pk=pk)
        if action == "approve":
            if not roles.has_role(request.user, *APPROVERS):
                raise ApiError(
                    "permission_denied", "Only the Head Teacher or Proprietor approves.", 403
                )
            statement.status, statement.approved_by = WeeklyStatement.Status.APPROVED, request.user
        else:
            if statement.status != WeeklyStatement.Status.APPROVED:
                raise ApiError("not_approved", "Approve the statement before sending it.")
            for pk_text, row in statement.totals.get("pupils", {}).items():
                pupil = Student.objects.for_school(self.school).filter(pk=pk_text).first()
                if pupil is None:
                    continue
                summary = (
                    f"{pupil.first_name}: {row['days']} days, "
                    f"charged GHS {services.money(row['charged'])}, "
                    f"paid GHS {services.money(row['paid'])}, "
                    f"wallet GHS {services.money(row['wallet'])}"
                )
                services.text_family(
                    pupil,
                    "STATEMENT",
                    Purpose.REMINDER,
                    class_name=statement.school_class.name,
                    week=statement.week_start.strftime("%d %b"),
                    summary=summary,
                )
            statement.status, statement.sent_at = WeeklyStatement.Status.SENT, timezone.now()
        statement.save()
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=statement,
            new={"status": statement.status},
            request=request,
        )
        return Response(statement_row(statement))


class PayRuleResource(Resource):
    model = PayRule
    fields = (
        "name",
        "scope",
        "school_class",
        "category",
        "method",
        "value",
        "minimum",
        "maximum",
        "shares",
        "active",
    )
    labels = ("school_class",)
    read_roles = (*LEADERS, roles.ACCOUNTANT)
    write_roles = (roles.ACCOUNTANT,)

    @classmethod
    def validate(cls, view, data, instance=None):
        scope = data.get("scope", instance.scope if instance else PayRule.Scope.CLASS)
        if scope == PayRule.Scope.CLASS and not data.get(
            "school_class", getattr(instance, "school_class", None)
        ):
            raise serializers.ValidationError({"school_class": ["Choose the class."]})
        if scope == PayRule.Scope.CATEGORY:
            if data.get("category", getattr(instance, "category", "")) not in Category.values:
                raise serializers.ValidationError({"category": ["Choose the category."]})
            shares = data.get("shares", getattr(instance, "shares", {})) or {}
            if sum(int(v) for v in shares.values()) != 100:
                raise serializers.ValidationError({"shares": ["The shares must add up to 100."]})
        if data.get("method") == PayRule.Method.PERCENT and data.get("value", 0) > 100:
            raise serializers.ValidationError({"value": ["Enter 100 or less."]})
        return data


def extra_collected(charge: DailyCharge) -> int:
    if charge.status == DailyCharge.Status.PAID:
        return charge.extra
    if charge.status == DailyCharge.Status.PART:
        return max(0, min(charge.extra, charge.paid - charge.canteen))
    return 0


def rule_amount(rule: PayRule, charges) -> int:
    collected = [extra_collected(c) for c in charges]
    if rule.method == PayRule.Method.PERCENT:
        amount = sum(collected) * rule.value // 100
    elif rule.method == PayRule.Method.PER_PUPIL_DAY:
        amount = sum(1 for value in collected if value) * rule.value
    else:
        amount = rule.value
    amount = max(amount, rule.minimum)
    return min(amount, rule.maximum) if rule.maximum else amount


def class_teacher(school_class, on_date):
    row = (
        ClassTeacherAssignment.objects.filter(
            school_class=school_class, term__start_date__lte=on_date, term__end_date__gte=on_date
        )
        .select_related("staff")
        .first()
    )
    return row.staff if row else None


def compute_pay(run: PayRun) -> None:
    run.lines.all().delete()
    totals: dict[int, int] = {}
    for rule in PayRule.objects.filter(school=run.school, active=True):
        if rule.scope == PayRule.Scope.CLASS:
            amount = rule_amount(rule, list(week_charges(rule.school_class, run.week_start)))
            staff = class_teacher(rule.school_class, run.week_start)
            if staff and amount:
                totals[staff.pk] = totals.get(staff.pk, 0) + amount
            continue
        classes = [
            c
            for c in SchoolClass.objects.filter(school=run.school)
            if services.category_of(c) == rule.category
        ]
        charges = [charge for c in classes for charge in week_charges(c, run.week_start)]
        pool = rule_amount(rule, charges)
        for staff_pk, percent in (rule.shares or {}).items():
            share = pool * int(percent) // 100
            if share:
                totals[int(staff_pk)] = totals.get(int(staff_pk), 0) + share
    for staff in Staff.objects.filter(school=run.school, pk__in=totals):
        PayLine.objects.create(school=run.school, run=run, staff=staff, amount=totals[staff.pk])


def run_row(run: PayRun) -> dict:
    lines = run.lines.select_related("staff")
    return {
        "id": run.pk,
        "week_start": run.week_start,
        "status": run.status,
        "paid_at": run.paid_at,
        "reference": run.reference,
        "lines": [
            {
                "id": line.pk,
                "staff": f"{line.staff.first_name} {line.staff.surname}",
                "amount": line.amount,
                "adjustment": line.adjustment,
                "adjustment_reason": line.adjustment_reason,
                "total": line.amount + line.adjustment,
            }
            for line in lines
        ],
        "total": sum(line.amount + line.adjustment for line in lines),
    }


class PayRunSerializer(serializers.Serializer):
    week_start = serializers.DateField()


class PayRunsView(SchoolView):
    read_roles = (*LEADERS, roles.ACCOUNTANT)
    write_roles = (roles.ACCOUNTANT,)

    def get(self, request):
        return Response([run_row(run) for run in PayRun.objects.for_school(self.school)[:100]])

    @transaction.atomic
    def post(self, request):
        week = validated(PayRunSerializer, request)["week_start"]
        week -= timedelta(days=week.weekday())
        run, _ = PayRun.objects.get_or_create(school=self.school, week_start=week)
        if run.status != PayRun.Status.DRAFT:
            raise ApiError("approved", "This week's pay is already approved.")
        compute_pay(run)
        return Response(run_row(run), status=201)


class PayLineSerializer(serializers.Serializer):
    adjustment = serializers.IntegerField(min_value=-10_000_000, max_value=10_000_000)
    adjustment_reason = serializers.CharField(max_length=200)


class PayLineView(SchoolView):
    read_roles = (*LEADERS, roles.ACCOUNTANT)
    write_roles = (roles.ACCOUNTANT,)

    @transaction.atomic
    def patch(self, request, pk):
        line = get_object_or_404(
            PayLine.objects.for_school(self.school).select_related("run"), pk=pk
        )
        if line.run.status != PayRun.Status.DRAFT:
            raise ApiError("approved", "Approved pay can't change.")
        data = validated(PayLineSerializer, request)
        line.adjustment, line.adjustment_reason = data["adjustment"], data["adjustment_reason"]
        line.save()
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=line,
            new=dict(data),
            request=request,
        )
        return Response(run_row(line.run))


class PaidSerializer(serializers.Serializer):
    reference = serializers.CharField(max_length=80, required=False, default="", allow_blank=True)


class PayRunActionView(SchoolView):
    read_roles = (*LEADERS, roles.ACCOUNTANT)
    write_roles = (roles.ACCOUNTANT, *APPROVERS)

    @transaction.atomic
    def post(self, request, pk, action):
        run = get_object_or_404(PayRun.objects.for_school(self.school), pk=pk)
        if action == "approve":
            if not roles.has_role(request.user, *APPROVERS):
                raise ApiError(
                    "permission_denied", "Only the Head Teacher or Proprietor approves pay.", 403
                )
            run.status, run.approved_by = PayRun.Status.APPROVED, request.user
        else:
            if run.status != PayRun.Status.APPROVED:
                raise ApiError("not_approved", "Pay must be approved before it is paid.")
            run.status, run.paid_at = PayRun.Status.PAID, timezone.now()
            run.reference = validated(PaidSerializer, request)["reference"]
        run.save()
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=run,
            new={"status": run.status},
            request=request,
        )
        return Response(run_row(run))
