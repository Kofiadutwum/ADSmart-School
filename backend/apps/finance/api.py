"""Fees and payments in the school portal (SMS spec §13): the Accountant runs them, the Head
Teacher or Proprietor approves discounts and refunds, and leaders can read everything."""

from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response

from apps.academics.models import SchoolClass, Term
from apps.academics.structure import BANDS
from apps.accounts import roles
from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError
from apps.core.resources import Resource
from apps.finance import services
from apps.finance.models import (
    Account,
    Discount,
    FeeStructure,
    Invoice,
    LedgerEntry,
    OptionalCharge,
    Payment,
    RefundRequest,
)
from apps.people.models import Student
from apps.school_admin.class_lists import pupils_in
from apps.school_admin.views import SchoolView

READ = (roles.ACCOUNTANT, roles.ADMINISTRATOR, roles.HEAD_TEACHER, roles.PROPRIETOR)
WRITE = (roles.ACCOUNTANT,)
APPROVERS = (roles.HEAD_TEACHER, roles.PROPRIETOR)


class MoneyView(SchoolView):
    read_roles = READ
    write_roles = WRITE

    def pupil(self, pk) -> Student:
        return get_object_or_404(Student.objects.for_school(self.school), pk=pk)


class FeeResource(Resource):
    model = FeeStructure
    fields = (
        "academic_year",
        "term",
        "name",
        "charge_type",
        "band",
        "school_class",
        "amount",
        "optional",
    )
    labels = ("academic_year", "term", "school_class")
    read_roles, write_roles = READ, WRITE
    filters = {"year": "academic_year_id", "term": "term_id"}

    @classmethod
    def validate(cls, view, data, instance=None):
        if data.get("band") and data["band"] not in BANDS:
            raise serializers.ValidationError({"band": ["Choose a level the school offers."]})
        return data


class OptionalChargeResource(Resource):
    model = OptionalCharge
    fields = ("student", "fee")
    labels = ("student", "fee")
    read_roles, write_roles = READ, WRITE
    filters = {"student": "student_id", "fee": "fee_id"}

    @classmethod
    def validate(cls, view, data, instance=None):
        if "fee" in data and not data["fee"].optional:
            raise serializers.ValidationError({"fee": ["That charge applies to everyone already."]})
        return data


class DiscountResource(Resource):
    model = Discount
    fields = ("student", "kind", "percent", "amount", "reason", "active")
    shown = ("status",)
    labels = ("student", "approved_by")
    read_roles, write_roles = READ, WRITE
    filters = {"student": "student_id", "status": "status"}

    @classmethod
    def validate(cls, view, data, instance=None):
        if data.get("percent", 0) > 100:
            raise serializers.ValidationError({"percent": ["Enter 100 or less."]})
        if instance is not None and any(k in data for k in ("percent", "amount", "kind")):
            data["status"], data["approved_by"] = Discount.Status.PENDING, None
        return data


class DecideSerializer(serializers.Serializer):
    approve = serializers.BooleanField()


class DiscountDecideView(SchoolView):
    read_roles = write_roles = APPROVERS

    @transaction.atomic
    def post(self, request, pk):
        discount = get_object_or_404(Discount.objects.for_school(self.school), pk=pk)
        approve = validated(DecideSerializer, request)["approve"]
        discount.status = Discount.Status.APPROVED if approve else Discount.Status.REJECTED
        discount.approved_by = request.user
        discount.save(update_fields=["status", "approved_by"])
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=discount,
            new={"status": discount.status},
            request=request,
        )
        return Response(DiscountResource.row(self, discount))


class RefundResource(Resource):
    model = RefundRequest
    fields = ("student", "account", "amount", "reason")
    shown = ("status", "created_at", "decided_at")
    labels = ("student", "raised_by", "decided_by")
    read_roles, write_roles = READ, WRITE
    stamp_user = "raised_by"
    deletable = False
    filters = {"status": "status"}

    @classmethod
    def validate(cls, view, data, instance=None):
        if instance is not None and instance.status != RefundRequest.Status.PENDING:
            raise ApiError("decided", "A decided refund can't change.")
        if data.get("amount") == 0:
            raise serializers.ValidationError({"amount": ["Enter an amount above zero."]})
        return data


class RefundDecideView(SchoolView):
    read_roles = write_roles = APPROVERS

    def post(self, request, pk):
        refund = get_object_or_404(RefundRequest.objects.for_school(self.school), pk=pk)
        approve = validated(DecideSerializer, request)["approve"]
        refund = services.decide_refund(refund, by=request.user, approve=approve)
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=refund,
            new={"status": refund.status},
            request=request,
        )
        return Response(RefundResource.row(self, refund))


