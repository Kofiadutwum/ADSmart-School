"""What the owner's website shows (business tools spec §5)."""

from apps.core.images import image_payload
from apps.platform_content.articles import summary
from apps.platform_content.models import (
    Article,
    FaqItem,
    GalleryPhoto,
    PlatformSettings,
    Testimonial,
)
from apps.website.services import is_site_public


def gallery_payload() -> list[dict]:
    return [
        {
            "id": photo.pk,
            "image": image_payload(photo.renditions, photo.alt_text),
            "caption": photo.caption,
        }
        for photo in GalleryPhoto.objects.public()
    ]


def latest_articles_payload() -> list[dict]:
    return [summary(article) for article in Article.objects.public()[:3]]


def testimonials_payload() -> list[dict]:
    return [
        {
            "id": comment.pk,
            "quote": comment.quote,
            "name": comment.person_name,
            "role": comment.person_role,
            "school": comment.school_name,
            "school_url": (
                comment.school.base_url()
                if comment.school and is_site_public(comment.school)
                else None
            ),
            "photo": image_payload(comment.renditions, comment.person_name),
        }
        for comment in Testimonial.objects.public().select_related("school")
    ]


def faqs_payload() -> list[dict]:
    return [
        {"id": item.pk, "question": item.question, "answer": item.answer}
        for item in FaqItem.objects.filter(visible=True)
    ]


def whatsapp_channel() -> str:
    found = PlatformSettings.objects.filter(pk=1).first()
    return found.whatsapp_channel_url if found else ""
