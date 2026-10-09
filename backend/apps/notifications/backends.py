"""SMS backends. A provider backend is added before launch (Phase 1 spec §3.7)."""

import json
import logging

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


class ConsoleBackend:
    """Development: logs each message and appends it to SMS_FILE_PATH when that is set."""

    def send(self, to: str, body: str) -> str:
        logger.info("SMS to %s: %s", to, body)
        if settings.SMS_FILE_PATH:
            line = json.dumps({"to": to, "body": body, "at": timezone.now().isoformat()})
            with open(settings.SMS_FILE_PATH, "a", encoding="utf-8") as outbox:
                outbox.write(line + "\n")
        return ""


class MemoryBackend:
    """Tests: keeps messages in MemoryBackend.outbox (emptied before every test)."""

    outbox: list[dict] = []

    def send(self, to: str, body: str) -> str:
        self.outbox.append({"to": to, "body": body})
        return ""
