from django.conf import settings
from django.core.files import File
from django.utils import timezone

from apps.consent.models import PrivacyNotice
from apps.school.models import SchoolProfile
from apps.website import seed_data
from apps.website.models import ContentBlock, Fact, FeatureBlock, NewsPost, PhotoSlot, SiteSettings

SEED_PHOTO_DIR = settings.BASE_DIR / "seed" / "placeholder_photos"


def seed_website() -> int:
    """Create any missing default content. Existing rows are never changed."""
    created = 0

    if SchoolProfile.load() is None:
        SchoolProfile(**seed_data.SCHOOL).save()
        created += 1

    for key, text, help_text in seed_data.CONTENT_BLOCKS:
        _, made = ContentBlock.objects.get_or_create(
            key=key, defaults={"text": text, "help_text": help_text}
        )
        created += made

    for order, (label, value) in enumerate(seed_data.FACTS):
        _, made = Fact.objects.get_or_create(label=label, defaults={"value": value, "order": order})
        created += made

    for order, (key, title, text, icon) in enumerate(seed_data.FEATURES):
        _, made = FeatureBlock.objects.get_or_create(
            key=key, defaults={"title": title, "text": text, "icon": icon, "order": order}
        )
        created += made

    for order, photo in enumerate(seed_data.PHOTOS):
        if PhotoSlot.objects.filter(key=photo.key).exists():
            continue
        slot = PhotoSlot(
            key=photo.key,
            alt_text=photo.alt_text,
            caption=photo.caption,
            order=order,
            is_placeholder=True,
        )
        with open(SEED_PHOTO_DIR / photo.filename, "rb") as handle:
            slot.image.save(photo.filename, File(handle), save=False)
        slot.save()
        created += 1

    for post in seed_data.NEWS:
        _, made = NewsPost.objects.get_or_create(
            slug=post["slug"],
            defaults={
                "title": post["title"],
                "summary": post["summary"],
                "body": post["body"],
                "status": NewsPost.Status.PUBLISHED,
                "published_at": timezone.now(),
            },
        )
        created += made

    _, made = PrivacyNotice.objects.get_or_create(
        version=seed_data.PRIVACY_NOTICE["version"],
        defaults={
            "title": seed_data.PRIVACY_NOTICE["title"],
            "body": seed_data.PRIVACY_NOTICE["body"],
            "effective_from": timezone.localdate(),
        },
    )
    created += made

    SiteSettings.load()
    return created
