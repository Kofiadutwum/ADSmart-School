"""Daily money and shop jobs (SMS spec §32): instalment reminders, re-checking pending online
payments, platform billing, uncollected orders and low stock."""

from datetime import timedelta

from django.utils import timezone

from apps.core.jobs import job
from apps.finance import services
from apps.finance.models import Instalment, Invoice
from apps.notifications.sms import Purpose


@job("instalment_reminders")
def instalment_reminders(today=None) -> int:
    """Three days before an instalment is due, and the day after it is missed; once each."""
    today = today or timezone.localdate()
    sent = 0
    open_instalments = Instalment.objects.filter(
        invoice__status=Invoice.Status.OPEN
    ).select_related("invoice__student__school")
    for item in open_instalments.filter(due_on=today + timedelta(days=3), reminded_before=False):
        owed = services.outstanding_on(item)
        if owed:
            services.text_family(
                item.invoice.student,
                "INSTALMENT_DUE",
                Purpose.REMINDER,
                amount=services.money(owed),
                date=item.due_on.strftime("%d %b"),
            )
            sent += 1
        item.reminded_before = True
        item.save(update_fields=["reminded_before"])
    for item in open_instalments.filter(due_on__lt=today, reminded_after=False):
        owed = services.outstanding_on(item)
        if owed:
            services.text_family(
                item.invoice.student,
                "INSTALMENT_OVERDUE",
                Purpose.REMINDER,
                amount=services.money(owed),
                date=item.due_on.strftime("%d %b"),
            )
            sent += 1
        item.reminded_after = True
        item.save(update_fields=["reminded_after"])
    return sent


@job("online_payment_recheck")
def online_payment_recheck() -> int:
    from apps.finance.online import recheck_pending

    return recheck_pending()


@job("platform_billing")
def platform_billing() -> dict:
    from apps.billing.services import run_billing

    return run_billing()


@job("shop_reminders")
def shop_reminders() -> dict:
    from apps.shop.api import low_stock_alerts, remind_uncollected

    return {"uncollected": remind_uncollected(), "low_stock": low_stock_alerts()}
