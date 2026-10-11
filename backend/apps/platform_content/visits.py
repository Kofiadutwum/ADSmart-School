"""Cookie-free visit counts for the owner's website (business tools spec §4)."""

import re

from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from apps.platform_content.models import PageVisit

ROBOTS = re.compile(r"bot|crawl|spider|slurp|preview|headless|lighthouse|monitor", re.IGNORECASE)
# Only the website's own pages, so the table cannot be filled with made-up addresses.
COUNTED = re.compile(r"^/(articles(/[a-z0-9-]{1,170})?|gallery|privacy)?$")


def page_of(raw) -> str | None:
    path = str(raw or "").split("#")[0].split("?")[0]
    return path if COUNTED.match(path) else None


def is_robot(user_agent: str) -> bool:
    return not user_agent or bool(ROBOTS.search(user_agent))


def count_visit(path: str) -> None:
    day = timezone.localdate()
    if PageVisit.objects.filter(day=day, path=path).update(count=F("count") + 1):
        return
    try:
        with transaction.atomic():
            PageVisit.objects.create(day=day, path=path, count=1)
    except IntegrityError:  # another visit created the row first
        PageVisit.objects.filter(day=day, path=path).update(count=F("count") + 1)
