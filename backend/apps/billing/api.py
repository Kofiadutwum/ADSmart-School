"""Billing in the admin area (business tools spec §3.8) for the Owner and Finance, the school's
own Billing page (§3.9), the prices on the website, and the Statistics page (§4)."""

import csv
import io
from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response

from apps.accounts import roles
from apps.accounts.models import User
from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.billing import services
from apps.billing.models import (
    BillAdjustment,
    BillingSettings,
    BillPayment,
    Plan,
    PlatformBill,
    SchoolGroup,
    Subscription,
)
from apps.core.exceptions import ApiError
from apps.core.resources import Resource
from apps.people.models import Parent, Staff, Student
from apps.platform_admin.permissions import PlatformView
from apps.platform_content.models import PageVisit
from apps.school.models import School
from apps.school_admin.views import SchoolView
from apps.support.models import SupportMessage, SupportThread
from apps.website.models import Lead
from apps.website.views import PublicView

FINANCE = (roles.PLATFORM_FINANCE,)


class FinanceView(PlatformView):
    read_roles = write_roles = FINANCE


class PlanResource(Resource):
    model = Plan
    fields = (
        "code",
        "name",
        "yearly_price",
        "from_price",
        "audience",
        "includes",
        "order",
        "trial_days",
        "show_on_website",
        "active",
    )
    school_scoped = False
    read_roles = write_roles = FINANCE
    deletable = False


class GroupResource(Resource):
    model = SchoolGroup
    fields = ("name", "contact_email", "contact_phone")
    shown = ("created_at",)
    school_scoped = False
    read_roles = write_roles = FINANCE


def bill_row(bill: PlatformBill, detail: bool = False) -> dict:
    row = {
        "id": bill.pk,
        "number": bill.number,
        "school": bill.school.name if bill.school_id else "",
        "school_slug": bill.school.slug if bill.school_id else "",
        "group": bill.group.name if bill.group_id else "",
        "period_start": bill.period_start,
        "period_end": bill.period_end,
        "amount": bill.amount,
        "paid": services.bill_paid(bill),
        "due": services.bill_due(bill),
        "state": services.bill_state(bill),
        "issued_on": bill.issued_on,
        "due_on": bill.due_on,
        "cancel_reason": bill.cancel_reason,
    }
    if detail:
        settings = BillingSettings.current()
        row["lines"] = [
            {"description": line.description, "amount": line.amount} for line in bill.lines.all()
        ]
        row["payments"] = [payment_row(p) for p in bill.payments.all()]
        row["adjustments"] = [
            {"kind": a.kind, "amount": a.amount, "reason": a.reason, "created_at": a.created_at}
            for a in bill.adjustments.all()
        ]
        row["business"] = {
            "name": settings.business_name,
            "address": settings.business_address,
            "tax_number": settings.tax_number,
            "bank_details": settings.bank_details,
            "momo_details": settings.momo_details,
        }
    return row


def payment_row(payment: BillPayment) -> dict:
    return {
        "id": payment.pk,
        "bill": payment.bill.number,
        "amount": payment.amount,
        "method": payment.method,
        "reference": payment.reference,
        "received_on": payment.received_on,
    }


def subscription_row(school: School) -> dict:
    subscription = (
        Subscription.objects.filter(school=school).select_related("plan", "group").first()
    )
    return {
        "slug": school.slug,
        "name": school.name,
        "plan": subscription.plan.name if subscription else "",
        "plan_id": subscription.plan_id if subscription else None,
        "price": subscription.price if subscription else 0,
        "status": subscription.status if subscription else "",
        "starts_on": subscription.starts_on if subscription else None,
        "next_bill_on": subscription.next_bill_on if subscription else None,
        "group": subscription.group.name if subscription and subscription.group_id else "",
        "group_id": subscription.group_id if subscription else None,
        "discount_percent": subscription.discount_percent if subscription else 0,
        "discount_amount": subscription.discount_amount if subscription else 0,
        "discount_reason": subscription.discount_reason if subscription else "",
        "reminders_off": subscription.reminders_off if subscription else False,
        "billing_paused": school.billing_paused,
    }


