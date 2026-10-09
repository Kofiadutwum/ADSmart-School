from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image


def jpeg_bytes(size=(800, 600)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, (16, 120, 190)).save(buffer, "JPEG")
    return buffer.getvalue()


def jpeg_upload(name="photo.jpg", size=(800, 600)) -> SimpleUploadedFile:
    return SimpleUploadedFile(name, jpeg_bytes(size), content_type="image/jpeg")
