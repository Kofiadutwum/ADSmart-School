"""Uploaded photos on Cloudinary (Plan 6A), through Django's normal storage API.

A file keeps its Django name ("platform/gallery/pupils.png"); on Cloudinary the public ID is
the name without its extension and the extension is the delivery format. The SDK reads its
account from CLOUDINARY_URL.
"""

import posixpath
import urllib.error
import urllib.request

import cloudinary
import cloudinary.uploader
import cloudinary.utils
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible


def _parts(name: str) -> tuple[str, str]:
    public_id, extension = posixpath.splitext(name.replace("\\", "/"))
    return public_id, extension.lstrip(".").lower()


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
        with urllib.request.urlopen(self.url(name), timeout=20) as response:  # noqa: S310
            return ContentFile(response.read(), name=name)

    def exists(self, name):
        """A HEAD request to the delivery address: no Admin API quota is used."""
        request = urllib.request.Request(self.url(name), method="HEAD")
        try:
            with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310
                return response.status == 200
        except urllib.error.HTTPError:
            return False  # other errors (no network) are raised: never guess

    def delete(self, name):
        public_id, _ = _parts(name)
        cloudinary.uploader.destroy(public_id, invalidate=True, resource_type="image")

    def url(self, name):
        public_id, extension = _parts(name)
        return cloudinary.utils.cloudinary_url(
            public_id, secure=True, format=extension, resource_type="image"
        )[0]