class SubscriptionsView(FinanceView):
    def get(self, request):
        return Response([subscription_row(school) for school in School.objects.order_by("name")])


class SubscriptionSerializer(serializers.Serializer):
    plan = serializers.IntegerField()
    price = serializers.IntegerField(min_value=0, required=False)
    group = serializers.IntegerField(required=False, allow_null=True)
    discount_percent = serializers.IntegerField(min_value=0, max_value=100, required=False)
    discount_amount = serializers.IntegerField(min_value=0, required=False)
    discount_reason = serializers.CharField(max_length=200, required=False, allow_blank=True)
    reminders_off = serializers.BooleanField(required=False)
    trial_days = serializers.IntegerField(min_value=0, max_value=365, required=False)


class SubscriptionView(FinanceView):
    def get(self, request, slug):
        school = get_object_or_404(School, slug=slug)
        bills = PlatformBill.objects.filter(
            Q(school=school) | Q(group__subscriptions__school=school)
        ).distinct()
        return Response({**subscription_row(school), "bills": [bill_row(b) for b in bills]})

    @transaction.atomic
    def put(self, request, slug):
        """Changing plan takes effect from the next bill; a bill already issued stays as it is."""
        school = get_object_or_404(School, slug=slug)
        data = validated(SubscriptionSerializer, request)
        plan = get_object_or_404(Plan, pk=data.pop("plan"))
        subscription = Subscription.objects.filter(school=school).first()
        if subscription is None:
            if not plan.active:
                raise ApiError("plan_off", "That plan is switched off for new schools.")
            subscription = services.subscribe(school, plan, trial_days=data.pop("trial_days", None))
        elif subscription.plan_id != plan.pk:
            subscription.plan, subscription.price = plan, plan.yearly_price
        data.pop("trial_days", None)
        if "group" in data:
            group = data.pop("group")
            subscription.group = get_object_or_404(SchoolGroup, pk=group) if group else None
        for key, value in data.items():
            setattr(subscription, key, value)
        subscription.save()
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=subscription,
            new={"plan": plan.code},
            request=request,
            school=school,
        )
        return self.get(request, slug)


class LineSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=160)
    amount = serializers.IntegerField(min_value=-100_000_000, max_value=100_000_000)


class OneOffSerializer(serializers.Serializer):
    school = serializers.SlugField(required=False)
    group = serializers.IntegerField(required=False)
    lines = LineSerializer(many=True)
    due_on = serializers.DateField(required=False)


def filtered_bills(params):
    bills = PlatformBill.objects.select_related("school", "group")
    if params.get("school"):
        bills = bills.filter(school__slug=params["school"])
    if params.get("plan"):
        bills = bills.filter(school__subscription__plan_id=params["plan"])
    if params.get("from"):
        bills = bills.filter(issued_on__gte=params["from"])
    if params.get("to"):
        bills = bills.filter(issued_on__lte=params["to"])
    rows = [bill_row(bill) for bill in bills[:1000]]
    state = params.get("state")
    return [row for row in rows if row["state"] == state] if state else rows


class BillsView(FinanceView):
    def get(self, request):
        return Response(filtered_bills(request.query_params))

    def post(self, request):
        data = validated(OneOffSerializer, request)
        school = get_object_or_404(School, slug=data["school"]) if data.get("school") else None
        group = get_object_or_404(SchoolGroup, pk=data["group"]) if data.get("group") else None
        if (school is None) == (group is None):
            raise ApiError("who", "Choose a school or a group.")
        bill = services.issue_bill(
            by=request.user,
            school=school,
            group=group,
            lines=[(line["description"], line["amount"]) for line in data["lines"]],
            due_on=data.get("due_on"),
        )
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=bill,
            new={"amount": bill.amount},
            request=request,
        )
        return Response(bill_row(bill, detail=True), status=201)


class CancelSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300)


