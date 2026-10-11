"""What the owner's website shows (business tools spec §5)."""

from apps.core.images import image_payload
from apps.platform_content.models import GalleryPhoto


def gallery_payload() -> list[dict]:
    return [
        {
            "id": photo.pk,
            "image": image_payload(photo.renditions, photo.alt_text),
            "caption": photo.caption,
        }
        for photo in GalleryPhoto.objects.public()
    ]