def invoice_row(invoice: Invoice, detail: bool = False) -> dict:
    row = {
        "id": invoice.pk,
        "number": invoice.number,
        "student": invoice.student_id,
        "student_name": f"{invoice.student.first_name} {invoice.student.surname}",
        "student_id": invoice.student.student_id,
        "term": str(invoice.term),
        "term_id": invoice.term_id,
        "issued_on": invoice.issued_on,
        "due_on": invoice.due_on,
        "status": invoice.status,
        "total": invoice.total,
        "arrears": invoice.arrears,
    }
    if detail:
        row["lines"] = [
            {"description": line.description, "amount": line.amount, "kind": line.kind}
            for line in invoice.lines.all()
        ]
        row["instalments"] = [
            {
                "id": item.pk,
                "due_on": item.due_on,
                "amount": item.amount,
                "outstanding": services.outstanding_on(item),
            }
            for item in invoice.instalments.all()
        ]
        row["balance"] = services.balance(invoice.student)
        row["school"] = {
            "name": invoice.school.name,
            "phone": invoice.school.phone,
            "email": invoice.school.email,
        }
    return row


class IssueSerializer(serializers.Serializer):
    term = serializers.IntegerField()
    students = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
    school_class = serializers.IntegerField(required=False)
    due_on = serializers.DateField(required=False)


class InvoicesView(MoneyView):
    def get(self, request):
        invoices = Invoice.objects.for_school(self.school).select_related(
            "student", "term", "term__academic_year"
        )
        params = request.query_params
        if params.get("term"):
            invoices = invoices.filter(term_id=params["term"])
        if params.get("status") in Invoice.Status.values:
            invoices = invoices.filter(status=params["status"])
        if params.get("student"):
            invoices = invoices.filter(student_id=params["student"])
        if params.get("class"):
            invoices = invoices.filter(
                student__enrolments__school_class_id=params["class"],
                student__enrolments__end_date__isnull=True,
            ).distinct()
        return Response([invoice_row(row) for row in invoices[:500]])

    def post(self, request):
        data = validated(IssueSerializer, request)
        term = get_object_or_404(Term.objects.for_school(self.school), pk=data["term"])
        pupils = Student.objects.for_school(self.school).filter(status=Student.Status.ACTIVE)
        if data.get("school_class"):
            klass = get_object_or_404(
                SchoolClass.objects.for_school(self.school), pk=data["school_class"]
            )
            pupils = pupils_in(klass).filter(status=Student.Status.ACTIVE)
        elif data["students"]:
            pupils = pupils.filter(pk__in=data["students"])
        issued, skipped = 0, []
        for pupil in pupils:
            if Invoice.objects.filter(student=pupil, term=term).exists():
                skipped.append(f"{pupil.first_name} {pupil.surname}")
                continue
            services.issue_invoice(pupil, term, by=request.user, due_on=data.get("due_on"))
            issued += 1
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity_type="finance.invoice",
            entity_id=str(term.pk),
            new={"issued": issued},
            request=request,
        )
        return Response({"issued": issued, "skipped": skipped}, status=201)


class InvoiceDetailView(MoneyView):
    def get(self, request, pk):
        invoice = get_object_or_404(
            Invoice.objects.for_school(self.school).select_related("student", "term"), pk=pk
        )
        return Response(invoice_row(invoice, detail=True))


class InvoiceCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=200)


class InvoiceCancelView(MoneyView):
    """Cancelling reverses the invoice's own charges and discounts in the ledger."""

    write_roles = (roles.ACCOUNTANT, *APPROVERS)

    @transaction.atomic
    def post(self, request, pk):
        invoice = get_object_or_404(
            Invoice.objects.for_school(self.school).select_for_update(), pk=pk
        )
        if invoice.status == Invoice.Status.CANCELLED:
            raise ApiError("cancelled", "This invoice is already cancelled.")
        reason = validated(InvoiceCancelSerializer, request)["reason"]
        for entry in invoice.ledger.filter(reversed_by__isnull=True, reverses__isnull=True):
            services.post(
                invoice.student,
                entry.account,
                LedgerEntry.Kind.REVERSAL,
                -entry.amount,
                f"Cancelled {invoice.number}: {reason}",
                by=request.user,
                invoice=invoice,
                reverses=entry,
            )
        invoice.status = Invoice.Status.CANCELLED
        invoice.save(update_fields=["status"])
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=invoice,
            new={"cancelled": reason},
            request=request,
        )
        return Response(invoice_row(invoice, detail=True))


class InstalmentSerializer(serializers.Serializer):
    due_on = serializers.DateField()
    amount = serializers.IntegerField(min_value=1)


class PlanSerializer(serializers.Serializer):
    instalments = InstalmentSerializer(many=True)


class InstalmentsView(MoneyView):
    def post(self, request, pk):
        invoice = get_object_or_404(Invoice.objects.for_school(self.school), pk=pk)
        plan = validated(PlanSerializer, request)["instalments"]
        services.set_instalments(invoice, plan)
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=invoice,
            new={"instalments": len(plan)},
            request=request,
        )
        return Response(invoice_row(invoice, detail=True))


