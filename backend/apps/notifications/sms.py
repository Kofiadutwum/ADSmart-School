"""Sending SMS (Phase 1 spec §3.7): guards first, then the configured backend, always a log row.

School messages (announcements, reminders, absence, receipts) use the school's SMS credits,
one per 160 characters; sign-in codes and account notices are free (SMS spec §24).
"""

import math
from datetime import timedelta

from django.conf import settings
from django.db.models import Sum
from django.utils import timezone
from django.utils.module_loading import import_string

from apps.notifications.models import SmsCreditEntry, SmsMessage
from apps.people.demo import is_demo_only_phone


class Purpose:
    SIGN_IN_CODE = "sign_in_code"
    ACCOUNT_NOTICE = "account_notice"  # telling someone their account was changed for them
    ANNOUNCEMENT = "announcement"
    REMINDER = "reminder"
    ABSENCE = "absence"
    RECEIPT = "receipt"
    PAYMENT_LINK = "payment_link"
    ALERT = "alert"  # safety: incidents, blocked collections, bus boarding


BILLABLE = {
    Purpose.ANNOUNCEMENT,
    Purpose.REMINDER,
    Purpose.ABSENCE,
    Purpose.RECEIPT,
    Purpose.PAYMENT_LINK,
    Purpose.ALERT,
}

# Per-number limits by purpose (§5.5): (messages, window).
LIMITS = {Purpose.SIGN_IN_CODE: (3, timedelta(hours=1))}


def segments(body: str) -> int:
    return max(1, math.ceil(len(body) / 160))


def credit_balance(school) -> int:
    return SmsCreditEntry.objects.filter(school=school).aggregate(total=Sum("change"))["total"] or 0


def send_sms(
    to: str, body: str, *, purpose: str, redacted_body: str | None = None, school=None
) -> SmsMessage:
    message = SmsMessage(school=school, to=to, purpose=purpose, body=redacted_body or body)
    limit = LIMITS.get(purpose)
    billable = school is not None and purpose in BILLABLE
    if is_demo_only_phone(to):
        # Demo numbers are made up and may belong to real people (Phase 1 spec §9).
        message.status, message.error = SmsMessage.Status.REFUSED, "demo_recipient"
    elif limit and _sent_recently(to, purpose, limit[1]) >= limit[0]:
        message.status, message.error = SmsMessage.Status.REFUSED, "rate_limited"
    elif billable and credit_balance(school) < segments(body):
        message.status, message.error = SmsMessage.Status.REFUSED, "no_credit"
    else:
        try:
            message.provider_reference = import_string(settings.SMS_BACKEND)().send(to, body)
            message.status = SmsMessage.Status.SENT
        except Exception as exc:  # a gateway error is logged for staff, never shown raw
            message.status, message.error = SmsMessage.Status.FAILED, str(exc)[:500]
    message.save()
    if billable and message.status == SmsMessage.Status.SENT:
        SmsCreditEntry.objects.create(school=school, change=-segments(body), reason=f"Text: {purpose}")
    return message


def _sent_recently(to: str, purpose: str, window: timedelta) -> int:
    since = timezone.now() - window
    return SmsMessage.objects.filter(
        to=to, purpose=purpose, status=SmsMessage.Status.SENT, created_at__gte=since
    ).count()
