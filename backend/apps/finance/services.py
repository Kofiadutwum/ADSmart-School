"""School money (SMS spec §13): invoices from the fee structure, payments with gapless receipts,
the append-only ledger, the prepaid wallet, refunds and reversals. Amounts are pesewas."""

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from apps.academics.structure import BANDS
from apps.core.exceptions import ApiError
from apps.finance.models import (
    Account,
    Counter,
    Discount,
    FeeStructure,
    Instalment,
    Invoice,
    InvoiceLine,
    LedgerEntry,
    OptionalCharge,
    Payment,
    RefundRequest,
)
from apps.notifications.sms import Purpose, send_sms
from apps.notifications.templates import render
from apps.people.models import Enrolment, Guardianship


def money(pesewas: int) -> str:
    return f"{pesewas / 100:,.2f}"


def next_number(school, kind: str, prefix: str, year: int | None = None) -> str:
    """Gapless per school and year: the counter row is locked until the transaction ends."""
    year = year or timezone.localdate().year
    Counter.objects.get_or_create(school=school, kind=kind, year=year)
    counter = Counter.objects.select_for_update().get(school=school, kind=kind, year=year)
    counter.last += 1
    counter.save(update_fields=["last"])
    return f"{prefix}-{year}-{counter.last:05d}"


def balance(student, account: str = Account.FEES) -> int:
    total = LedgerEntry.objects.filter(student=student, account=account).aggregate(total=Sum("amount"))
    return total["total"] or 0


def post(student, account: str, kind: str, amount: int, description: str, *, by=None, school=None, **links):
    return LedgerEntry.objects.create(
        school=school or student.school,
        student=student,
        account=account,
        kind=kind,
        amount=amount,
        description=description[:200],
        created_by=by,
        **links,
    )


def current_class(student):
    enrolment = (
        Enrolment.objects.filter(student=student, end_date__isnull=True)
        .select_related("school_class")
        .order_by("-start_date")
        .first()
    )
    return enrolment.school_class if enrolment else None


def category_of(school_class) -> str:
    return BANDS[school_class.band].category if school_class else ""


def fees_for(student, term) -> list[FeeStructure]:
    klass = current_class(student)
    fees = FeeStructure.objects.filter(school=student.school, academic_year=term.academic_year).filter(
        Q(term=term) | Q(term__isnull=True)
    )
    if klass:
        fees = fees.filter(Q(band="") | Q(band=klass.band)).filter(
            Q(school_class__isnull=True) | Q(school_class=klass)
        )
    else:
        fees = fees.filter(band="", school_class__isnull=True)
    opted = set(OptionalCharge.objects.filter(student=student).values_list("fee_id", flat=True))
    return [fee for fee in fees.order_by("name") if not fee.optional or fee.pk in opted]


