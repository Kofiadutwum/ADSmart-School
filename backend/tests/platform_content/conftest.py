from io import BytesIO

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.accounts import roles
from apps.platform_content import refresh
from tests.platform_admin.conftest import make_platform_member, signed_in
from tests.website.conftest import ready_site  # noqa: F401 - shared fixture


def photo(name: str = "pupils.png", size=(1200, 800), fmt: str = "PNG") -> SimpleUploadedFile:
    buffer = BytesIO()
    Image.new("RGB", size, (200, 120, 40)).save(buffer, fmt)
    return SimpleUploadedFile(name, buffer.getvalue(), content_type=f"image/{fmt.lower()}")


@pytest.fixture
def content(db):
    """A Content member of the platform team, signed in at the admin address."""
    return signed_in(
        make_platform_member("writer", roles.PLATFORM_CONTENT, display_name="Esi Writer")
    )


@pytest.fixture
def refreshes(monkeypatch):
    """Counts requests to refresh the platform website."""
    calls: list[int] = []
    monkeypatch.setattr(refresh, "refresh_platform_site", lambda: calls.append(1))
    return calls
