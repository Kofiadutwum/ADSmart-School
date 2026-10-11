"""Development and first launch: the platform's first school and its own notice."""

from django.conf import settings
from django.utils import timezone

from apps.consent.models import PrivacyNotice
from apps.platform_content.starter_tips import seed_starter_tips
from apps.website import seed_data
from apps.website.provisioning import seed_first_school


def seed_platform() -> int:
    """The platform's draft privacy notice (amendment §6), if it has none yet."""
    if PrivacyNotice.objects.filter(school=None).exists():
        return 0
    PrivacyNotice.objects.create(
        version="draft-1",
        body=seed_data.PLATFORM_PRIVACY_NOTICE_BODY.format(platform=settings.PLATFORM_NAME),
        effective_from=timezone.localdate(),
    )
    return 1


def seed_website() -> int:
    """Create what is missing; existing rows are never changed. Returns how many were made."""
    return seed_first_school() + seed_platform() + seed_starter_tips()
