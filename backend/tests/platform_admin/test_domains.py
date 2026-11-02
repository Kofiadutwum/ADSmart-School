import pytest

from apps.school.hosts import school_for_host
from apps.support import api as support_api

pytestmark = pytest.mark.django_db


def add(console, school, domain):
    return console.post(
        f"/api/platform/schools/{school.slug}/domains", {"domain": domain}, format="json"
    )


def check(console, school, pk):
    url = f"/api/platform/schools/{school.slug}/domains/{pk}"
    return console.post(url, {"action": "check"}, format="json")


def test_a_free_vercel_address_is_ready_without_dns_records(console, school):
    domain = add(console, school, "adtestschool.vercel.app").json()

    assert check(console, school, domain["id"]).status_code == 200

    assert school_for_host("adtestschool.vercel.app") == school


def test_the_platforms_own_addresses_cannot_be_given_to_a_school(console, school, settings):
    own = (settings.PLATFORM_DOMAIN, f"www.{settings.PLATFORM_DOMAIN}", settings.ADMIN_HOST)

    for taken in own:
        assert "domain" in add(console, school, taken).json()["fields"]


def test_any_other_address_still_needs_its_txt_record(console, school, monkeypatch):
    monkeypatch.setattr(support_api, "txt_records", lambda name: [])
    domain = add(console, school, "adtestschool.edu.gh").json()

    assert check(console, school, domain["id"]).json()["code"] == "not_verified"
