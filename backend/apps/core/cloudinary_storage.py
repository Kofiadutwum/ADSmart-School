"""Uploaded photos on Cloudinary (Plan 6A), through Django's normal storage API.

A file keeps its Django name ("platform/gallery/pupils.png"); on Cloudinary the public ID is
the name without its extension and the extension is the delivery format. The SDK reads its
account from CLOUDINARY_URL.
"""

import posixpath
import urllib.error
import urllib.request

import cloudinary
import cloudinary.api
import cloudinary.exceptions
import cloudinary.uploader
import cloudinary.utils
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible


def _parts(name: str) -> tuple[str, str]:
    public_id, extension = posixpath.splitext(name.replace("\\", "/"))
    return public_id, extension.lstrip(".").lower()


def _download(url: str, name: str) -> ContentFile:
    with urllib.request.urlopen(url, timeout=20) as response:  # noqa: S310 - Cloudinary
        return ContentFile(response.read(), name=name)


@deconstructible
class CloudinaryStorage(Storage):
    def _save(self, name, content):
        public_id, _ = _parts(name)
        content.seek(0)
        cloudinary.uploader.upload(
            content, public_id=public_id, overwrite=True, resource_type="image"
        )
        return name

    def _open(self, name, mode="rb"):
        try:
            return _download(self.url(name), name)
        except urllib.error.HTTPError as exc:
            if exc.code != 404:
                raise
            # The CDN can still hold a "not found" from before the upload; the versioned
            # address of the stored photo has never been asked for, so it answers fresh.
            public_id, _ = _parts(name)
            stored = cloudinary.api.resource(public_id, resource_type="image")
            return _download(stored["secure_url"], name)

    def exists(self, name):
        """Asked of Cloudinary's Admin API, never the delivery address: the CDN remembers a
        "not found" for a while, which would hide a photo uploaded straight afterwards."""
        public_id, _ = _parts(name)
        try:
            cloudinary.api.resource(public_id, resource_type="image")
        except cloudinary.exceptions.NotFound:
            return False  # other errors (bad key, no network) are raised: never guess
        return True

    def delete(self, name):
        public_id, _ = _parts(name)
        cloudinary.uploader.destroy(public_id, invalidate=True, resource_type="image")

    def url(self, name):
        public_id, extension = _parts(name)
        return cloudinary.utils.cloudinary_url(
            public_id, secure=True, format=extension, resource_type="image"
        )[0]
