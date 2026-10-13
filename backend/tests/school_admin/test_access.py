import pytest
from django.urls import get_resolver, resolve
from rest_framework.test import APIClient

from apps.accounts import roles
from tests.platform_admin.conftest import make_platform_member
from tests.records import make_parent
from tests.test_tenancy_matrix import _routes

pytestmark = pytest.mark.django_db

FILL = {"<int:pk>": "1", "<int:student>": "1", "<str:day>": "2026-10-12", "<str:kind>": "PHOTO_USE"}


def school_paths() -> list[str]:
    """Every /api/school/ route, so routes added later are checked too."""
    paths = []
    for route in _routes(get_resolver().url_patterns):
        if route.startswith("api/school/"):
            for token, value in FILL.items():
                route = route.replace(token, value)
            paths.append("/" + route)
    return paths


def test_there_are_school_routes():
    assert "/api/school/dashboard" in school_paths()


def test_signed_out_visitors_are_refused(school):
    visitor = APIClient(HTTP_HOST="adsmart.localhost")
    for path in school_paths():
        assert visitor.get(path).json()["code"] == "not_authenticated", path


def view_class(path: str):
    return resolve(path).func.view_class


STAFF = [role for role in roles.SCHOOL_ROLES if role not in (roles.PARENT, roles.STUDENT)]


@pytest.mark.parametrize("role", STAFF)
def test_each_role_reads_only_what_its_views_allow(client_for, role):
    """Expectations come from each view's read_roles, so new routes are checked too."""
    client = client_for(role)
    for path in school_paths():
        response = client.get(path)
        if role in view_class(path).read_roles:
            denied = response.status_code == 403 and response.json()["code"] == "permission_denied"
            assert not denied, path
        else:
            assert response.status_code == 403, path
            assert response.json()["code"] == "permission_denied", path


def test_parents_are_refused_everywhere(school):
    parent = make_parent(school)
    client = APIClient(HTTP_HOST="adsmart.localhost")
    client.force_login(parent.user)
    for path in school_paths():
        assert client.get(path).status_code == 403, path


def test_the_administrator_reads_the_dashboard(admin):
    assert admin.get("/api/school/dashboard").status_code == 200


@pytest.mark.parametrize("method", ["post", "patch", "put", "delete"])
def test_the_head_teacher_writes_only_where_allowed(head, method):
    assert head.get("/api/school/dashboard").status_code == 200
    for path in school_paths():
        if roles.HEAD_TEACHER in view_class(path).write_roles:
            continue
        assert getattr(head, method)(path, {}, format="json").status_code in (403, 405), path


def test_platform_staff_count_as_signed_out_at_a_school(school):
    ops = make_platform_member("ops", roles.PLATFORM_OWNER)
    client = APIClient(HTTP_HOST="adsmart.localhost")
    client.force_login(ops)
    assert client.get("/api/school/dashboard").json()["code"] == "not_authenticated"


def test_me_shows_a_teachers_roles_and_profile(client_for):
    teacher = client_for("Teacher")
    body = teacher.get("/api/school/me").json()
    assert body["roles"] == ["Teacher"]
    assert body["staff"]["name"] == "Kofi Mensah"
    assert body["teaching"] == [] and body["class_teacher_of"] == []
