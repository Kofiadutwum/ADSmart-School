from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image

from apps.core.images import build_renditions, image_payload
from tests.helpers import jpeg_bytes


def _store(name, size):
    return default_storage.save(name, ContentFile(jpeg_bytes(size)))


def test_renditions_never_upscale_and_include_the_source_width():
    name = _store("t/playground.jpg", (626, 408))

    renditions = build_renditions(name)

    assert [(r["width"], r["height"]) for r in renditions] == [(480, 313), (626, 408)]
    for rendition in renditions:
        assert rendition["name"].endswith(".webp")
        with default_storage.open(rendition["name"], "rb") as handle:
            assert Image.open(handle).format == "WEBP"


def test_large_images_get_all_three_widths():
    name = _store("t/big.jpg", (2400, 1200))

    renditions = build_renditions(name)

    assert [(r["width"], r["height"]) for r in renditions] == [(480, 240), (960, 480), (1600, 800)]


def test_tiny_images_get_one_rendition_at_their_own_width():
    name = _store("t/tiny.jpg", (235, 141))

    renditions = build_renditions(name)

    assert [(r["width"], r["height"]) for r in renditions] == [(235, 141)]


def test_rebuilding_replaces_old_renditions_instead_of_duplicating():
    name = _store("t/again.jpg", (900, 600))

    first = build_renditions(name)
    second = build_renditions(name)

    assert [r["name"] for r in first] == [r["name"] for r in second]


def test_image_payload_builds_a_srcset_from_the_renditions():
    renditions = [
        {"width": 480, "height": 240, "name": "a-480w.webp"},
        {"width": 960, "height": 480, "name": "a-960w.webp"},
    ]

    assert image_payload(renditions, "Children reading") == {
        "src": "/media/a-960w.webp",
        "srcset": "/media/a-480w.webp 480w, /media/a-960w.webp 960w",
        "width": 960,
        "height": 480,
        "alt": "Children reading",
    }


def test_image_payload_is_none_without_renditions():
    assert image_payload([], "anything") is None
