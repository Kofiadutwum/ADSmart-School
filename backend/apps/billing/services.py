"""Billing schools (business tools spec §3): starting plans, subscriptions with their own price,
yearly bills numbered ADS-YYYY-NNNN without gaps, part payments, credits, reversals and refunds,
reminders and (when switched on) pausing for non-payment."""

from datetime import timedelta

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.accounts import roles
from apps.accounts.models import User
from apps.billing.models import (
    BillAdjustment,
    BillCounter,
    BillingSettings,
    BillLine,
    BillPayment,
    Plan,
    PlatformBill,
    Subscription,
)
from apps.core.exceptions import ApiError
from apps.notifications.sms import Purpose, send_sms


def money(pesewas: int) -> str:
    return f"{pesewas / 100:,.2f}"


def next_bill_number(prefix: str = "ADS", year: int | None = None) -> str:
    year = year or timezone.localdate().year
    BillCounter.objects.get_or_create(kind=prefix, year=year)
    counter = BillCounter.objects.select_for_update().get(kind=prefix, year=year)
    counter.last += 1
    counter.save(update_fields=["last"])
    return f"{prefix}-{year}-{counter.last:04d}"


@transaction.atomic
def subscribe(school, plan: Plan, *, starts_on=None, trial_days: int | None = None) -> Subscription:
    """A new school starts on trial; its first bill is due when the trial ends."""
    starts_on = starts_on or timezone.localdate()
    days = plan.trial_days if trial_days is None else trial_days
    trial_end = starts_on + timedelta(days=days)
    subscription, _ = Subscription.objects.update_or_create(
        school=school,
        defaults={
            "plan": plan,
            "price": plan.yearly_price,
            "status": Subscription.Status.TRIAL,
            "starts_on": starts_on,
            "ends_on": trial_end,
            "next_bill_on": trial_end,
        },
    )
    return subscription


def bill_paid(bill: PlatformBill) -> int:
    paid = bill.payments.aggregate(t=Sum("amount"))["t"] or 0
    adjustments = {
        row["kind"]: row["total"]
        for row in bill.adjustments.values("kind").annotate(total=Sum("amount"))
    }
    return (
        paid
        + adjustments.get(BillAdjustment.Kind.CREDIT, 0)
        - adjustments.get(BillAdjustment.Kind.REVERSAL, 0)
        - adjustments.get(BillAdjustment.Kind.REFUND, 0)
    )


def bill_due(bill: PlatformBill) -> int:
    return 0 if bill.status == PlatformBill.Status.VOID else max(bill.amount - bill_paid(bill), 0)


def bill_state(bill: PlatformBill) -> str:
    if bill.status == PlatformBill.Status.VOID:
        return "CANCELLED"
    if bill.status == PlatformBill.Status.PAID:
        return "PAID"
    if bill_paid(bill) > 0:
        return "PART_PAID"
    return "OVERDUE" if bill.due_on < timezone.localdate() else "OPEN"


def credit_for(school=None, group=None) -> int:
    """Overpayment on earlier bills, taken off the next one."""
    bills = PlatformBill.objects.filter(school=school, group=group).exclude(
        status=PlatformBill.Status.VOID
    )
    return sum(max(bill_paid(bill) - bill.amount, 0) for bill in bills)


