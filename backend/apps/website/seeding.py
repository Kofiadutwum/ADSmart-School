"""Development and first launch: the platform's first school (amendment §1)."""

from apps.website.provisioning import seed_first_school


def seed_website() -> int:
    """Create what is missing; existing rows are never changed. Returns how many were made."""
    return seed_first_school()
