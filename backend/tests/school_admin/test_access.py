import pytest
from django.urls import get_resolver
from rest_framework.test import APIClient

from apps.accounts import roles
from tests.platform_admin.conftest import make_platform_member
from tests.records import make_parent
from tests.test_tenancy_matrix import _routes

pytestmark = pytest.mark.django_db

FILL = {"<int:pk>": "1", "<str:day>": "2026-10-12"}


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


@pytest.mark.parametrize("role", ["Teacher", "Accountant", "Proprietor"])
def test_other_staff_roles_only_reach_their_own_details(client_for, role):
    client = client_for(role)
    for path in school_paths():
        expected = 200 if path == "/api/school/me" else 403
        assert client.get(path).status_code == expected, path


def test_parents_are_refused_everywhere(school):
    parent = make_parent(school)
    client = APIClient(HTTP_HOST="adsmart.localhost")
    client.force_login(parent.user)
    for path in school_paths():
        assert client.get(path).status_code == 403, path


def test_the_administrator_reads_the_dashboard(admin):
    assert admin.get("/api/school/dashboard").status_code == 200


@pytest.mark.parametrize("method", ["post", "patch", "put", "delete"])
def test_the_head_teacher_reads_but_never_writes(head, method):
    assert head.get("/api/school/dashboard").status_code == 200
    for path in school_paths():
        if path == "/api/school/me":
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
