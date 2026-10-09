"""Website rules that span several models."""

from apps.consent.models import PrivacyNotice
from apps.website.models import ContentBlock, PhotoSlot, SiteSettings


def publication_blockers() -> list[str]:
    """Everything still keeping the site in preview (spec §6.5). Empty means public."""
    blockers = []
    placeholders = PhotoSlot.objects.filter(is_placeholder=True).count()
    if placeholders:
        blockers.append(f"{placeholders} photo slot(s) still use placeholder photos")
    provisional = ContentBlock.objects.filter(needs_review=True).count()
    if provisional:
        blockers.append(f"{provisional} text block(s) still need review")
    notice = PrivacyNotice.current()
    if notice is None or notice.is_draft:
        blockers.append("The privacy notice has not been reviewed")
    if not SiteSettings.load().is_live:
        blockers.append("The site has not been marked live")
    return blockers


def is_site_public() -> bool:
    return not publication_blockers()
