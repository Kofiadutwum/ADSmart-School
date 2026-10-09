import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _isolated_media_and_cache(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / "media"
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api():
    from rest_framework.test import APIClient

    return APIClient()
