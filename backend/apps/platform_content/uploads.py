"""Checks for photos uploaded in the admin area (business tools spec §5.2, §5.3, §5.5)."""

from django.conf import settings
from django.core.files.storage import default_storage
from PIL import Image
from rest_framework import serializers

PHOTO_TYPES = {"JPEG", "PNG", "WEBP"}
WRONG_TYPE = "Choose a JPEG, PNG or WebP photo."


def validate_photo(file, *, max_mb: int | None = None):
    max_mb = min(max_mb or settings.PHOTO_MAX_MB, settings.PHOTO_MAX_MB)
    if file.size > max_mb * 1024 * 1024:
        raise serializers.ValidationError(f"That photo is larger than {max_mb} MB.")
    try:
        with Image.open(file) as image:
            kind = image.format
            image.verify()
    except Exception as exc:  # Pillow raises many types for files that are not images
        raise serializers.ValidationError(WRONG_TYPE) from exc
    if kind not in PHOTO_TYPES:
        raise serializers.ValidationError(WRONG_TYPE)
    file.seek(0)
    return file


def delete_photo_files(field_file, renditions: list[dict]) -> None:
    """A removed photo stops being reachable at its old address too."""
    for rendition in renditions:
        default_storage.delete(rendition["name"])
    if field_file:
        field_file.delete(save=False)


class FormBoolean(serializers.BooleanField):
    """Multipart forms leave unticked boxes out; an absent box takes the field's default."""

    default_empty_html = serializers.empty
