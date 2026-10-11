"""Plan 6A Task 3: uploaded photos on Cloudinary, through Django's normal storage API."""

import io
import urllib.error

import pytest
from django.core.files.base import ContentFile

from apps.core import cloudinary_storage
from apps.core.cloudinary_storage import CloudinaryStorage
from apps.core.images import build_renditions
from tests.platform_content.conftest import photo

BASE = "https://res.cloudinary.com/demo/image/upload/"


class FakeCloud:
    """Cloudinary in memory: uploads, deletes and the delivery addresses."""

    def __init__(self):
        self.files: dict[str, bytes] = {}

    def upload(self, file, public_id, **options):
        self.files[public_id] = file.read()
        return {"public_id": public_id}

    def destroy(self, public_id, **options):
        self.files.pop(public_id, None)
        return {"result": "ok"}

    def cloudinary_url(self, public_id, **options):
        return f"{BASE}{public_id}.{options['format']}", options

    def urlopen(self, request, timeout):
        url = request if isinstance(request, str) else request.full_url
        public_id = url.removeprefix(BASE).rsplit(".", 1)[0]
        if public_id not in self.files:
            raise urllib.error.HTTPError(url, 404, "Not Found", {}, None)
        response = io.BytesIO(self.files[public_id])
        response.status = 200
        return response


@pytest.fixture
def cloud(monkeypatch):
    fake = FakeCloud()
    monkeypatch.setattr(cloudinary_storage.cloudinary.uploader, "upload", fake.upload)
    monkeypatch.setattr(cloudinary_storage.cloudinary.uploader, "destroy", fake.destroy)
    monkeypatch.setattr(cloudinary_storage.cloudinary.utils, "cloudinary_url", fake.cloudinary_url)
    monkeypatch.setattr(cloudinary_storage.urllib.request, "urlopen", fake.urlopen)
    return fake


def test_saves_opens_and_deletes_by_name(cloud):
    storage = CloudinaryStorage()

    name = storage.save("platform/gallery/pupils.png", ContentFile(b"png bytes"))

    assert name == "platform/gallery/pupils.png"
    assert storage.url(name) == f"{BASE}platform/gallery/pupils.png"
    assert storage.exists(name) and storage.open(name).read() == b"png bytes"
    storage.delete(name)
    assert not storage.exists(name)


def test_a_taken_name_gets_a_new_one(cloud):
    storage = CloudinaryStorage()
    first = storage.save("platform/gallery/pupils.png", ContentFile(b"one"))

    second = storage.save("platform/gallery/pupils.png", ContentFile(b"two"))

    assert second != first and storage.open(first).read() == b"one"


def test_renditions_are_built_through_cloudinary(cloud, settings):
    settings.STORAGES = {
        **settings.STORAGES,
        "default": {"BACKEND": "apps.core.cloudinary_storage.CloudinaryStorage"},
    }
    from django.core.files.storage import default_storage

    name = default_storage.save("platform/gallery/hall.png", photo(size=(1200, 800)))
    renditions = build_renditions(name)

    assert [r["width"] for r in renditions] == [480, 960, 1200]
    assert all(r["name"].endswith(".webp") for r in renditions)
    assert default_storage.url(renditions[0]["name"]).startswith(BASE)
