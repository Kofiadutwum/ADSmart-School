import pytest

from tests.records import make_staff, make_student

pytestmark = pytest.mark.django_db
DETAIL_KEYS = {
    "slug",
    "name",
    "town",
    "region",
    "status",
    "is_public",
    "to_do",
    "created_at",
    "url",
    "phone",
    "email",
    "levels_offered",
    "blockers",
    "counts",
    "administrators",
}


def test_the_schools_list_shows_status_and_go_live_progress(console, school, other_school):
    rows = console.get("/api/platform/schools").json()
    assert [row["slug"] for row in rows] == ["adsmart", "brightfuture"]
    first = rows[0]
    assert first["status"] == "trial" and first["is_public"] is False and first["to_do"] == 2
    assert first["url"] == "http://adsmart.localhost:3000"


def test_search_and_status_filter(console, school, other_school):
    other_school.status = "active"
    other_school.save()
    found = console.get("/api/platform/schools?q=ejisu").json()
    assert [row["slug"] for row in found] == ["brightfuture"]
    active = console.get("/api/platform/schools?status=active").json()
    assert [row["slug"] for row in active] == ["brightfuture"]


def test_a_school_page_shows_counts_the_go_live_list_and_administrators_only(console, school):
    make_student(school)
    make_staff(school, roles_held=["Administrator"], phone="024 123 4567")
    make_staff(school, username="teacher.one")
    body = console.get("/api/platform/schools/adsmart").json()
    assert set(body) == DETAIL_KEYS  # counts, never records (amendment §4)
    assert body["counts"] == {"pupils": 1, "staff": 2, "parents": 0, "enquiries": 0}
    assert "The site has not been marked live" in body["blockers"]
    [admin] = body["administrators"]
    assert admin["username"] == "k.mensah" and admin["phone"] == "+233241234567"
    assert admin["has_authenticator"] is False and admin["last_sign_in"] is None


def test_an_unknown_school_is_not_found(console):
    assert console.get("/api/platform/schools/nowhere").status_code == 404