@transaction.atomic
def issue_bill(
    subscription: Subscription | None = None,
    *,
    by=None,
    school=None,
    group=None,
    lines=None,
    due_on=None,
):
    """The yearly bill for a subscription (or a group), or a one-off bill with its own lines."""
    today = timezone.localdate()
    if subscription is not None:
        if subscription.group_id:
            group, school = subscription.group, None
        else:
            school = subscription.school
        start = subscription.next_bill_on or today
        end = start + timedelta(days=364)
        lines = [
            (
                f"{subscription.plan.name} plan, {start:%d %b %Y} to {end:%d %b %Y}",
                subscription.price,
            ),
            *setup_lines(subscription),
        ]
        discount = (
            subscription.price * subscription.discount_percent // 100 + subscription.discount_amount
        )
        if discount:
            lines.append(
                (
                    f"Discount: {subscription.discount_reason or 'agreed'}",
                    -min(discount, subscription.price),
                )
            )
        due_on = due_on or start
    else:
        start, end = today, today
        due_on = due_on or today
    if not lines:
        raise ApiError("no_lines", "A bill needs at least one line.")
    credit = credit_for(school=school, group=group)
    total = sum(amount for _, amount in lines)
    if credit:
        lines = [*lines, ("Credit from earlier payments", -min(credit, total))]
    bill = PlatformBill.objects.create(
        number=next_bill_number(),
        school=school,
        group=group,
        period_start=start,
        period_end=end,
        amount=max(sum(amount for _, amount in lines), 0),
        issued_on=today,
        due_on=due_on,
        created_by=by,
    )
    for description, amount in lines:
        BillLine.objects.create(bill=bill, description=description, amount=amount)
    if subscription is not None:
        subscription.next_bill_on = end + timedelta(days=1)
        subscription.save(update_fields=["next_bill_on"])
    transaction.on_commit(
        lambda: notify_bill(
            bill,
            f"bill {bill.number} for GHS {money(bill.amount)} is due on {bill.due_on:%d %b %Y}",
        )
    )
    return bill


def setup_lines(subscription: Subscription) -> list[tuple[str, int]]:
    """The one-time setup fee, on a school's first bill only (a group's: one per new campus)."""
    fee = BillingSettings.current().setup_fee
    campuses = (
        list(subscription.group.subscriptions.select_related("school"))
        if subscription.group_id
        else [subscription]
    )
    lines = []
    for campus in campuses:
        if fee and not campus.setup_charged:
            lines.append((f"One-time setup: {campus.school.name}", fee))
            campus.setup_charged = True
            campus.save(update_fields=["setup_charged"])
    return lines


def bill_contacts(bill: PlatformBill) -> list[User]:
    schools = (
        [bill.school]
        if bill.school_id
        else [s.school for s in bill.group.subscriptions.select_related("school")]
    )
    return list(
        User.objects.filter(
            school__in=schools,
            is_active=True,
            groups__name__in=[roles.ADMINISTRATOR, roles.PROPRIETOR],
        ).distinct()
    )


def notify_bill(bill: PlatformBill, text: str) -> None:
    from django.core.mail import send_mail

    for user in bill_contacts(bill):
        if user.phone:
            send_sms(user.phone, f"ADsmartschool: {text}.", purpose=Purpose.ACCOUNT_NOTICE)
        if user.email:
            send_mail(
                "Your ADsmartschool bill",
                f"{text}. See the Billing page in your school portal.",
                None,
                [user.email],
            )


def settle(bill: PlatformBill) -> None:
    """Mark paid when nothing is due, and un-pause a school paused for non-payment."""
    bill.status = PlatformBill.Status.PAID if bill_due(bill) == 0 else PlatformBill.Status.OPEN
    bill.save(update_fields=["status"])
    subscriptions = (
        Subscription.objects.filter(school=bill.school)
        if bill.school_id
        else Subscription.objects.filter(group=bill.group)
    )
    if bill.status == PlatformBill.Status.PAID:
        for subscription in subscriptions:
            if subscription.status in (Subscription.Status.TRIAL, Subscription.Status.PAUSED):
                if subscription.status == Subscription.Status.PAUSED:
                    unpause(subscription)
                subscription.status = Subscription.Status.ACTIVE
                subscription.save(update_fields=["status"])


@transaction.atomic
def record_bill_payment(
    bill: PlatformBill, amount: int, method: str, *, by=None, reference="", received_on=None
):
    if bill.status == PlatformBill.Status.VOID:
        raise ApiError("cancelled", "This bill is cancelled.")
    if amount <= 0:
        raise ApiError("bad_amount", "Enter an amount above zero.")
    payment = BillPayment.objects.create(
        bill=bill,
        receipt_number=next_bill_number("RCT"),
        amount=amount,
        method=method,
        reference=reference,
        received_on=received_on or timezone.localdate(),
        recorded_by=by,
    )
    settle(bill)
    transaction.on_commit(lambda: email_receipt(payment))
    return payment