class BillDetailView(FinanceView):
    def get(self, request, pk):
        return Response(bill_row(get_object_or_404(PlatformBill, pk=pk), detail=True))

    @transaction.atomic
    def post(self, request, pk):
        """Cancel: the bill keeps its number and needs a reason; bills are never deleted."""
        bill = get_object_or_404(PlatformBill.objects.select_for_update(), pk=pk)
        if services.bill_paid(bill) > 0:
            raise ApiError("has_payments", "Reverse or refund the payments before cancelling.")
        bill.status, bill.cancel_reason = (
            PlatformBill.Status.VOID,
            validated(CancelSerializer, request)["reason"],
        )
        bill.save(update_fields=["status", "cancel_reason"])
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=bill,
            new={"cancelled": bill.cancel_reason},
            request=request,
        )
        return Response(bill_row(bill, detail=True))


class BillPaymentSerializer(serializers.Serializer):
    amount = serializers.IntegerField(min_value=1)
    method = serializers.ChoiceField(
        choices=[c for c in BillPayment.Method.values if c != "PAYSTACK"]
    )
    reference = serializers.CharField(max_length=80, required=False, default="", allow_blank=True)
    received_on = serializers.DateField(required=False)


class BillPaymentsView(FinanceView):
    def post(self, request, pk):
        bill = get_object_or_404(PlatformBill, pk=pk)
        data = validated(BillPaymentSerializer, request)
        payment = services.record_bill_payment(
            bill, data.pop("amount"), data.pop("method"), by=request.user, **data
        )
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=payment,
            new={"amount": payment.amount},
            request=request,
        )
        return Response(bill_row(bill, detail=True), status=201)


class AdjustmentSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=BillAdjustment.Kind.choices)
    amount = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(max_length=300)


class BillAdjustmentsView(FinanceView):
    def post(self, request, pk):
        bill = get_object_or_404(PlatformBill, pk=pk)
        data = validated(AdjustmentSerializer, request)
        if data["kind"] == BillAdjustment.Kind.REFUND and not roles.has_role(
            request.user, roles.PLATFORM_OWNER
        ):
            raise ApiError("owner_only", "Only the Owner records refunds.", 403)
        adjustment = services.adjust_bill(
            bill, data["kind"], data["amount"], data["reason"], by=request.user
        )
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=adjustment,
            new=dict(data),
            request=request,
        )
        return Response(bill_row(bill, detail=True), status=201)


class PaymentsView(FinanceView):
    def get(self, request):
        payments = BillPayment.objects.select_related("bill").order_by("-received_on", "-id")
        params = request.query_params
        if params.get("method"):
            payments = payments.filter(method=params["method"])
        if params.get("from"):
            payments = payments.filter(received_on__gte=params["from"])
        if params.get("to"):
            payments = payments.filter(received_on__lte=params["to"])
        return Response([payment_row(p) for p in payments[:1000]])


def collected_between(start, end=None) -> int:
    rows = BillPayment.objects.filter(received_on__gte=start)
    if end:
        rows = rows.filter(received_on__lte=end)
    paid = rows.aggregate(t=Sum("amount"))["t"] or 0
    taken = (
        BillAdjustment.objects.filter(
            created_at__date__gte=start,
            kind__in=[BillAdjustment.Kind.REVERSAL, BillAdjustment.Kind.REFUND],
        ).aggregate(t=Sum("amount"))["t"]
        or 0
    )
    return paid - taken


