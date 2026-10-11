"""Tip emails (business tools spec §5.6). Links carry signed tokens: one salt to confirm, another
to unsubscribe, so neither can stand in for the other."""

import logging
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.core.mail import EmailMessage
from django.utils import timezone

from apps.platform_content.models import TipSubscriber

CONFIRM_SALT = "tips.confirm"
UNSUBSCRIBE_SALT = "tips.unsubscribe"
CONFIRM_FOR = timedelta(days=7)
RESEND_AFTER = timedelta(hours=1)

log = logging.getLogger(__name__)


def platform_url(path: str) -> str:
    return settings.SITE_URL_TEMPLATE.format(host=settings.PLATFORM_DOMAIN) + path


def unsubscribe_url(subscriber) -> str:
    token = signing.dumps(subscriber.pk, salt=UNSUBSCRIBE_SALT)
    return platform_url(f"/tips/unsubscribe?token={token}")


def _confirm_url(subscriber) -> str:
    token = signing.dumps(subscriber.pk, salt=CONFIRM_SALT)
    return platform_url(f"/tips/confirm?token={token}")


def sign_up(email: str) -> None:
    """Sends a confirmation link to a new, pending or returning address. Says nothing about
    which, so the form cannot be used to learn who has subscribed."""
    now = timezone.now()
    subscriber, _ = TipSubscriber.objects.get_or_create(email=email, defaults={"consent_at": now})
    if subscriber.confirmed_at and not subscriber.unsubscribed_at:
        return
    if subscriber.last_emailed_at and now - subscriber.last_emailed_at < RESEND_AFTER:
        return
    subscriber.consent_at, subscriber.last_emailed_at = now, now
    subscriber.confirmed_at = subscriber.unsubscribed_at = None
    subscriber.save()
    body = "\n".join(
        [
            f"Please confirm that you'd like new tips from {settings.PLATFORM_NAME} by email:",
            "",
            _confirm_url(subscriber),
            "",
            "The link works for 7 days. If you didn't ask for this, ignore this email and "
            "nothing will be sent.",
        ]
    )
    try:
        EmailMessage(
            subject=f"{settings.PLATFORM_NAME}: please confirm your tips sign-up",
            body=body,
            to=[subscriber.email],
        ).send()
    except Exception:
        log.exception("Couldn't send the tips confirmation to subscriber %s", subscriber.pk)


def _subscriber(token: str, salt: str, max_age=None):
    try:
        pk = signing.loads(token, salt=salt, max_age=max_age)
    except signing.BadSignature:  # includes expired links
        return None
    return TipSubscriber.objects.filter(pk=pk).first()


def confirm(token: str) -> bool:
    subscriber = _subscriber(token, CONFIRM_SALT, max_age=CONFIRM_FOR)
    if subscriber is None or subscriber.unsubscribed_at:  # an old link after leaving
        return False
    if subscriber.confirmed_at is None:
        subscriber.confirmed_at = timezone.now()
        subscriber.save(update_fields=["confirmed_at"])
    return True


def unsubscribe(token: str) -> bool:
    subscriber = _subscriber(token, UNSUBSCRIBE_SALT)
    if subscriber is None:
        return False
    if subscriber.unsubscribed_at is None:
        subscriber.unsubscribed_at = timezone.now()
        subscriber.save(update_fields=["unsubscribed_at"])
    return True
