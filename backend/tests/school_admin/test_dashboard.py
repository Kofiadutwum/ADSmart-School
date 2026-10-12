from datetime import date

import pytest

from apps.people.models import EmergencyContact
from apps.people.services import enrol
from apps.website.models import Enquiry, PhotoSlot
from tests.helpers import jpeg_upload
from tests.records import make_class, make_staff, make_student, make_year

pytestmark = pytest.mark.django_db


def checklist(client) -> dict:
    return {item["key"]: item for item in client.get("/api/school/dashboard").json()["checklist"]}


def test_counts_pupils_by_level_staff_classes_and_new_enquiries(admin, school):
    year = make_year(school)
    basic1 = make_class(year, "basic_1")
    make_class(year, "kg_1")
    enrol(make_student(school), basic1, start_date=date(2026, 9, 8))
    make_student(school, first_name="Yaw")  # admitted but not yet in a class
    Enquiry.objects.create(
        school=school,
        parent_name="Akua",
        phone="+233241234567",
        child_name="Esi",
        child_date_of_birth=date(2020, 1, 1),
        level_wanted="kg",
        data_consent=True,
    )
    counts = admin.get("/api/school/dashboard").json()["counts"]
    assert counts["students_by_level"] == [{"band": "lower_primary", "label": "Basic 1–3", "count": 1}]
    assert counts["not_in_class"] == 1
    assert counts["classes"] == 2
    assert counts["staff"] == 1  # the Administrator
    assert counts["new_enquiries"] == 1


def test_the_checklist_lists_every_item_in_order(admin):
    keys = [item["key"] for item in admin.get("/api/school/dashboard").json()["checklist"]]
    assert keys == [
        "placeholder_photos",
        "demo_records",
        "sms_provider",
        "second_factor",
        "profile",
        "emergency_contacts",
        "site_live",
    ]


def test_placeholder_photos_and_demo_records_keep_items_open(admin, school):
    PhotoSlot.objects.create(
        school=school, key="hero", image=jpeg_upload(), alt_text="Pupils", is_placeholder=True
    )
    make_staff(school, username="demo.teacher", is_demo=True)
    items = checklist(admin)
    assert not items["placeholder_photos"]["done"]
    assert "1" in items["placeholder_photos"]["detail"]
    assert not items["demo_records"]["done"]


def test_staff_who_cannot_receive_codes_keep_second_factor_open(admin, school):
    assert checklist(admin)["second_factor"]["done"] is False  # the Administrator has no contact
    admin.staff.user.email = "admin@example.com"
    admin.staff.user.save()
    assert checklist(admin)["second_factor"]["done"] is True
    make_staff(school, username="t.only", roles_held=["Teacher"])  # teachers need no code
    assert checklist(admin)["second_factor"]["done"] is True


def test_the_sms_provider_is_open_until_a_real_one_is_set(admin, settings):
    settings.SMS_BACKEND = "apps.notifications.backends.ConsoleBackend"
    assert checklist(admin)["sms_provider"]["done"] is False
    settings.SMS_BACKEND = "apps.notifications.backends.ArkeselBackend"
    assert checklist(admin)["sms_provider"]["done"] is True


def test_the_profile_needs_an_address_gps_and_logo(admin, school):
    assert checklist(admin)["profile"]["done"] is False
    school.address = "12 Palm Street"
    school.ghana_post_gps = "AK-039-5028"
    school.logo = jpeg_upload("logo.jpg", (300, 300))
    school.save()
    assert checklist(admin)["profile"]["done"] is True


def test_pupils_need_two_emergency_contacts(admin, school):
    pupil = make_student(school)
    assert checklist(admin)["emergency_contacts"]["done"] is False
    for priority in (1, 2):
        EmergencyContact.objects.create(
            school=school, student=pupil, name="Aunt", phone="+233241234567",
            relationship="Aunt", priority=priority,
        )
    assert checklist(admin)["emergency_contacts"]["done"] is True


def test_the_site_is_open_until_marked_live(admin):
    assert checklist(admin)["site_live"]["done"] is False
