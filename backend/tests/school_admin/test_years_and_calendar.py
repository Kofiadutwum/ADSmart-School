from datetime import date

import pytest

from apps.academics.models import AcademicYear, CalendarDay, Term
from apps.audit.models import AuditLog
from tests.records import make_class, make_staff, make_year

pytestmark = pytest.mark.django_db

YEAR = {"name": "2026/2027", "start_date": "2026-09-01", "end_date": "2027-07-31"}
TERM = {"number": 1, "start_date": "2026-09-08", "end_date": "2026-12-18"}


def add_year(client, **fields):
    return client.post("/api/school/years", {**YEAR, **fields}, format="json")


def test_adds_a_year_and_makes_it_the_only_current_one(admin, school):
    old = make_year(school, "2025/2026")
    response = add_year(admin, is_current=True)
    assert response.status_code == 201, response.json()
    assert response.json()["is_current"] is True
    old.refresh_from_db()
    assert old.is_current is False
    years = admin.get("/api/school/years").json()
    assert [year["name"] for year in years] == ["2026/2027", "2025/2026"]


def test_a_year_name_must_be_new_and_the_dates_in_order(admin, school):
    make_year(school)
    assert "name" in add_year(admin).json()["fields"]
    response = add_year(admin, name="2027/2028", end_date="2026-01-01")
    assert response.status_code == 400
    assert "end_date" in response.json()["fields"]


def test_adding_a_term_fills_its_weekdays_and_public_holidays(admin, school):
    year = make_year(school)
    response = admin.post(f"/api/school/years/{year.pk}/terms", TERM, format="json")
    assert response.status_code == 201, response.json()
    term = Term.objects.get(academic_year=year)
    assert CalendarDay.objects.filter(term=term).count() > 60
    assert CalendarDay.objects.get(date=date(2026, 12, 4)).type == "HOLIDAY"  # Farmers' Day
    assert admin.get("/api/school/years").json()[0]["terms"][0]["number"] == 1


def test_a_term_outside_its_year_or_repeated_is_refused(admin, school):
    year = make_year(school)
    url = f"/api/school/years/{year.pk}/terms"
    outside = admin.post(url, {**TERM, "end_date": "2027-09-01"}, format="json")
    assert outside.status_code == 400 and "start_date" in outside.json()["fields"]
    admin.post(url, TERM, format="json")
    again = admin.post(
        url, {**TERM, "start_date": "2027-01-05", "end_date": "2027-04-01"}, format="json"
    )
    assert again.status_code == 400 and "number" in again.json()["fields"]


def test_edits_a_year_but_keeps_its_terms_inside(admin, school):
    year = make_year(school)
    admin.post(f"/api/school/years/{year.pk}/terms", TERM, format="json")
    shrink = admin.patch(
        f"/api/school/years/{year.pk}", {"start_date": "2026-10-01"}, format="json"
    )
    assert shrink.status_code == 400
    renamed = admin.patch(f"/api/school/years/{year.pk}", {"is_current": False}, format="json")
    assert renamed.json()["is_current"] is False


def test_a_year_with_classes_cannot_be_deleted(admin, school):
    year = make_year(school)
    make_class(year, "basic_1")
    response = admin.delete(f"/api/school/years/{year.pk}")
    assert response.status_code == 400
    assert "classes" in response.json()["message"]
    empty = make_year(school, "2027/2028", current=False)
    assert admin.delete(f"/api/school/years/{empty.pk}").status_code == 204
    assert not AcademicYear.objects.filter(pk=empty.pk).exists()


def test_a_term_with_assignments_cannot_be_deleted(admin, school):
    from apps.academics.models import ClassTeacherAssignment

    year = make_year(school)
    admin.post(f"/api/school/years/{year.pk}/terms", TERM, format="json")
    term = Term.objects.get()
    teacher = make_staff(school, username="t.one")
    ClassTeacherAssignment.objects.create(
        school=school, school_class=make_class(year, "basic_1"), staff=teacher, term=term
    )
    assert admin.delete(f"/api/school/terms/{term.pk}").status_code == 400
    ClassTeacherAssignment.objects.all().delete()
    assert admin.delete(f"/api/school/terms/{term.pk}").status_code == 204


def test_another_schools_year_is_not_found(admin, other_school):
    theirs = make_year(other_school)
    assert (
        admin.patch(
            f"/api/school/years/{theirs.pk}", {"is_current": False}, format="json"
        ).status_code
        == 404
    )
    assert (
        admin.post(f"/api/school/years/{theirs.pk}/terms", TERM, format="json").status_code == 404
    )


def test_the_month_view_lists_days_and_terms(head, admin, school):
    year = make_year(school)
    admin.post(f"/api/school/years/{year.pk}/terms", TERM, format="json")
    body = head.get("/api/school/calendar?month=2026-12").json()
    assert body["month"] == "2026-12"
    days = {day["date"]: day for day in body["days"]}
    assert days["2026-12-04"]["type"] == "HOLIDAY"
    assert "2026-12-21" not in days  # after the term
    assert body["terms"][0]["name"] == "Term 1, 2026/2027"


def test_a_bad_month_is_refused(head):
    assert head.get("/api/school/calendar?month=December").status_code == 400


def test_setting_a_day_creates_or_updates_it_and_is_audited(admin, school):
    year = make_year(school)
    admin.post(f"/api/school/years/{year.pk}/terms", TERM, format="json")
    url = "/api/school/calendar/2026-10-16"
    response = admin.put(url, {"type": "HOLIDAY", "note": "Sports day"}, format="json")
    assert response.status_code == 200, response.json()
    assert admin.put(url, {"type": "CLOSING", "note": ""}, format="json").status_code == 200
    day = CalendarDay.objects.get(date=date(2026, 10, 16))
    assert (day.type, day.note) == ("CLOSING", "")
    saturday = admin.put("/api/school/calendar/2026-10-17", {"type": "OPEN"}, format="json")
    assert saturday.status_code == 200
    entries = AuditLog.objects.filter(entity_type="academics.calendarday")
    assert entries.count() >= 3
    assert entries.filter(old_value={"type": "HOLIDAY", "note": "Sports day"}).exists()


def test_a_day_outside_every_term_cannot_be_set(admin, school):
    make_year(school)
    response = admin.put("/api/school/calendar/2026-08-03", {"type": "OPEN"}, format="json")
    assert response.status_code == 400
    assert "term" in response.json()["message"]


def test_clearing_a_day_removes_it(admin, school):
    year = make_year(school)
    admin.post(f"/api/school/years/{year.pk}/terms", TERM, format="json")
    assert admin.delete("/api/school/calendar/2026-10-16").status_code == 204
    assert not CalendarDay.objects.filter(date=date(2026, 10, 16)).exists()
    assert admin.delete("/api/school/calendar/2026-10-16").status_code == 204  # already clear
    assert (
        admin.put("/api/school/calendar/not-a-date", {"type": "OPEN"}, format="json").status_code
        == 404
    )
