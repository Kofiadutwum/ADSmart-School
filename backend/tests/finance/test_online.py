"""Paying online (SMS spec §18): Paystack's word is checked and recorded once, payment links show
only what they must, and the USSD menu."""

import hashlib
import hmac
import json

import pytest
from rest_framework.test import APIClient

from apps.finance import online
from apps.finance.models import OnlinePayment, Payment, PaymentLink
from tests.records import make_student

pytestmark = pytest.mark.django_db
SECRET = "sk_test_example"


@pytest.fixture
def paystack(settings, monkeypatch):
    settings.PAYSTACK_SECRET_KEY = SECRET
    answers = {"status": "success", "amount": 5_000, "currency": "GHS"}
    calls = []

    def fake(method, path, payload=None):
        calls.append(path)
        if path.startswith("/transaction/verify/"):
            return {"data": {**answers, "id": 99}}
        return {"status": True, "data": {"authorization_url": "https://checkout.paystack.com/x"}}

    monkeypatch.setattr(online, "paystack", fake)
    return {"answers": answers, "calls": calls}


def signed(body: dict) -> tuple[bytes, str]:
    raw = json.dumps(body).encode()
    return raw, hmac.new(SECRET.encode(), raw, hashlib.sha512).hexdigest()


def pending(school, amount=5_000):
    pupil = make_student(school)
    return OnlinePayment.objects.create(
        school=school, reference="ADSTEST1", purpose="FEES", student=pupil, amount=amount
    )


def test_a_message_without_the_right_signature_is_refused(school, paystack):
    pending(school)
    raw, _ = signed({"event": "charge.success", "data": {"reference": "ADSTEST1"}})
    client = APIClient()
    answer = client.post(
        "/api/payments/paystack",
        raw,
        content_type="application/json",
        HTTP_X_PAYSTACK_SIGNATURE="bad",
    )
    assert answer.status_code == 401
    assert Payment.objects.count() == 0


def test_a_signed_message_is_checked_with_paystack_and_recorded_once(school, paystack):
    pending(school)
    raw, signature = signed({"event": "charge.success", "data": {"reference": "ADSTEST1"}})
    client = APIClient()
    for _ in range(2):
        answer = client.post(
            "/api/payments/paystack",
            raw,
            content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE=signature,
        )
        assert answer.status_code == 200
    assert Payment.objects.count() == 1
    assert Payment.objects.get().method == Payment.Method.PAYSTACK
    assert any(call.startswith("/transaction/verify/") for call in paystack["calls"])


def test_a_different_amount_is_not_recorded(school, paystack):
    paystack["answers"]["amount"] = 100
    pending(school)
    assert online.complete("ADSTEST1").status == OnlinePayment.Status.FAILED
    assert Payment.objects.count() == 0


def test_without_a_key_online_payment_is_switched_off(school, settings):
    settings.PAYSTACK_SECRET_KEY = ""
    with pytest.raises(Exception, match="isn't set up"):
        online.start_payment(
            purpose="FEES", amount=1_000, school=school, student=make_student(school)
        )


def test_a_payment_link_shows_only_the_first_name_and_amount(school, paystack):
    from datetime import timedelta

    from django.utils import timezone

    pupil = make_student(school, first_name="Ama", surname="Mensah")
    link = PaymentLink.objects.create(
        school=school,
        token="tok123",
        student=pupil,
        amount=2_000,
        expires_at=timezone.now() + timedelta(days=1),
    )
    answer = APIClient().get("/api/public/pay/tok123").json()
    assert answer == {"school": school.name, "pupil": "Ama", "amount": 2_000, "purpose": "FEES"}
    link.expires_at = timezone.now() - timedelta(minutes=1)
    link.save()
    assert APIClient().get("/api/public/pay/tok123").status_code == 404


def test_the_ussd_menu_finds_the_pupil_and_stops_after_three_wrong_ids(school):
    pupil = make_student(school)
    assert "school's code" in online.ussd_step("s1", "+233241234567", "")[0]
    assert "pupil's ID" in online.ussd_step("s1", "+233241234567", school.slug)[0]
    assert pupil.first_name in online.ussd_step("s1", "+233241234567", pupil.student_id)[0]

    online.ussd_step("s2", "+233241234567", "")
    online.ussd_step("s2", "+233241234567", school.slug)
    for _ in range(2):
        assert online.ussd_step("s2", "+233241234567", "WRONG")[1] is True
    message, more = online.ussd_step("s2", "+233241234567", "WRONG")
    assert more is False and "Too many" in message


def test_the_ussd_callback_needs_the_shared_secret(school, settings):
    settings.USSD_SECRET = "shh"
    body = {"sessionID": "x", "msisdn": "233241234567", "userData": ""}
    assert APIClient().post("/api/ussd", body, format="json").status_code == 401
    assert APIClient().post("/api/ussd?token=shh", body, format="json").status_code == 200