def payment_row(payment: Payment) -> dict:
    return {
        "id": payment.pk,
        "receipt_number": payment.receipt_number,
        "student": payment.student_id,
        "student_name": f"{payment.student.first_name} {payment.student.surname}",
        "amount": payment.amount,
        "method": payment.method,
        "purpose": payment.purpose,
        "reference": payment.reference,
        "status": payment.status,
        "received_by": str(payment.received_by) if payment.received_by else "",
        "received_at": payment.received_at,
        "note": payment.note,
    }


OFFICE_METHODS = [
    Payment.Method.CASH,
    Payment.Method.BANK,
    Payment.Method.MOMO,
    Payment.Method.WALLET,
]


class PaymentSerializer(serializers.Serializer):
    student = serializers.IntegerField()
    amount = serializers.IntegerField(min_value=1, max_value=100_000_000)
    method = serializers.ChoiceField(choices=OFFICE_METHODS)
    purpose = serializers.ChoiceField(
        choices=[Payment.Purpose.FEES, Payment.Purpose.WALLET], default=Payment.Purpose.FEES
    )
    reference = serializers.CharField(max_length=80, required=False, default="", allow_blank=True)
    payer_phone = serializers.CharField(max_length=16, required=False, default="", allow_blank=True)
    note = serializers.CharField(max_length=200, required=False, default="", allow_blank=True)


class PaymentsView(MoneyView):
    def get(self, request):
        payments = Payment.objects.for_school(self.school).select_related("student", "received_by")
        params = request.query_params
        if params.get("student"):
            payments = payments.filter(student_id=params["student"])
        if params.get("date"):
            payments = payments.filter(received_at__date=params["date"])
        if params.get("method") in Payment.Method.values:
            payments = payments.filter(method=params["method"])
        return Response([payment_row(row) for row in payments[:500]])

    def post(self, request):
        data = validated(PaymentSerializer, request)
        pupil = self.pupil(data.pop("student"))
        payment = services.record_payment(
            pupil, data.pop("amount"), data.pop("method"), by=request.user, **data
        )
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=payment,
            new={"amount": payment.amount},
            request=request,
        )
        return Response(payment_row(payment), status=201)


class ReverseSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=200)


class PaymentDetailView(MoneyView):
    write_roles = (roles.ACCOUNTANT, *APPROVERS)

    def payment(self, pk) -> Payment:
        return get_object_or_404(
            Payment.objects.for_school(self.school).select_related("student"), pk=pk
        )

    def get(self, request, pk):
        """The receipt."""
        payment = self.payment(pk)
        return Response(
            {
                **payment_row(payment),
                "student_id": payment.student.student_id,
                "school": {
                    "name": self.school.name,
                    "phone": self.school.phone,
                    "email": self.school.email,
                },
                "balance_after": services.balance(
                    payment.student, services.PURPOSE_ACCOUNT[payment.purpose]
                ),
            }
        )

    def post(self, request, pk):
        """Reverse the payment, with its reason (never deleted)."""
        payment = self.payment(pk)
        reason = validated(ReverseSerializer, request)["reason"]
        payment = services.reverse_payment(payment, by=request.user, reason=reason)
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=payment,
            new={"reversed": reason},
            request=request,
        )
        return Response(payment_row(payment))


def entry_row(entry: LedgerEntry) -> dict:
    return {
        "id": entry.pk,
        "account": entry.account,
        "kind": entry.kind,
        "amount": entry.amount,
        "description": entry.description,
        "created_at": entry.created_at,
    }


class PupilAccountView(MoneyView):
    def get(self, request, pk):
        pupil = self.pupil(pk)
        account = request.query_params.get("account")
        entries = LedgerEntry.objects.filter(student=pupil)
        if account in Account.values:
            entries = entries.filter(account=account)
        totals = dict(
            LedgerEntry.objects.filter(student=pupil)
            .values("account")
            .annotate(total=Sum("amount"))
            .values_list("account", "total")
        )
        return Response(
            {
                "student": {
                    "id": pupil.pk,
                    "name": f"{pupil.first_name} {pupil.surname}",
                    "student_id": pupil.student_id,
                },
                "balances": {key: totals.get(key, 0) for key in Account.values},
                "entries": [
                    entry_row(entry) for entry in entries.order_by("-created_at", "-id")[:300]
                ],
                "invoices": [
                    invoice_row(i)
                    for i in Invoice.objects.filter(student=pupil).select_related("student", "term")
                ],
            }
        )


class AdjustSerializer(serializers.Serializer):
    account = serializers.ChoiceField(choices=Account.choices)
    amount = serializers.IntegerField(min_value=-100_000_000, max_value=100_000_000)
    reason = serializers.CharField(max_length=160)


