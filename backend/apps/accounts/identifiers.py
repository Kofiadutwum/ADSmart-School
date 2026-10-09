"""Sign-in identifiers by account kind (Phase 1 spec §5.1): usernames, phones, Student IDs."""

import re

from apps.core.phones import normalise_gh_phone

USERNAME = re.compile(r"^[a-z][a-z0-9._-]{2,149}$")
STUDENT_ID = re.compile(r"^\d{7}$")


def normalise_identifier(kind: str, raw: str) -> str:
    value = (raw or "").strip()
    if kind in ("staff", "platform"):
        value = value.lower()
        if not USERNAME.match(value):
            raise ValueError(
                "Usernames start with a letter and use letters, numbers, dots, dashes or "
                "underscores."
            )
        return value
    if kind == "parent":
        return normalise_gh_phone(value)
    if kind == "student":
        value = re.sub(r"[\s-]", "", value)
        if not STUDENT_ID.match(value):
            raise ValueError("Enter the 7-digit Student ID, e.g. 26-0147-3.")
        return value
    raise ValueError("Unknown account type.")
