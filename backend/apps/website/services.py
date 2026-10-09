"""Website rules that span several models, always for one school."""

from apps.consent.models import PrivacyNotice
from apps.core.images import image_payload
from apps.core.phones import format_gh_local, whatsapp_link
from apps.school.branding import brand_tokens
from apps.school.models import School
from apps.website.models import ContentBlock, Fact, FeatureBlock, NewsPost, PhotoSlot


def publication_blockers(school: School) -> list[str]:
    """Everything still keeping the site in preview (Phase 1 spec §6.5). Empty means public."""
    blockers = []
    placeholders = PhotoSlot.objects.for_school(school).filter(is_placeholder=True).count()
    if placeholders:
        blockers.append(f"{placeholders} photo slot(s) still use placeholder photos")
    provisional = ContentBlock.objects.for_school(school).filter(needs_review=True).count()
    if provisional:
        blockers.append(f"{provisional} text block(s) still need review")
    notice = PrivacyNotice.current(school)
    if notice is None or notice.is_draft:
        blockers.append("The privacy notice has not been reviewed")
    if not school.is_live:
        blockers.append("The site has not been marked live")
    return blockers


def is_site_public(school: School) -> bool:
    return not publication_blockers(school)


def _photo(slot: PhotoSlot) -> dict | None:
    payload = image_payload(slot.renditions, slot.alt_text)
    if payload is None:
        return None
    return {**payload, "caption": slot.caption, "is_placeholder": slot.is_placeholder}


def build_site_payload(school: School) -> dict:
    years = school.years_since_founding()
    slots = list(PhotoSlot.objects.for_school(school))
    facts = Fact.objects.for_school(school).filter(visible=True)
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
            "logo": image_payload(school.renditions, f"{school.name} logo"),
            "base_url": school.base_url(),
            "levels_offered": school.levels_offered,
        },
        "brand": brand_tokens(school.brand_primary, school.brand_accent),
        "is_public": is_site_public(school),
        "content": {block.key: block.text for block in ContentBlock.objects.for_school(school)},
        "facts": [
            {"label": fact.label, "value": value}
            for fact in facts
            if (value := fact.display_value(years)) is not None
        ],
        "features": [
            {"key": f.key, "title": f.title, "text": f.text, "icon": f.icon}
            for f in FeatureBlock.objects.for_school(school).filter(enabled=True)
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
