"""Plan 6A Task 3: uploaded photos on Cloudinary, through Django's normal storage API."""

import io
import urllib.error

import pytest
from cloudinary.exceptions import NotFound
from django.core.files.base import ContentFile

from apps.core import cloudinary_storage
from apps.core.cloudinary_storage import CloudinaryStorage
from apps.core.images import build_renditions
from tests.platform_content.conftest import photo

BASE = "https://res.cloudinary.com/demo/image/upload/"


class FakeCloud:
    """Cloudinary in memory: uploads, deletes, the Admin API lookup and the delivery addresses.
    Like the real CDN, a delivery address that once answered "not found" keeps answering it."""

    def __init__(self):
        self.files: dict[str, bytes] = {}
        self.remembered_404: set[str] = set()
        self.fetched: list[str] = []

    def upload(self, file, public_id, **options):
        self.files[public_id] = file.read()
        return {"public_id": public_id}

    def destroy(self, public_id, **options):
        self.files.pop(public_id, None)
        return {"result": "ok"}

    def resource(self, public_id, **options):
        if public_id not in self.files:
            raise NotFound(f"Resource not found - {public_id}")
        return {"public_id": public_id, "secure_url": f"{BASE}v7/{public_id}.png"}

    def cloudinary_url(self, public_id, **options):
        return f"{BASE}{public_id}.{options['format']}", options

    def urlopen(self, request, timeout):
        url = request if isinstance(request, str) else request.full_url
        self.fetched.append(url)
        public_id = url.removeprefix(BASE).removeprefix("v7/").rsplit(".", 1)[0]
        if public_id not in self.files or url in self.remembered_404:
            self.remembered_404.add(url)
            raise urllib.error.HTTPError(url, 404, "Not Found", {}, None)
        response = io.BytesIO(self.files[public_id])
        response.status = 200
        return response


@pytest.fixture
def cloud(monkeypatch):
    fake = FakeCloud()
    monkeypatch.setattr(cloudinary_storage.cloudinary.uploader, "upload", fake.upload)
    monkeypatch.setattr(cloudinary_storage.cloudinary.uploader, "destroy", fake.destroy)
    monkeypatch.setattr(cloudinary_storage.cloudinary.api, "resource", fake.resource)
    monkeypatch.setattr(cloudinary_storage.cloudinary.utils, "cloudinary_url", fake.cloudinary_url)
    monkeypatch.setattr(cloudinary_storage.urllib.request, "urlopen", fake.urlopen)
    return fake


def test_checking_whether_a_photo_exists_never_visits_its_address(cloud):
    assert not CloudinaryStorage().exists("schools/1/new.png")
    assert cloud.fetched == []  # a visit would make the CDN remember "not found"


def test_a_new_photo_opens_even_if_its_address_was_visited_before(cloud):
    storage = CloudinaryStorage()
    with pytest.raises(urllib.error.HTTPError):
        cloud.urlopen(storage.url("schools/1/logo.png"), timeout=1)  # e.g. an earlier attempt

    name = storage.save("schools/1/logo.png", ContentFile(b"logo"))

    assert storage.open(name).read() == b"logo"


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
