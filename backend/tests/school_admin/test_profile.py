import pytest

from apps.audit.models import AuditLog
from tests.helpers import jpeg_upload
from tests.records import make_class, make_year

pytestmark = pytest.mark.django_db

PROFILE = "/api/school/profile"


def test_reads_the_profile_with_the_levels_to_choose_from(head):
    body = head.get(PROFILE).json()
    assert body["name"] == "AD Smart School"
    assert body["town"] == "Kronom, Kumasi"
    assert body["logo"] is None
    assert [level["code"] for level in body["level_choices"]][:2] == ["creche", "nursery"]


def test_saves_changes_and_audits_only_what_changed(admin, school):
    response = admin.patch(
        PROFILE,
        {"motto": "Knowledge is light", "whatsapp": "024 123 4567", "town": school.town},
        format="json",
    )
    assert response.status_code == 200, response.json()
    school.refresh_from_db()
    assert school.motto == "Knowledge is light"
    assert school.whatsapp == "+233241234567"
    entry = AuditLog.objects.get(action=AuditLog.Action.UPDATED, entity_type="school.school")
    assert set(entry.new_value) == {"motto", "whatsapp"}
    assert entry.school == school


def test_the_name_and_address_slug_stay_with_the_platform_team(admin, school):
    admin.patch(PROFILE, {"name": "Renamed", "slug": "renamed"}, format="json")
    school.refresh_from_db()
    assert (school.name, school.slug) == ("AD Smart School", "adsmart")


def test_a_hard_to_read_colour_is_refused_with_a_suggestion(admin):
    response = admin.patch(PROFILE, {"brand_primary": "#ffff00"}, format="json")
    assert response.status_code == 400
    assert "Try #" in response.json()["fields"]["brand_primary"][0]


def test_a_bad_phone_number_is_refused_on_its_field(admin):
    response = admin.patch(PROFILE, {"phone": "12"}, format="json")
    assert response.status_code == 400
    assert "phone" in response.json()["fields"]


def test_a_level_with_classes_cannot_be_removed(admin, school):
    make_class(make_year(school), "basic_4")
    levels = [code for code in school.levels_offered if code != "upper_primary"]
    response = admin.patch(PROFILE, {"levels_offered": levels}, format="json")
    assert response.status_code == 400
    assert "Basic 4–6" in response.json()["fields"]["levels_offered"][0]


def test_uploads_and_removes_the_logo(admin, school):
    response = admin.post(f"{PROFILE}/logo", {"logo": jpeg_upload("logo.jpg", (400, 400))})
    assert response.status_code == 200, response.json()
    assert response.json()["logo"]["src"]
    school.refresh_from_db()
    assert school.logo and school.renditions
    assert admin.delete(f"{PROFILE}/logo").status_code == 200
    school.refresh_from_db()
    assert not school.logo and school.renditions == []


def test_a_file_that_is_not_a_photo_is_refused(admin):
    from django.core.files.uploadedfile import SimpleUploadedFile

    bad = SimpleUploadedFile("logo.jpg", b"not an image", content_type="image/jpeg")
    response = admin.post(f"{PROFILE}/logo", {"logo": bad})
    assert response.status_code == 400
    assert "logo" in response.json()["fields"]


def test_changes_ask_the_website_to_refresh(admin, settings, monkeypatch, django_capture_on_commit_callbacks):
    settings.REVALIDATE_SECRET = "s"
    sent = []
    monkeypatch.setattr("apps.platform_content.refresh._post", sent.append)
    with django_capture_on_commit_callbacks(execute=True):
        admin.patch(PROFILE, {"motto": "New"}, format="json")
    assert sent == ["sites"]
