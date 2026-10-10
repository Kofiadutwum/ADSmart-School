import time
from datetime import date

import pytest
from django.core import mail

from apps.consent.models import PrivacyNotice
from apps.school.models import School
from apps.website.enquiries import issue_form_token
from apps.website.models import Lead
from apps.website.seeding import seed_website

pytestmark = pytest.mark.django_db
URL = "/api/public/platform/leads"
PLATFORM = "localhost:3000"


@pytest.fixture
def lead():
    return {
        "school_name": "Bright Future Academy",
        "contact_name": "Kwame Asante",
        "phone": "020 123 4567",
        "email": "",
        "town": "Ejisu",
        "message": "",
        "data_consent": True,
        "form_token": issue_form_token(now=time.time() - 10),
        "website": "",
    }


def test_the_platform_lists_only_live_schools(api, ready_site, other_school, settings):
    settings.SITE_URL_TEMPLATE = "https://{host}"

    body = api.get("/api/public/platform").json()

    assert body["name"] == "SchoolSite" and body["email"] == "hello@schoolsite.test"
    assert body["phone"] == "+233244000000" and body["phone_display"] == "024 400 0000"
    assert body["url"] == "https://localhost"
    assert body["schools"] == [
        {
            "name": "AD Smart School",
            "town": "Kronom, Kumasi",
            "region": "Ashanti",
            "url": "https://adsmart.localhost",
        }
    ]
    assert body["is_public"] is False


def test_suspended_schools_are_not_listed(api, ready_site):
    ready_site.status = School.Status.SUSPENDED
    ready_site.save()

    assert api.get("/api/public/platform").json()["schools"] == []


def test_the_platform_is_public_once_its_own_notice_is_reviewed(api, db):
    PrivacyNotice.objects.create(
        version="p1", body="Platform notice.", effective_from=date(2026, 1, 1), is_draft=False
    )

    assert api.get("/api/public/platform").json()["is_public"] is True
    notice = api.get("/api/public/platform/privacy-notice").json()
    assert notice["body"] == "Platform notice." and notice["is_draft"] is False


def test_seeding_drafts_the_platform_notice_once(db):
    seed_website()
    seed_website()

    notice = PrivacyNotice.objects.get(school=None)
    assert notice.is_draft and "SchoolSite" in notice.body


def test_a_lead_is_saved_and_emailed_to_the_platform(api, db, lead):
    response = api.post(URL, lead, format="json", HTTP_HOST=PLATFORM)

    assert response.status_code == 201
    saved = Lead.objects.get()
    assert saved.phone == "+233201234567" and saved.status == Lead.Status.NEW
    assert mail.outbox[0].to == ["hello@schoolsite.test"]
    assert mail.outbox[0].subject == "New school enquiry: Bright Future Academy (Ejisu)"
    assert "020 123 4567" in mail.outbox[0].body


def test_leads_are_taken_only_on_the_platform_site(api, school, lead):
    assert api.post(URL, lead, format="json").status_code == 404
    assert not Lead.objects.exists()


def test_lead_honeypot_and_validation(api, db, lead):
    trapped = api.post(URL, {**lead, "website": "spam"}, format="json", HTTP_HOST=PLATFORM)
    assert trapped.status_code == 201 and not Lead.objects.exists()

    refused = api.post(URL, {**lead, "data_consent": False}, format="json", HTTP_HOST=PLATFORM)
    assert refused.status_code == 400 and "data_consent" in refused.json()["fields"]


def test_fourth_lead_from_a_phone_in_a_day_is_refused(api, db, lead):
    for _ in range(3):
        assert api.post(URL, lead, format="json", HTTP_HOST=PLATFORM).status_code == 201

    response = api.post(URL, lead, format="json", HTTP_HOST=PLATFORM)

    assert response.status_code == 429 and response.json()["code"] == "too_many_requests"