@transaction.atomic
def issue_invoice(student, term, *, by=None, due_on=None) -> Invoice:
    """This term's charges less approved discounts; earlier debt is shown as arrears (SMS §13)."""
    if Invoice.objects.filter(student=student, term=term).exists():
        raise ApiError("already_invoiced", f"{student} already has an invoice for this term.")
    arrears = balance(student)
    fees = fees_for(student, term)
    charges = sum(fee.amount for fee in fees)
    discounts = []
    for discount in Discount.objects.filter(student=student, status=Discount.Status.APPROVED, active=True):
        value = min(charges * discount.percent // 100 + discount.amount, charges - sum(v for _, v in discounts))
        if value > 0:
            discounts.append((discount, value))
    total = charges - sum(value for _, value in discounts)
    today = timezone.localdate()
    invoice = Invoice.objects.create(
        student=student,
        term=term,
        number=next_number(student.school, "INVOICE", "INV", term.start_date.year),
        issued_on=today,
        due_on=due_on or max(term.start_date, today),
        total=total,
        arrears=arrears,
    )
    for fee in fees:
        InvoiceLine.objects.create(school=invoice.school, invoice=invoice, description=fee.name, amount=fee.amount, fee=fee)
        post(student, Account.FEES, LedgerEntry.Kind.CHARGE, fee.amount, f"{fee.name}, {term}", by=by, invoice=invoice)
    for discount, value in discounts:
        label = f"{discount.get_kind_display()} discount"
        InvoiceLine.objects.create(
            school=invoice.school, invoice=invoice, description=label, amount=-value, kind=InvoiceLine.Kind.DISCOUNT
        )
        post(student, Account.FEES, LedgerEntry.Kind.DISCOUNT, -value, f"{label}, {term}", by=by, invoice=invoice)
    if arrears:
        InvoiceLine.objects.create(
            school=invoice.school,
            invoice=invoice,
            description="Owed from before" if arrears > 0 else "In credit from before",
            amount=arrears,
            kind=InvoiceLine.Kind.ARREARS,
        )
    settle_invoices(student)
    return invoice


def settle_invoices(student) -> None:
    """Open invoices are marked paid once nothing is owed, and reopened if a debt returns."""
    if balance(student) <= 0:
        Invoice.objects.filter(student=student, status=Invoice.Status.OPEN).update(status=Invoice.Status.PAID)
    else:
        latest = Invoice.objects.filter(student=student).exclude(status=Invoice.Status.CANCELLED).first()
        if latest and latest.status == Invoice.Status.PAID:
            latest.status = Invoice.Status.OPEN
            latest.save(update_fields=["status"])


@transaction.atomic
def set_instalments(invoice: Invoice, plan: list[dict]) -> list[Instalment]:
    owed = invoice.total + max(invoice.arrears, 0)
    if sum(item["amount"] for item in plan) != owed:
        raise ApiError("plan_total", f"The instalments must add up to GHS {money(owed)}.")
    invoice.instalments.all().delete()
    return [
        Instalment.objects.create(school=invoice.school, invoice=invoice, due_on=item["due_on"], amount=item["amount"])
        for item in sorted(plan, key=lambda item: item["due_on"])
    ]


def outstanding_on(instalment: Instalment) -> int:
    """What is still owed toward this and earlier instalments: the balance less later ones."""
    later = Instalment.objects.filter(invoice=instalment.invoice, due_on__gt=instalment.due_on).aggregate(
        total=Sum("amount")
    )["total"] or 0
    return max(0, min(instalment.amount, balance(instalment.invoice.student) - later))


def payers(student) -> list[str]:
    rows = Guardianship.objects.filter(student=student).select_related("parent")
    chosen = [row for row in rows if row.is_payer or row.is_primary_contact] or list(rows)
    return sorted({row.parent.phone for row in chosen if row.parent.phone})


def text_family(student, key: str, purpose: str, **context) -> int:
    body = render(student.school, key, pupil=student.first_name, **context)
    sent = 0
    for phone in payers(student):
        sent += send_sms(phone, body, purpose=purpose, school=student.school).status == "SENT"
    return sent


PURPOSE_ACCOUNT = {
    Payment.Purpose.FEES: Account.FEES,
    Payment.Purpose.WALLET: Account.WALLET,
    Payment.Purpose.BOOKSHOP: Account.BOOKSHOP,
    Payment.Purpose.UNIFORM: Account.UNIFORM,
}


@transaction.atomic
def record_payment(
    student,
    amount: int,
    method: str,
    *,
    by=None,
    purpose: str = Payment.Purpose.FEES,
    reference: str = "",
    payer_phone: str = "",
    note: str = "",
    order=None,
    notify: bool = True,
) -> Payment:
    if amount <= 0:
        raise ApiError("bad_amount", "Enter an amount above zero.")
    if method == Payment.Method.WALLET:
        if purpose == Payment.Purpose.WALLET:
            raise ApiError("bad_method", "The wallet can't top itself up.")
        if balance(student, Account.WALLET) < amount:
            raise ApiError("wallet_short", "There isn't enough in the wallet.")
    payment = Payment.objects.create(
        student=student,
        amount=amount,
        method=method,
        purpose=purpose,
        reference=reference,
        payer_phone=payer_phone,
        note=note,
        order=order,
        received_by=by,
        confirmed_at=timezone.now(),
        receipt_number=next_number(student.school, "RECEIPT", "RCT"),
    )
    label = f"{payment.get_method_display()} payment {payment.receipt_number}"
    if method == Payment.Method.WALLET:
        post(student, Account.WALLET, LedgerEntry.Kind.SPEND, -amount, label, by=by, payment=payment)
    if purpose == Payment.Purpose.WALLET:
        post(student, Account.WALLET, LedgerEntry.Kind.TOP_UP, amount, label, by=by, payment=payment)
    else:
        post(student, PURPOSE_ACCOUNT[purpose], LedgerEntry.Kind.PAYMENT, -amount, label, by=by, payment=payment)
    if purpose == Payment.Purpose.FEES:
        settle_invoices(student)
    if notify:
        transaction.on_commit(
            lambda: text_family(
                student, "RECEIPT", Purpose.RECEIPT, amount=money(amount), receipt=payment.receipt_number
            )
        )
    return payment


@transaction.atomic
def reverse_payment(payment: Payment, *, by, reason: str) -> Payment:
    payment = Payment.objects.select_for_update().get(pk=payment.pk)
    if payment.status == Payment.Status.REVERSED:
        raise ApiError("already_reversed", "This payment has already been reversed.")
    for entry in payment.ledger.filter(reversed_by__isnull=True, reverses__isnull=True):
        post(
            payment.student,
            entry.account,
            LedgerEntry.Kind.REVERSAL,
            -entry.amount,
            f"Reversal of {payment.receipt_number}: {reason}",
            by=by,
            payment=payment,
            reverses=entry,
        )
    payment.status = Payment.Status.REVERSED
    payment.save(update_fields=["status"])
    settle_invoices(payment.student)
    return payment


@transaction.atomic
def decide_refund(refund: RefundRequest, *, by, approve: bool) -> RefundRequest:
    """The Head Teacher or Proprietor decides; an approved refund is paid out of what is held."""
    refund = RefundRequest.objects.select_for_update().get(pk=refund.pk)
    if refund.status != RefundRequest.Status.PENDING:
        raise ApiError("decided", "This refund has already been decided.")
    if approve:
        wallet = refund.account == Account.WALLET
        held = balance(refund.student, refund.account) if wallet else -balance(refund.student, refund.account)
        if held < refund.amount:
            raise ApiError("not_enough_credit", f"Only GHS {money(max(held, 0))} is held to refund.")
        amount = -refund.amount if wallet else refund.amount
        post(refund.student, refund.account, LedgerEntry.Kind.REFUND, amount, f"Refund: {refund.reason}", by=by)
    refund.status = RefundRequest.Status.APPROVED if approve else RefundRequest.Status.REJECTED
    refund.decided_by, refund.decided_at = by, timezone.now()
    refund.save()
    return refund


@transaction.atomic
def adjust(student, account: str, amount: int, reason: str, *, by) -> LedgerEntry:
    """A correction, positive or negative, with its reason (never an edit of an old entry)."""
    if not amount:
        raise ApiError("bad_amount", "Enter an amount.")
    entry = post(student, account, LedgerEntry.Kind.ADJUSTMENT, amount, f"Adjustment: {reason}", by=by)
    if account == Account.FEES:
        settle_invoices(student)
    return entry
