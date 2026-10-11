"""The platform's own public site (amendment §6)."""

import logging
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from apps.consent.models import PrivacyNotice
from apps.core.phones import format_gh_local
from apps.platform_content.public import gallery_payload
from apps.school.models import School
from apps.website.models import Lead
from apps.website.services import is_site_public

logger = logging.getLogger(__name__)
MAX_LEADS_PER_PHONE_PER_DAY = 3


def platform_payload() -> dict:
    notice = PrivacyNotice.current(None)
    schools = School.objects.exclude(status=School.Status.SUSPENDED)
    phone = settings.PLATFORM_PHONE
    return {
        "name": settings.PLATFORM_NAME,
        "email": settings.PLATFORM_EMAIL,
        "phone": phone,
        "phone_display": format_gh_local(phone) if phone else "",
        "url": settings.SITE_URL_TEMPLATE.format(host=settings.PLATFORM_DOMAIN),
        "is_public": notice is not None and not notice.is_draft,
        "gallery": gallery_payload(),
        "schools": [
            {"name": s.name, "town": s.town, "region": s.region, "url": s.base_url()}
            for s in schools
            if is_site_public(s)
        ],
    }


def lead_limit_reached(phone_e164: str) -> bool:
    since = timezone.now() - timedelta(days=1)
    recent = Lead.objects.filter(phone=phone_e164, created_at__gte=since).count()
    return recent >= MAX_LEADS_PER_PHONE_PER_DAY


def notify_platform(lead: Lead) -> None:
    if not settings.PLATFORM_EMAIL:
        logger.warning("Lead %s saved but PLATFORM_EMAIL is not set", lead.pk)
        return
    body = "\n".join(
        [
            f"School: {lead.school_name}, {lead.town}",
            f"Contact: {lead.contact_name}",
            f"Phone: {format_gh_local(lead.phone)}",
            f"Email: {lead.email or '—'}",
            "",
            "Message:",
            lead.message or "—",
        ]
    )
    try:
        send_mail(
            f"New school enquiry: {lead.school_name} ({lead.town})",
            body,
            None,
            [settings.PLATFORM_EMAIL],
        )
    except Exception:
        logger.exception("Could not email the platform about lead %s", lead.pk)
