"""Website rules that span several models."""

from apps.consent.models import PrivacyNotice
from apps.core.exceptions import ApiError
from apps.core.images import image_payload
from apps.core.phones import format_gh_local, whatsapp_link
from apps.school.models import SchoolProfile
from apps.website.models import ContentBlock, Fact, FeatureBlock, NewsPost, PhotoSlot, SiteSettings


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


def _photo(slot: PhotoSlot) -> dict | None:
    payload = image_payload(slot.renditions, slot.alt_text)
    if payload is None:
        return None
    return {**payload, "caption": slot.caption, "is_placeholder": slot.is_placeholder}


def build_site_payload() -> dict:
    school = SchoolProfile.load()
    if school is None:
        raise ApiError("not_configured", "The school profile has not been set up yet.", 503)
    years = school.years_since_founding()
    slots = list(PhotoSlot.objects.all())
    return {
        "school": {
            "name": school.name,
            "motto": school.motto,
            "founded_year": school.founded_year,
            "years_since_founding": years,
            "address": school.address,
            "town": school.town,
            "region": school.region,
            "ghana_post_gps": school.ghana_post_gps,
            "phone": school.phone,
            "phone_display": format_gh_local(school.phone),
            "whatsapp_link": whatsapp_link(school.whatsapp) if school.whatsapp else "",
            "email": school.email,
            "map_query": school.map_query,
        },
        "is_public": is_site_public(),
        "content": {block.key: block.text for block in ContentBlock.objects.all()},
        "facts": [
            {"label": fact.label, "value": fact.display_value(years)}
            for fact in Fact.objects.filter(visible=True)
        ],
        "features": [
            {"key": f.key, "title": f.title, "text": f.text, "icon": f.icon}
            for f in FeatureBlock.objects.filter(enabled=True)
        ],
        "photos": {s.key: _photo(s) for s in slots if not s.key.startswith("gallery_")},
        "gallery": [photo for s in slots if s.key.startswith("gallery_") and (photo := _photo(s))],
    }


def news_summary(post: NewsPost) -> dict:
    return {
        "title": post.title,
        "slug": post.slug,
        "summary": post.summary,
        "published_at": post.published_at.isoformat(),
        "cover": image_payload(post.renditions, post.cover_alt),
    }
