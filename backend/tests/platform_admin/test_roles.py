"""Business tools spec §2: each team role reaches only its own areas; Owner reaches all."""

import pytest

from apps.accounts import roles
from apps.platform_admin.permissions import ROLE_FOR_AREA
from tests.platform_admin.test_access import platform_paths

pytestmark = pytest.mark.django_db


def area(path: str) -> str:
    return path.split("/")[3]  # /api/platform/<area>/…


def test_every_platform_route_declares_its_area():
    assert {area(path) for path in platform_paths()} <= set(ROLE_FOR_AREA)


@pytest.mark.parametrize(
    "role", [roles.PLATFORM_FINANCE, roles.PLATFORM_CONTENT, roles.PLATFORM_SUPPORT]
)
def test_each_role_reaches_only_its_areas(role, member_client, school):
    client = member_client(role)
    for path in platform_paths():
        response = client.get(path)
        if ROLE_FOR_AREA[area(path)] == role:
            assert response.status_code != 403, path
        else:
            assert response.status_code == 403, path
            assert response.json()["code"] == "permission_denied", path


def test_owner_reaches_everything(console, school):
    for path in platform_paths():
        assert console.get(path).status_code != 403, path


def test_staff_without_a_role_are_refused(member_client, school):
    client = member_client()
    for path in platform_paths():
        assert client.get(path).status_code == 403, path
