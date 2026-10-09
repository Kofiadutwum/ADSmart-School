"""School web-address names: <slug>.<platform domain> (amendment §2.2)."""

import re

from django.core.exceptions import ValidationError

RESERVED = frozenset(
    {
        "admin",
        "www",
        "api",
        "app",
        "mail",
        "static",
        "media",
        "platform",
        "support",
        "help",
        "status",
        "docs",
        "blog",
    }
)
_PATTERN = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")
RULES = "Use 3–30 lowercase letters, numbers or single hyphens, starting with a letter."


def validate_slug(value: str) -> None:
    if value in RESERVED:
        raise ValidationError(f"“{value}” is reserved for the platform. Choose another name.")
    if not (3 <= len(value) <= 30 and _PATTERN.match(value)):
        raise ValidationError(RULES)
