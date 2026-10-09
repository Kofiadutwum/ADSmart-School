"""Responsive WebP renditions for uploaded photos (spec §2.3)."""

from io import BytesIO

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image, ImageOps

RENDITION_WIDTHS = (480, 960, 1600)
WEBP_QUALITY = 78


def _target_widths(source_width: int) -> list[int]:
    widths = {width for width in RENDITION_WIDTHS if width < source_width}
    widths.add(min(source_width, RENDITION_WIDTHS[-1]))
    return sorted(widths)


def build_renditions(source_name: str) -> list[dict]:
    with default_storage.open(source_name, "rb") as handle:
        image = ImageOps.exif_transpose(Image.open(handle))
        image.load()
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGB")

    source_width, source_height = image.size
    stem = source_name.rsplit(".", 1)[0]
    renditions = []
    for width in _target_widths(source_width):
        height = round(source_height * width / source_width)
        resized = (
            image
            if width == source_width
            else image.resize((width, height), Image.Resampling.LANCZOS)
        )
        buffer = BytesIO()
        resized.save(buffer, "WEBP", quality=WEBP_QUALITY, method=6)
        name = f"{stem}-{width}w.webp"
        if default_storage.exists(name):
            default_storage.delete(name)
        saved_name = default_storage.save(name, ContentFile(buffer.getvalue()))
        renditions.append({"width": width, "height": height, "name": saved_name})
    return renditions


def image_payload(renditions: list[dict], alt: str) -> dict | None:
    if not renditions:
        return None
    largest = renditions[-1]
    return {
        "src": default_storage.url(largest["name"]),
        "srcset": ", ".join(f"{default_storage.url(r['name'])} {r['width']}w" for r in renditions),
        "width": largest["width"],
        "height": largest["height"],
        "alt": alt,
    }
