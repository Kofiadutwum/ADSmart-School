"""Tip emails (business tools spec §5.6). Links carry signed tokens: one salt to confirm, another
to unsubscribe, so neither can stand in for the other."""

from django.conf import settings
from django.core import signing

CONFIRM_SALT = "tips.confirm"
UNSUBSCRIBE_SALT = "tips.unsubscribe"


def platform_url(path: str) -> str:
    return settings.SITE_URL_TEMPLATE.format(host=settings.PLATFORM_DOMAIN) + path


def unsubscribe_url(subscriber) -> str:
    token = signing.dumps(subscriber.pk, salt=UNSUBSCRIBE_SALT)
    return platform_url(f"/tips/unsubscribe?token={token}")
