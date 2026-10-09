"""Creating schools and their starting websites (amendment §5, §7.4)."""

from django.conf import settings
from django.core.files import File
from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone

from apps.consent.models import PrivacyNotice
from apps.core.images import build_renditions
from apps.school.models import School, all_levels
from apps.website import seed_data
from apps.website.models import ContentBlock, Fact, FeatureBlock, NewsPost, PhotoSlot

SEED_DIR = settings.BASE_DIR / "seed"


def _shared_placeholder(filename: str) -> tuple[str, list[dict]]:
    """One stored copy of a placeholder photo and its renditions, shared by every school."""
    name = f"placeholders/{filename}"
    known = (
        PhotoSlot.objects.filter(image=name)
        .exclude(renditions=[])
        .values_list("renditions", flat=True)
        .first()
    )
    if known:
        return name, known
    if not default_storage.exists(name):
        with open(SEED_DIR / "placeholder_photos" / filename, "rb") as handle:
            name = default_storage.save(name, File(handle))
    return name, build_renditions(name)


@transaction.atomic
def provision_school(school: School) -> int:
    """Give a saved school any missing starting content. Existing rows are never changed."""
    created = 0
    context = seed_data.context_for(school)
    for key, text, help_text in seed_data.content_blocks(school.levels_offered):
        _, made = ContentBlock.objects.get_or_create(
            school=school,
            key=key,
            defaults={"text": text.format(**context), "help_text": help_text},
        )
        created += made
    if not Fact.objects.for_school(school).exists():
        for order, (label, value) in enumerate(seed_data.facts_for(school)):
            Fact.objects.create(school=school, label=label, value=value, order=order)
            created += 1
    for order, (key, title, text, icon) in enumerate(seed_data.FEATURES):
        _, made = FeatureBlock.objects.get_or_create(
            school=school,
            key=key,
            defaults={"title": title, "text": text, "icon": icon, "order": order},
        )
        created += made
    for order, photo in enumerate(seed_data.PHOTOS):
        if PhotoSlot.objects.for_school(school).filter(key=photo.key).exists():
            continue
        name, renditions = _shared_placeholder(photo.filename)
        PhotoSlot.objects.create(
            school=school,
            key=photo.key,
            image=name,
            renditions=renditions,
            alt_text=photo.alt_text,
            caption=photo.caption,
            order=order,
            is_placeholder=True,
        )
        created += 1
    if not PrivacyNotice.objects.filter(school=school).exists():
        PrivacyNotice.objects.create(
            school=school,
            version="draft-1",
            body=seed_data.PRIVACY_NOTICE_BODY.format(**context),
            effective_from=timezone.localdate(),
        )
        created += 1
    return created


def create_school(**fields) -> School:
    """A new school with its placeholder website, in preview (amendment §5)."""
    fields.setdefault("levels_offered", all_levels())
    school = School(**fields)
    school.full_clean()
    with transaction.atomic():
        school.save()
        provision_school(school)
    return school


def seed_first_school() -> int:
    """AD Smart School, the platform's first school, with its logo and welcome news."""
    created = 0
    school = School.objects.filter(slug=seed_data.FIRST_SCHOOL["slug"]).first()
    if school is None:
        school = create_school(**seed_data.FIRST_SCHOOL)
        with open(SEED_DIR / "brand" / seed_data.FIRST_SCHOOL_LOGO, "rb") as handle:
            school.logo.save(seed_data.FIRST_SCHOOL_LOGO, File(handle))
        created += 1
    created += provision_school(school)
    for post in seed_data.FIRST_SCHOOL_NEWS:
        _, made = NewsPost.objects.get_or_create(
            school=school,
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
    return created
