import pytest
from django.core.cache import cache

from tests.helpers import make_school


@pytest.fixture(autouse=True)
def _isolated_media_and_cache(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / "media"
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api():
    from rest_framework.test import APIClient

    # Browser calls reach Django through Next.js, which forwards the school's address.
    return APIClient(HTTP_HOST="adsmart.localhost")


@pytest.fixture
def school(db):
    return make_school()


@pytest.fixture
def other_school(db):
    return make_school(
        "brightfuture",
        name="Bright Future Academy",
        founded_year=None,
        town="Ejisu",
        phone="+233201234567",
        whatsapp="",
        email="office@brightfuture.example",
        levels_offered=["kg", "lower_primary"],
    )
