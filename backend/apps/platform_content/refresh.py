"""Asks Next.js to rebuild the owner's website straight after a change (business tools spec
§5.7). Without a secret nothing is sent, and pages catch up within five minutes anyway."""

import json
import logging
import urllib.request

from django.conf import settings
from django.db import transaction

log = logging.getLogger(__name__)


def _post(tag: str) -> None:
    request = urllib.request.Request(
        f"{settings.FRONTEND_ORIGIN}/api/revalidate",
        data=json.dumps({"tag": tag}).encode(),
        headers={
            "Content-Type": "application/json",
            "X-Revalidate-Secret": settings.REVALIDATE_SECRET,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=3):  # noqa: S310 - our own server
            pass
    except (OSError, ValueError) as exc:
        log.warning("Couldn't refresh the platform website: %s", exc)


def refresh_platform_site() -> None:
    if settings.REVALIDATE_SECRET:
        transaction.on_commit(lambda: _post("platform"))
