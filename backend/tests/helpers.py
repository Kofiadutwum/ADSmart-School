from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image


def jpeg_bytes(size=(800, 600)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, (16, 120, 190)).save(buffer, "JPEG")
    return buffer.getvalue()


def jpeg_upload(name="photo.jpg", size=(800, 600)) -> SimpleUploadedFile:
    return SimpleUploadedFile(name, jpeg_bytes(size), content_type="image/jpeg")


SCHOOL_DEFAULTS = {
    "name": "AD Smart School",
    "founded_year": 2001,
    "town": "Kronom, Kumasi",
    "region": "Ashanti",
    "phone": "+233545875881",
    "whatsapp": "+233545875881",
    "email": "school@example.com",
    "map_query": "Kronom, Kumasi, Ghana",
}


def make_school(slug="adsmart", **fields):
    from apps.school.models import School

    return School.objects.create(slug=slug, **{**SCHOOL_DEFAULTS, **fields})


PASSWORD = "correct horse battery"


def sign_in(api, identifier, password=PASSWORD, kind="staff", **extra):
    payload = {"kind": kind, "identifier": identifier, "password": password}
    payload.update({key: value for key, value in extra.items() if not key.startswith("HTTP_")})
    headers = {key: value for key, value in extra.items() if key.startswith("HTTP_")}
    return api.post("/api/auth/login", payload, format="json", **headers)