def email_receipt(payment: BillPayment) -> int:
    """The receipt by email to the school's Administrators and Proprietor (BT §3.6)."""
    from django.core.mail import send_mail

    bill = payment.bill
    payer = bill.school.name if bill.school_id else bill.group.name
    text = (
        f"Receipt {payment.receipt_number}\n\n"
        f"{payer}\nBill {bill.number}\n"
        f"Amount: GHS {money(payment.amount)}\n"
        f"Method: {payment.get_method_display()}\n"
        + (f"Reference: {payment.reference}\n" if payment.reference else "")
        + f"Date: {payment.received_on:%d %b %Y}\n\n"
        f"Thank you. The receipt is also on the Billing page in your school portal."
    )
    sent = 0
    for user in bill_contacts(bill):
        if user.email:
            sent += send_mail(
                f"ADsmartschool receipt {payment.receipt_number}", text, None, [user.email]
            )
    return sent


@transaction.atomic
def adjust_bill(bill: PlatformBill, kind: str, amount: int, reason: str, *, by) -> BillAdjustment:
    if kind in (BillAdjustment.Kind.REVERSAL, BillAdjustment.Kind.REFUND) and amount > bill_paid(
        bill
    ):
        raise ApiError("too_much", "That is more than has been paid on this bill.")
    adjustment = BillAdjustment.objects.create(
        bill=bill, kind=kind, amount=amount, reason=reason, recorded_by=by
    )
    settle(bill)
    return adjustment


def pause(subscription: Subscription) -> None:
    school = subscription.school
    subscription.status, subscription.paused_at = Subscription.Status.PAUSED, timezone.now()
    subscription.save(update_fields=["status", "paused_at"])
    school.billing_paused = True
    school.save(update_fields=["billing_paused"])


def unpause(subscription: Subscription) -> None:
    school = subscription.school
    subscription.paused_at = None
    subscription.save(update_fields=["paused_at"])
    school.billing_paused = False
    school.save(update_fields=["billing_paused"])


REMINDER_OFFSETS = (-7, 0, 7, 14)


def run_billing(today=None) -> dict:
    """Daily: make bills ahead of billing dates, send reminders, pause and warn when switched on."""
    today = today or timezone.localdate()
    settings = BillingSettings.current()
    made = reminded = paused = 0
    horizon = today + timedelta(days=settings.bill_days_before)
    for subscription in Subscription.objects.filter(
        next_bill_on__lte=horizon,
        status__in=[
            Subscription.Status.TRIAL,
            Subscription.Status.ACTIVE,
            Subscription.Status.PAUSED,
        ],
    ).select_related("plan", "school", "group"):
        if (
            subscription.group_id
            and subscription.group.subscriptions.order_by("pk").first() != subscription
        ):
            continue  # a group is billed once, through its first campus
        issue_bill(subscription)
        made += 1
    for bill in PlatformBill.objects.filter(status=PlatformBill.Status.OPEN).select_related(
        "school", "group"
    ):
        subscription = (
            Subscription.objects.filter(school=bill.school).first() if bill.school_id else None
        )
        if subscription and subscription.reminders_off:
            continue
        days_late = (today - bill.due_on).days
        for offset in REMINDER_OFFSETS:
            if days_late == offset and offset not in bill.reminders_sent:
                notify_bill(
                    bill,
                    f"bill {bill.number}: GHS {money(bill_due(bill))} "
                    f"{'is due' if offset <= 0 else 'was due'} on {bill.due_on:%d %b %Y}",
                )
                bill.reminders_sent = [*bill.reminders_sent, offset]
                bill.reminded_on = today
                bill.save(update_fields=["reminders_sent", "reminded_on"])
                reminded += 1
        if (
            settings.pause_for_non_payment
            and subscription
            and subscription.status != Subscription.Status.PAUSED
        ):
            if days_late == settings.grace_days - 7 and "warning" not in bill.reminders_sent:
                notify_bill(
                    bill,
                    f"final notice: pay bill {bill.number} within 7 days "
                    "to keep your school online",
                )
                bill.reminders_sent = [*bill.reminders_sent, "warning"]
                bill.save(update_fields=["reminders_sent"])
            if days_late >= settings.grace_days:
                pause(subscription)
                paused += 1
    return {"bills": made, "reminders": reminded, "paused": paused}
