"""Where email goes (Plan 6A): an SMTP server when SMTP_HOST is set, else the console."""

from collections.abc import Mapping


def mailers(values: Mapping[str, str]) -> dict:
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