class AdjustView(MoneyView):
    """Corrections need a leader: the Head Teacher or Proprietor."""

    write_roles = APPROVERS

    def post(self, request, pk):
        pupil = self.pupil(pk)
        data = validated(AdjustSerializer, request)
        entry = services.adjust(
            pupil, data["account"], data["amount"], data["reason"], by=request.user
        )
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=entry,
            new=dict(data),
            request=request,
        )
        return Response(entry_row(entry), status=201)


def owed_by_pupil(school):
    return (
        LedgerEntry.objects.filter(school=school, account=Account.FEES)
        .values("student")
        .annotate(total=Sum("amount"))
        .filter(total__gt=0)
    )


class SummaryView(MoneyView):
    def get(self, request):
        today = timezone.localdate()
        confirmed = Payment.objects.for_school(self.school).filter(status=Payment.Status.CONFIRMED)
        week_start = today - timedelta(days=today.weekday())
        term = (
            Term.objects.for_school(self.school)
            .filter(start_date__lte=today, end_date__gte=today)
            .first()
        )
        owed = [row["total"] for row in owed_by_pupil(self.school)]

        def total(rows):
            return rows.aggregate(t=Sum("amount"))["t"] or 0

        return Response(
            {
                "today": total(confirmed.filter(received_at__date=today)),
                "this_week": total(confirmed.filter(received_at__date__gte=week_start)),
                "this_term": total(confirmed.filter(received_at__date__gte=term.start_date))
                if term
                else 0,
                "outstanding": sum(owed),
                "debtors": len(owed),
                "by_method_today": list(
                    confirmed.filter(received_at__date=today)
                    .values("method")
                    .annotate(total=Sum("amount"), count=Count("id"))
                ),
                "pending_refunds": RefundRequest.objects.for_school(self.school)
                .filter(status=RefundRequest.Status.PENDING)
                .count(),
                "pending_discounts": Discount.objects.for_school(self.school)
                .filter(status=Discount.Status.PENDING)
                .count(),
            }
        )


def class_of(pupil) -> str:
    klass = next((e.school_class for e in pupil.enrolments.all() if e.end_date is None), None)
    return klass.name if klass else ""


class DebtorsView(MoneyView):
    def get(self, request):
        totals = {row["student"]: row["total"] for row in owed_by_pupil(self.school)}
        pupils = Student.objects.filter(pk__in=totals).prefetch_related("enrolments__school_class")
        rows = [
            {
                "id": pupil.pk,
                "name": f"{pupil.first_name} {pupil.surname}",
                "student_id": pupil.student_id,
                "class": class_of(pupil),
                "owed": totals[pupil.pk],
            }
            for pupil in pupils
        ]
        return Response(sorted(rows, key=lambda row: -row["owed"]))


class ClassFinanceView(MoneyView):
    """Class financial analysis (SMS spec §31): billed, paid and owed per class for a term."""

    def get(self, request):
        terms = Term.objects.for_school(self.school)
        term = terms.filter(pk=request.query_params.get("term") or 0).first() or (
            terms.filter(start_date__lte=timezone.localdate()).order_by("-start_date").first()
        )
        if term is None:
            return Response({"term": "", "classes": []})
        rows = []
        for klass in SchoolClass.objects.for_school(self.school).filter(
            academic_year=term.academic_year
        ):
            pupils = pupils_in(klass)
            invoices = Invoice.objects.filter(term=term, student__in=pupils).exclude(
                status=Invoice.Status.CANCELLED
            )
            owing = list(
                LedgerEntry.objects.filter(student__in=pupils, account=Account.FEES)
                .values("student")
                .annotate(total=Sum("amount"))
                .filter(total__gt=0)
            )
            rows.append(
                {
                    "class": klass.name,
                    "class_id": klass.pk,
                    "pupils": pupils.count(),
                    "billed": invoices.aggregate(t=Sum("total"))["t"] or 0,
                    "owed": sum(row["total"] for row in owing),
                    "paid_in_full": invoices.filter(status=Invoice.Status.PAID).count(),
                    "debtors": len(owing),
                }
            )
        return Response({"term": str(term), "classes": rows})


class WalletsView(MoneyView):
    def get(self, request):
        rows = (
            LedgerEntry.objects.filter(school=self.school, account=Account.WALLET)
            .values("student", "student__first_name", "student__surname", "student__student_id")
            .annotate(total=Sum("amount"))
            .filter(~Q(total=0))
            .order_by("student__surname")
        )
        return Response(
            [
                {
                    "id": row["student"],
                    "name": f"{row['student__first_name']} {row['student__surname']}",
                    "student_id": row["student__student_id"],
                    "balance": row["total"],
                }
                for row in rows
            ]
        )
