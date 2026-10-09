"""Six-digit SMS codes (Phase 1 spec §5.2, §5.3): hashed, valid 10 minutes, 5 attempts, single
use. Every message names the school it comes from (amendment §8)."""

import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.db.models import F
from django.utils import timezone
from django.utils.crypto import salted_hmac

from apps.accounts.models import SmsCode, User
from apps.core.phones import format_gh_local
from apps.notifications.models import SmsMessage
from apps.notifications.sms import Purpose, send_sms

LIFETIME = timedelta(minutes=10)
MAX_ATTEMPTS = 5
TEXT = "{sender}: your code is {code}. It expires in 10 minutes. Never share it with anyone."


def _digest(code: str) -> str:
    return salted_hmac("accounts.sms-code", code, algorithm="sha256").hexdigest()


def send_code(user: User, purpose: str, phone: str) -> SmsMessage:
    """Text a new code. Only once it is sent does it replace any earlier code."""
    sender = user.school.name if user.school else settings.PLATFORM_NAME
    code = f"{secrets.randbelow(10**6):06d}"
    message = send_sms(
        phone,
        TEXT.format(sender=sender, code=code),
        purpose=Purpose.SIGN_IN_CODE,
        redacted_body=TEXT.format(sender=sender, code="******"),
        school=user.school,
    )
    if message.status == SmsMessage.Status.SENT:
        now = timezone.now()
        SmsCode.objects.filter(user=user, purpose=purpose, used_at__isnull=True).update(used_at=now)
        SmsCode.objects.create(
            user=user, purpose=purpose, code_hash=_digest(code), expires_at=now + LIFETIME
        )
    return message


def check_code(user: User, purpose: str, code: str) -> SmsCode | None:
    """The live code matching `code`, or None. Wrong guesses use up attempts."""
    row = (
        SmsCode.objects.filter(
            user=user, purpose=purpose, used_at__isnull=True, expires_at__gt=timezone.now()
        )
        .order_by("-created_at")
        .first()
    )
    if row is None or row.attempts >= MAX_ATTEMPTS:
        return None
    if not hmac.compare_digest(row.code_hash, _digest(code.strip())):
        SmsCode.objects.filter(pk=row.pk).update(attempts=F("attempts") + 1)
        return None
    return row


def consume(row: SmsCode) -> bool:
    """Mark the code used; False if another request used it first."""
    return (
        SmsCode.objects.filter(pk=row.pk, used_at__isnull=True).update(used_at=timezone.now()) == 1
    )


def sms_failed_message(school) -> str:
    """Phase 1 spec §10, with the school's own phone number (amendment §8)."""
    if school is not None and school.phone:
        return (
            "We couldn't send the code. Try again, or call the school on "
            f"{format_gh_local(school.phone)}."
        )
    return "We couldn't send the code. Try again in a few minutes, or use a backup code."