def money_figures() -> dict:
    today = timezone.localdate()
    open_bills = list(PlatformBill.objects.filter(status=PlatformBill.Status.OPEN))
    overdue = [bill for bill in open_bills if bill.due_on < today]
    term_start = today.replace(month=((today.month - 1) // 4) * 4 + 1, day=1)
    return {
        "collected_month": collected_between(today.replace(day=1)),
        "collected_term": collected_between(term_start),
        "collected_year": collected_between(today.replace(month=1, day=1)),
        "outstanding": sum(services.bill_due(b) for b in open_bills),
        "overdue": sum(services.bill_due(b) for b in overdue),
        "overdue_schools": len({b.school_id or f"g{b.group_id}" for b in overdue}),
        "expected_30_days": sum(
            services.bill_due(b)
            for b in open_bills
            if today <= b.due_on <= today + timedelta(days=30)
        )
        + sum(
            s.price
            for s in Subscription.objects.filter(
                next_bill_on__range=(today, today + timedelta(days=30))
            )
        ),
    }


class OverviewView(FinanceView):
    def get(self, request):
        return Response({**money_figures(), "as_of": timezone.now()})


class SettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = BillingSettings
        exclude = ("id",)


class SettingsView(PlatformView):
    """Finance settings are the Owner's (§3.8)."""

    read_roles = FINANCE
    write_roles = ()

    def get(self, request):
        return Response(SettingsSerializer(BillingSettings.current()).data)

    def patch(self, request):
        serializer = SettingsSerializer(BillingSettings.current(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=serializer.instance,
            new=dict(request.data),
            request=request,
        )
        return Response(serializer.data)


class RunView(FinanceView):
    def post(self, request):
        return Response(services.run_billing())


def csv_response(name: str, header: list[str], rows: list[list]) -> HttpResponse:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    for row in rows:
        # Leading = + - @ would run as a formula in Excel.
        writer.writerow([f"'{v}" if isinstance(v, str) and v[:1] in "=+-@" else v for v in row])
    response = HttpResponse(buffer.getvalue(), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{name}.csv"'
    return response


class ExportBillsView(FinanceView):
    def get(self, request):
        rows = filtered_bills(request.query_params)
        return csv_response(
            "bills",
            ["Number", "School", "Group", "Issued", "Due", "Amount (GHS)", "Paid (GHS)", "State"],
            [
                [
                    r["number"],
                    r["school"],
                    r["group"],
                    r["issued_on"],
                    r["due_on"],
                    r["amount"] / 100,
                    r["paid"] / 100,
                    r["state"],
                ]
                for r in rows
            ],
        )


class ExportPaymentsView(FinanceView):
    def get(self, request):
        payments = BillPayment.objects.select_related("bill").order_by("received_on")
        return csv_response(
            "payments",
            ["Bill", "Received", "Amount (GHS)", "Method", "Reference"],
            [
                [p.bill.number, p.received_on, p.amount / 100, p.method, p.reference]
                for p in payments
            ],
        )


class ExportOutstandingView(FinanceView):
    def get(self, request):
        bills = PlatformBill.objects.filter(status=PlatformBill.Status.OPEN).select_related(
            "school", "group"
        )
        return csv_response(
            "outstanding",
            ["Bill", "School or group", "Due", "Owed (GHS)"],
            [
                [
                    b.number,
                    b.school.name if b.school_id else b.group.name,
                    b.due_on,
                    services.bill_due(b) / 100,
                ]
                for b in bills
            ],
        )


PERIODS = {"month": 30, "quarter": 91, "year": 365}


class StatisticsView(PlatformView):
    """Real numbers only, demo records never counted, with an "as of" time (§4)."""

    read_roles = write_roles = FINANCE

    def get(self, request):
        days = PERIODS.get(request.query_params.get("period", ""))
        since = timezone.now() - timedelta(days=days) if days else None
        schools = School.objects.all()
        twelve = timezone.now() - timedelta(days=365)
        month_ago = timezone.now() - timedelta(days=30)
        leads = Lead.objects.all() if since is None else Lead.objects.filter(created_at__gte=since)
        per_school = []
        for school in schools.order_by("name"):
            signed_in = User.objects.filter(school=school, last_login__gte=month_ago).count()
            per_school.append(
                {
                    "name": school.name,
                    "pupils": Student.objects.for_school(school).filter(is_demo=False).count(),
                    "staff": Staff.objects.for_school(school).filter(is_demo=False).count(),
                    "parents": Parent.objects.for_school(school).filter(is_demo=False).count(),
                    "signed_in_30_days": signed_in,
                    "quiet": signed_in == 0,
                }
            )
        threads = SupportThread.objects.all()
        first_replies = []
        for thread in threads.filter(created_at__gte=since) if since else threads:
            reply = (
                SupportMessage.objects.filter(thread=thread, from_platform=True)
                .order_by("created_at")
                .first()
            )
            if reply:
                first_replies.append((reply.created_at - thread.created_at).total_seconds() / 3600)
        visits = (
            PageVisit.objects.all()
            if since is None
            else PageVisit.objects.filter(day__gte=since.date())
        )
        total_visits = visits.aggregate(t=Sum("count"))["t"] or 0
        data = {
            "as_of": timezone.now(),
            "schools": {
                "total": schools.count(),
                "by_status": dict(
                    Subscription.objects.values("status")
                    .annotate(n=Count("id"))
                    .values_list("status", "n")
                ),
                "new_per_month": [
                    {"month": row["month"], "count": row["n"]}
                    for row in schools.filter(created_at__gte=twelve)
                    .annotate(month=TruncMonth("created_at"))
                    .values("month")
                    .annotate(n=Count("id"))
                    .order_by("month")
                ],
            },
            "join_requests": {
                "total": leads.count(),
                "by_status": dict(
                    leads.values("status").annotate(n=Count("id")).values_list("status", "n")
                ),
            },
            "sizes": per_school,
            "support": {
                "open": SupportThread.objects.filter(status=SupportThread.Status.OPEN).count(),
                "average_hours_to_first_reply": round(sum(first_replies) / len(first_replies), 1)
                if first_replies
                else None,
            },
            "website": {
                "visits": total_visits,
                "top_pages": list(
                    visits.values("path")
                    .annotate(n=Sum("count"))
                    .order_by("-n")
                    .values_list("path", "n")[:10]
                ),
                "join_requests_per_100_visits": round(leads.count() * 100 / total_visits, 1)
                if total_visits
                else None,
            },
        }
        if roles.has_role(request.user, roles.PLATFORM_OWNER, roles.PLATFORM_FINANCE):
            data["money"] = money_figures()
        return Response(data)


class PricesView(PublicView):
    """The prices section of the owner's website: active plans shown on the website only."""

    def get(self, request):
        plans = Plan.objects.filter(active=True, show_on_website=True)
        return Response(
            [
                {
                    "name": plan.name,
                    "audience": plan.audience,
                    "yearly_price": plan.yearly_price,
                    "from_price": plan.from_price,
                    "includes": [line for line in plan.includes.splitlines() if line.strip()],
                }
                for plan in plans
            ]
        )


SCHOOL_BILLING = (roles.ADMINISTRATOR, roles.PROPRIETOR, roles.ACCOUNTANT)


class SchoolBillingBase(SchoolView):
    """The school's own Billing page; it works while the school is paused, so it can pay."""

    read_roles = write_roles = SCHOOL_BILLING
    allowed_while_paused = True

    def bills(self):
        subscription = Subscription.objects.filter(school=self.school).first()
        query = Q(school=self.school)
        if subscription and subscription.group_id:
            query |= Q(group_id=subscription.group_id)
        return PlatformBill.objects.filter(query).select_related("school", "group")


class SchoolBillingView(SchoolBillingBase):
    def get(self, request):
        bills = list(self.bills())
        settings = BillingSettings.current()
        return Response(
            {
                **subscription_row(self.school),
                "balance_due": sum(services.bill_due(bill) for bill in bills),
                "bills": [bill_row(bill) for bill in bills],
                "payments": [
                    payment_row(p)
                    for p in BillPayment.objects.filter(bill__in=bills).select_related("bill")
                ],
                "how_to_pay": {"bank": settings.bank_details, "momo": settings.momo_details},
            }
        )


class SchoolBillView(SchoolBillingBase):
    def get(self, request, pk):
        return Response(bill_row(get_object_or_404(self.bills(), pk=pk), detail=True))


class SchoolBillPayView(SchoolBillingBase):
    """Pay now: Paystack's page opens; the bill is marked paid only after Paystack confirms."""

    def post(self, request, pk):
        from apps.finance.models import OnlinePayment
        from apps.finance.online import start_payment

        bill = get_object_or_404(self.bills(), pk=pk)
        due = services.bill_due(bill)
        if due <= 0:
            raise ApiError("paid", "Nothing is due on this bill.")
        return Response(
            start_payment(
                purpose=OnlinePayment.Purpose.PLATFORM_BILL,
                amount=due,
                school=self.school,
                bill=bill,
                email=request.user.email,
                phone=request.user.phone,
                callback=self.school.base_url() + "/billing",
            )
        )
