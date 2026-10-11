"""Plan 6A Task 2: email, text messages and upload sizes in production."""

import os
from io import BytesIO

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.accounts import roles
from apps.notifications.backends import UnavailableBackend
from apps.notifications.models import SmsMessage
from apps.notifications.sms import Purpose, send_sms
from config.mail import mailers
from tests.platform_admin.conftest import make_platform_member, signed_in

pytestmark = pytest.mark.django_db


def test_email_goes_through_smtp_when_a_server_is_given():
    smtp = mailers(
        {
            "SMTP_HOST": "smtp.gmail.com",
            "SMTP_PORT": "587",
            "SMTP_USERNAME": "owner@example.com",
            "SMTP_PASSWORD": "app-password",
        }
    )["default"]

    assert smtp["BACKEND"] == "django.core.mail.backends.smtp.EmailBackend"
    assert smtp["OPTIONS"] == {
        "host": "smtp.gmail.com",
        "port": 587,
        "username": "owner@example.com",
        "password": "app-password",
        "use_tls": True,
        "timeout": 10,
    }


def test_email_stays_in_the_console_without_a_server():
    assert mailers({})["default"]["BACKEND"] == "django.core.mail.backends.console.EmailBackend"


def test_without_a_text_provider_a_text_is_reported_as_failed(settings):
    settings.SMS_BACKEND = "apps.notifications.backends.UnavailableBackend"

    message = send_sms(
        "+233244000111", "ADsmartschool: your code is 123456", purpose=Purpose.SIGN_IN_CODE
    )

    assert message.status == SmsMessage.Status.FAILED
    with pytest.raises(RuntimeError, match="No SMS provider"):
        UnavailableBackend().send("+233244000111", "hello")


def test_the_photo_size_limit_comes_from_settings(settings):
    settings.PHOTO_MAX_MB = 1
    content = signed_in(make_platform_member("writer", roles.PLATFORM_CONTENT))
    noise = Image.frombytes("RGB", (800, 800), os.urandom(800 * 800 * 3))
    buffer = BytesIO()
    noise.save(buffer, "PNG")  # random pixels barely compress: about 1.9 MB
    big = SimpleUploadedFile("noise.png", buffer.getvalue(), content_type="image/png")

    response = content.post(
        "/api/platform/website/gallery", {"image": big, "alt_text": "Big"}, format="multipart"
    )

    assert response.json()["fields"]["image"] == ["That photo is larger than 1 MB."]
