import pytest
from django.http import Http404
from django.utils import timezone

from apps.core.exceptions import ApiError
from apps.school.hosts import resolve_host, school_for_host
from apps.school.models import School, SchoolDomain

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    ("host", "kind"),
    [
        ("localhost", "platform"),
        ("localhost:3000", "platform"),
        ("www.localhost", "platform"),
        ("admin.localhost:3000", "admin"),
    ],
)
def test_platform_and_admin_addresses(host, kind):
    assert resolve_host(host).kind == kind


def test_a_school_subdomain(school):
    site = resolve_host("AdSmart.localhost:3000")
    assert site.kind == "school" and site.school == school


def test_a_verified_custom_domain(school):
    SchoolDomain.objects.create(
        school=school, domain="adsmartschool.edu.gh", verified_at=timezone.now()
    )
    assert resolve_host("adsmartschool.edu.gh").school == school


@pytest.mark.parametrize(
    "host",
    [
        "pending.example",
        "nobody.localhost",
        "a.adsmart.localhost",
        "example.com",
        "127.0.0.1:8000",
        "",
    ],
)
def test_unknown_and_unverified_addresses(school, host):
    SchoolDomain.objects.create(school=school, domain="pending.example")
    assert resolve_host(host) is None


def test_school_for_host_refuses_unknown_and_suspended_schools(school):
    with pytest.raises(Http404):
        school_for_host("nobody.localhost")
    school.status = School.Status.SUSPENDED
    school.save()
    with pytest.raises(ApiError) as caught:
        school_for_host("adsmart.localhost")
    assert caught.value.status_code == 503
    assert caught.value.get_codes() == "suspended"
