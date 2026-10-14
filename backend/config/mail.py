"""Where email goes: Brevo's web API when BREVO_API_KEY is set (Render's free plan blocks the
email ports, so SMTP can't work there), else an SMTP server when SMTP_HOST is set, else the
console."""

import json
import urllib.error
import urllib.request
from collections.abc import Mapping
from email.utils import parseaddr

from django.core.mail.backends.base import BaseEmailBackend


def mailers(values: Mapping[str, str]) -> dict:
    if values.get("BREVO_API_KEY", ""):
        return {
            "default": {
                "BACKEND": "config.mail.BrevoBackend",
                "OPTIONS": {"api_key": values["BREVO_API_KEY"]},
            }
        }
    host = values.get("SMTP_HOST", "")
    if not host:
        backend = values.get(
            "DJANGO_EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
        )
        return {"default": {"BACKEND": backend}}
    return {
        "default": {
            "BACKEND": "django.core.mail.backends.smtp.EmailBackend",
            "OPTIONS": {
                "host": host,
                "port": int(values.get("SMTP_PORT", "587")),
                "username": values.get("SMTP_USERNAME", ""),
                "password": values.get("SMTP_PASSWORD", ""),
                "use_tls": values.get("SMTP_USE_TLS", "true").lower() == "true",
                "timeout": 10,
            },
        }
    }


class BrevoBackend(BaseEmailBackend):
    """Sends each message through Brevo's transactional email API over HTTPS."""

    URL = "https://api.brevo.com/v3/smtp/email"

    def __init__(self, *, api_key: str = "", **kwargs):
        super().__init__(**kwargs)
        self.api_key = api_key

    def send_messages(self, email_messages) -> int:
        for message in email_messages:
            self._send(message)  # a failure surfaces, as with Django's own mailers
        return len(email_messages)

    def _send(self, message) -> None:
        name, address = parseaddr(message.from_email)
        payload = {
            "sender": {"name": name or address, "email": address},
            "to": [{"email": parseaddr(to)[1]} for to in message.to],
            "subject": message.subject,
            "textContent": message.body,
        }
        if message.cc:
            payload["cc"] = [{"email": parseaddr(cc)[1]} for cc in message.cc]
        if message.bcc:
            payload["bcc"] = [{"email": parseaddr(bcc)[1]} for bcc in message.bcc]
        html = next(
            (
                content
                for content, kind in getattr(message, "alternatives", [])
                if kind == "text/html"
            ),
            None,
        )
        if html:
            payload["htmlContent"] = html
        request = urllib.request.Request(
            self.URL,
            data=json.dumps(payload).encode(),
            headers={
                "api-key": self.api_key,
                "accept": "application/json",
                "content-type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=15):  # noqa: S310 - fixed host
                pass
        except urllib.error.HTTPError as exc:
            # Brevo's reason (bad key, unverified sender, blocked IP) lands in the logs.
            reason = exc.read().decode(errors="replace")[:300]
            raise RuntimeError(f"Brevo refused the email ({exc.code}): {reason}") from exc
