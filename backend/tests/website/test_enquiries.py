import time
from datetime import timedelta

import pytest
from django.core import mail
from django.utils import timezone

from apps.website import enquiries
from apps.website.enquiries import issue_form_token
from apps.website.models import Enquiry

pytestmark = pytest.mark.django_db
URL = "/api/public/enquiries"


@pytest.fixture
def payload():
    today = timezone.localdate()
    return {
        "parent_name": "Akua Mensah",
        "phone": "024 123 4567",
        "email": "akua@example.com",
        "child_name": "Ama Mensah",
        "child_date_of_birth": (today - timedelta(days=365 * 6)).isoformat(),
        "level_wanted": "lower_primary",
        "preferred_visit_date": (today + timedelta(days=7)).isoformat(),
        "message": "We live in Kronom.",
        "data_consent": True,
        "form_token": issue_form_token(now=time.time() - 10),
        "website": "",
    }


def test_form_token_endpoint_issues_a_token(api):
    response = api.get("/api/public/enquiries/form-token")

    assert response.status_code == 200
    assert response.json()["token"]


def test_a_valid_enquiry_is_saved_and_emailed_to_the_school(api, school, payload):
    response = api.post(URL, payload, format="json")

    assert response.status_code == 201
    assert response.json() == {"status": "received"}
    enquiry = Enquiry.objects.get()
    assert enquiry.school == school
    assert enquiry.phone == "+233241234567"
    assert enquiry.status == Enquiry.Status.NEW
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["school@example.com"]
    assert mail.outbox[0].subject == "New admission enquiry: Lower Primary (Basic 1–3)"
    assert "Ama Mensah" in mail.outbox[0].body
    assert "024 123 4567" in mail.outbox[0].body


def test_enquiries_go_to_the_school_at_the_address_used(api, school, other_school, payload):
    response = api.post(URL, payload, format="json", HTTP_HOST="brightfuture.localhost")

    assert response.status_code == 201
    assert Enquiry.objects.get().school == other_school
    assert mail.outbox[0].to == ["office@brightfuture.example"]


def test_enquiries_to_an_unknown_address_are_not_found(api, db, payload):
    response = api.post(URL, payload, format="json", HTTP_HOST="nobody.localhost")

    assert response.status_code == 404
    assert Enquiry.objects.count() == 0


def test_the_level_must_be_one_the_school_teaches(api, other_school, payload):
    payload["level_wanted"] = "jhs"

    response = api.post(URL, payload, format="json", HTTP_HOST="brightfuture.localhost")

    assert response.status_code == 400
    assert response.json()["fields"]["level_wanted"] == [
        "We don't teach that level. Choose one of the levels listed."
    ]


def test_accepts_ghanaian_letters_in_names(api, school, payload):
    payload["parent_name"] = "Ɛsi Ɔwusu-Ansah"

    assert api.post(URL, payload, format="json").status_code == 201
    assert Enquiry.objects.get().parent_name == "Ɛsi Ɔwusu-Ansah"
    assert "Ɛsi Ɔwusu-Ansah" in mail.outbox[0].body


def test_optional_fields_can_be_left_empty(api, school, payload):
    payload.update(email="", message="", preferred_visit_date=None)

    assert api.post(URL, payload, format="json").status_code == 201


def test_a_filled_honeypot_pretends_success_but_stores_nothing(api, school, payload):
    payload["website"] = "http://spam.example"

    response = api.post(URL, payload, format="json")

    assert response.status_code == 201
    assert Enquiry.objects.count() == 0
    assert mail.outbox == []


def test_submitting_too_fast_is_refused(api, school, payload):
    payload["form_token"] = issue_form_token()

    response = api.post(URL, payload, format="json")

    assert response.status_code == 400
    assert response.json()["code"] == "too_fast"
    assert Enquiry.objects.count() == 0


def test_a_tampered_token_is_refused(api, school, payload):
    payload["form_token"] = "not-a-real-token"

    assert api.post(URL, payload, format="json").json()["code"] == "form_expired"


def test_an_expired_token_is_refused(api, school, payload, monkeypatch):
    monkeypatch.setattr(enquiries, "FORM_TOKEN_MAX_AGE", -1)

    assert api.post(URL, payload, format="json").json()["code"] == "form_expired"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("phone", "0302123456"),
        ("child_date_of_birth", (timezone.localdate() + timedelta(days=1)).isoformat()),
        ("child_date_of_birth", (timezone.localdate() - timedelta(days=365 * 19)).isoformat()),
        ("preferred_visit_date", (timezone.localdate() - timedelta(days=1)).isoformat()),
        ("preferred_visit_date", (timezone.localdate() + timedelta(days=200)).isoformat()),
        ("level_wanted", "university"),
        ("data_consent", False),
        ("parent_name", " "),
        ("message", "x" * 1001),
    ],
)
def test_invalid_fields_are_reported_by_name(api, school, payload, field, value):
    payload[field] = value

    response = api.post(URL, payload, format="json")

    assert response.status_code == 400
    assert response.json()["code"] == "validation_error"
    assert field in response.json()["fields"]


def test_fourth_enquiry_from_same_phone_in_a_day_is_refused(api, school, payload):
    for _ in range(3):
        assert api.post(URL, payload, format="json").status_code == 201

    response = api.post(URL, payload, format="json")

    assert response.status_code == 429
    assert response.json()["code"] == "too_many_enquiries"


def test_the_phone_limit_is_counted_per_school(api, school, other_school, payload):
    for _ in range(3):
        api.post(URL, payload, format="json")
    payload["level_wanted"] = "kg"

    response = api.post(URL, payload, format="json", HTTP_HOST="brightfuture.localhost")

    assert response.status_code == 201


def test_ip_throttle_allows_thirty_per_hour(api, school, payload):
    payload["data_consent"] = False  # quick 400s still count towards the throttle
    statuses = [api.post(URL, payload, format="json").status_code for _ in range(31)]

    assert statuses[:30] == [400] * 30
    assert statuses[30] == 429


def test_email_failure_does_not_lose_the_enquiry(api, school, payload, monkeypatch):
    def broken_send_mail(*args, **kwargs):
        raise OSError("SMTP down")

    monkeypatch.setattr(enquiries, "send_mail", broken_send_mail)

    assert api.post(URL, payload, format="json").status_code == 201
    assert Enquiry.objects.count() == 1


def test_ip_throttle_uses_the_address_added_by_the_reverse_proxy(api, school, payload):
    """Caddy appends the real client IP; Next.js passes the header through unchanged.
    A forged first entry must not let a visitor dodge the per-IP limit."""
    payload["data_consent"] = False
    forged = [
        api.post(
            URL, payload, format="json", HTTP_X_FORWARDED_FOR=f"10.0.0.{n}, 203.0.113.7"
        ).status_code
        for n in range(31)
    ]

    assert forged[30] == 429
