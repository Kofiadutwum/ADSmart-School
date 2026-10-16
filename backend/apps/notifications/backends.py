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


class UnavailableBackend:
    """Production until a text-message provider is connected (Plan 6A): sending fails, so the
    sign-in screen says the text could not be sent and offers email instead."""

    def send(self, to: str, body: str) -> str:
        raise RuntimeError("No SMS provider is set up yet.")


class MemoryBackend:
    """Tests: keeps messages in MemoryBackend.outbox (emptied before every test)."""

    outbox: list[dict] = []

    def send(self, to: str, body: str) -> str:
        self.outbox.append({"to": to, "body": body})
        return ""


class ArkeselBackend:
    """Arkesel SMS (SMS spec §24): returns the provider's message id for delivery reports."""

    URL = "https://sms.arkesel.com/api/v2/sms/send"

    def send(self, to: str, body: str) -> str:
        import urllib.error
        import urllib.request

        payload = json.dumps(
            {"sender": settings.SMS_SENDER_ID, "message": body, "recipients": [to.lstrip("+")]}
        ).encode()
        request = urllib.request.Request(
            self.URL,
            data=payload,
            headers={"api-key": settings.SMS_API_KEY, "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 - fixed URL
                answer = json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as exc:
            # Arkesel's reason (bad key, unapproved sender name, no credit) for the logs.
            reason = exc.read().decode(errors="replace")[:300]
            raise RuntimeError(f"Arkesel refused the message ({exc.code}): {reason}") from exc
        if answer.get("status") != "success":
            raise RuntimeError(f"Arkesel refused the message: {answer.get('message', 'unknown')}")
        data = answer.get("data") or [{}]
        return str(data[0].get("id", "")) if isinstance(data, list) else ""
