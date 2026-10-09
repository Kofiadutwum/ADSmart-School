"""Admissions enquiry rules: form tokens, repeat limits and the school notification."""

import logging
import time
from datetime import timedelta

from django.core import signing
from django.core.mail import send_mail
from django.utils import timezone

from apps.core.exceptions import ApiError
from apps.core.phones import format_gh_local
from apps.website.models import Enquiry

logger = logging.getLogger(__name__)

FORM_TOKEN_SALT = "website.enquiry-form"
FORM_TOKEN_MAX_AGE = 60 * 60 * 24
MIN_FILL_SECONDS = 3
MAX_PER_PHONE_PER_DAY = 3


def issue_form_token(now: float | None = None) -> str:
    return signing.dumps({"t": time.time() if now is None else now}, salt=FORM_TOKEN_SALT)


def check_form_token(token: str) -> None:
    try:
        data = signing.loads(token, salt=FORM_TOKEN_SALT, max_age=FORM_TOKEN_MAX_AGE)
    except signing.BadSignature as exc:  # includes SignatureExpired
        raise ApiError(
            "form_expired", "This form has expired. Please press Send again.", 400
        ) from exc
    if time.time() - float(data.get("t", 0)) < MIN_FILL_SECONDS:
        raise ApiError(
            "too_fast", "That was quick! Please check your details and press Send again.", 400
        )


def phone_limit_reached(school, phone_e164: str) -> bool:
    since = timezone.now() - timedelta(days=1)
    recent = Enquiry.objects.for_school(school).filter(phone=phone_e164, created_at__gte=since)
    return recent.count() >= MAX_PER_PHONE_PER_DAY


def _format_date(value) -> str:
    return f"{value.day} {value:%B %Y}" if value else "—"


def notify_school(enquiry: Enquiry) -> None:
    school = enquiry.school
    if not school.email:
        logger.warning("Enquiry %s saved but no school email is set", enquiry.pk)
        return
    body = "\n".join(
        [
            f"Parent or guardian: {enquiry.parent_name}",
            f"Phone: {format_gh_local(enquiry.phone)}",
            f"Email: {enquiry.email or '—'}",
            f"Child: {enquiry.child_name} (born {_format_date(enquiry.child_date_of_birth)})",
            f"Level wanted: {enquiry.get_level_wanted_display()}",
            f"Preferred visit date: {_format_date(enquiry.preferred_visit_date)}",
            "",
            "Message:",
            enquiry.message or "—",
            "",
            "Follow up from the enquiry inbox.",
        ]
    )
    try:
        send_mail(
            f"New admission enquiry: {enquiry.get_level_wanted_display()}",
            body,
            None,
            [school.email],
        )
    except Exception:
        logger.exception("Could not email the school about enquiry %s", enquiry.pk)
