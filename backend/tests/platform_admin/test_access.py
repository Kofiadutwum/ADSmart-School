import pytest
from django.urls import get_resolver
from rest_framework.test import APIClient

from tests.records import make_staff
from tests.test_tenancy_matrix import _routes

pytestmark = pytest.mark.django_db


def platform_paths() -> list[str]:
    """Every /api/platform/ route, so routes added later are checked too."""
    routes = [
        route for route in _routes(get_resolver().url_patterns) if route.startswith("api/platform/")
    ]
    return [
        "/" + route.replace("<slug:slug>", "adsmart").replace("<int:pk>", "1") for route in routes
    ]


@pytest.mark.parametrize("method", ["get", "post", "patch"])
def test_signed_out_visitors_are_refused_everywhere(method, school):
    paths = platform_paths()
    assert paths
    visitor = APIClient(HTTP_HOST="admin.localhost")
    for path in paths:
        response = getattr(visitor, method)(path)
        assert response.status_code == 403, path
        assert response.json()["code"] == "not_authenticated", path


def test_school_staff_are_refused_everywhere(school):
    staff = make_staff(school, roles_held=["Administrator"])
    client = APIClient(HTTP_HOST="adsmart.localhost")
    client.force_login(staff.user)
    for path in platform_paths():
        response = client.get(path)
        assert response.status_code == 403, path
        assert response.json()["code"] == "permission_denied", path


def test_platform_staff_at_a_school_address_count_as_signed_out(ops, school):
    client = APIClient(HTTP_HOST="adsmart.localhost")
    client.force_login(ops)
    assert client.get("/api/platform/schools").json()["code"] == "not_authenticated"
