import re
from datetime import timedelta

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts import roles, signin
from apps.accounts.models import SmsCode
from apps.accounts.sms_codes import check_code, consume, email_code, send_code
from apps.audit.models import AuditLog
from apps.notifications.backends import MemoryBackend
from apps.notifications.models import SmsMessage
from tests.helpers import sign_in

pytestmark = pytest.mark.django_db
PHONE = "+233241234567"
EMAIL = "kofi.admin@example.com"
WRONG = "nope00"


@pytest.fixture
def admin(make_user):
    return make_user("admin", role=roles.ADMINISTRATOR, phone=PHONE, email=EMAIL)


def verify(api, code, **headers):
    return api.post("/api/auth/second-factor/verify", {"code": code}, format="json", **headers)


def texted_code():
    return re.search(r"\d{6}", MemoryBackend.outbox[-1]["body"]).group()


def emailed_code():
    return re.search(r"\d{6}", mail.outbox[-1].body).group()


def test_the_password_step_offers_the_registered_email_and_phone_masked(api, admin):
    assert sign_in(api, "admin").json() == {
        "status": "second_factor",
        "email": "k•••@example.com",
        "phone": "024 ••• 4567",
    }
    assert api.get("/api/auth/me").json()["code"] == "not_authenticated"


def test_an_emailed_code_signs_in_and_names_the_school(api, admin):
    sign_in(api, "admin")
    assert api.post("/api/auth/second-factor/email").json() == {"sent": True}
    message = mail.outbox[-1]
    assert message.to == [EMAIL] and message.subject == "AD Smart School: your sign-in code"
    assert verify(api, emailed_code()).json()["status"] == "signed_in"
    assert api.get("/api/auth/me").status_code == 200


def test_a_texted_code_signs_in_and_is_logged_redacted(api, admin):
    sign_in(api, "admin")
    assert api.post("/api/auth/second-factor/sms").json() == {"sent": True}
    sent = MemoryBackend.outbox[-1]
    assert sent["to"] == PHONE and sent["body"].startswith("AD Smart School: your code is ")
    assert "******" in SmsMessage.objects.get().body
    assert verify(api, texted_code()).json()["status"] == "signed_in"


def test_platform_staff_get_codes_in_the_platforms_name(make_user):
    make_user("ops", kind="platform", school=None, email="ops@schoolsite.example")
    client = APIClient(HTTP_HOST="admin.localhost")
    assert sign_in(client, "ops", kind="platform").json()["phone"] is None
    client.post("/api/auth/second-factor/email")
    assert mail.outbox[-1].subject == "SchoolSite: your sign-in code"
    assert verify(client, emailed_code()).json()["status"] == "signed_in"


def test_someone_with_no_email_or_phone_cannot_be_sent_a_code(api, make_user):
    make_user("head", role=roles.HEAD_TEACHER)
    assert sign_in(api, "head").json() == {"status": "second_factor", "email": None, "phone": None}
    assert api.post("/api/auth/second-factor/email").json()["code"] == "no_email"
    assert api.post("/api/auth/second-factor/sms").json()["code"] == "no_phone"


def test_a_pending_sign_in_cannot_be_finished_at_another_address(api, admin, other_school):
    sign_in(api, "admin")
    api.post("/api/auth/second-factor/email")
    response = verify(api, emailed_code(), HTTP_HOST="brightfuture.localhost")
    assert response.json()["code"] == "second_factor_expired"


def test_a_failed_text_gives_the_schools_phone_number(api, admin, settings):
    settings.SMS_BACKEND = "tests.notifications.test_sms.BrokenBackend"
    sign_in(api, "admin")
    response = api.post("/api/auth/second-factor/sms")
    assert response.status_code == 503
    assert response.json()["message"] == (
        "We couldn't send the code. Try again, or call the school on 054 587 5881."
    )


def test_codes_are_limited_to_five_an_hour(api, admin):
    sign_in(api, "admin")
    for _ in range(5):
        assert api.post("/api/auth/second-factor/email").json() == {"sent": True}
    assert api.post("/api/auth/second-factor/email").status_code == 429
    assert len(mail.outbox) == 5


def test_codes_are_stored_hashed_and_expire_after_ten_minutes(admin):
    send_code(admin, SmsCode.Purpose.SIGN_IN, PHONE)
    code = texted_code()
    assert code not in SmsCode.objects.get().code_hash
    SmsCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
    assert check_code(admin, SmsCode.Purpose.SIGN_IN, code) is None


def test_codes_allow_five_attempts(admin):
    send_code(admin, SmsCode.Purpose.SIGN_IN, PHONE)
    code = texted_code()
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert check_code(admin, SmsCode.Purpose.SIGN_IN, wrong) is None
    assert check_code(admin, SmsCode.Purpose.SIGN_IN, code) is None


def test_codes_work_once_and_the_newest_wins_however_it_was_sent(admin):
    send_code(admin, SmsCode.Purpose.SIGN_IN, PHONE)
    texted = texted_code()
    assert email_code(admin, SmsCode.Purpose.SIGN_IN) == "sent"
    emailed = emailed_code()
    if texted != emailed:
        assert check_code(admin, SmsCode.Purpose.SIGN_IN, texted) is None
    row = check_code(admin, SmsCode.Purpose.SIGN_IN, emailed)
    assert row is not None and consume(row)
    assert not consume(row)
    assert check_code(admin, SmsCode.Purpose.SIGN_IN, emailed) is None


def test_five_wrong_codes_end_the_attempt(api, admin):
    sign_in(api, "admin")
    api.post("/api/auth/second-factor/email")
    for _ in range(4):
        assert verify(api, WRONG).json()["code"] == "invalid_code"
    assert verify(api, WRONG).status_code == 429
    assert verify(api, emailed_code()).json()["code"] == "second_factor_expired"


def test_wrong_codes_count_towards_the_account_lockout(api, admin):
    sign_in(api, "admin")
    for _ in range(5):
        verify(api, WRONG)
    response = sign_in(api, "admin")
    assert response.status_code == 429 and response.json()["code"] == "locked_out"
    assert AuditLog.objects.filter(action="LOCKED_OUT").count() == 1


def test_second_factor_steps_need_a_recent_password(api, admin, monkeypatch):
    assert api.post("/api/auth/second-factor/email").json()["code"] == "second_factor_expired"
    start = signin._now()
    sign_in(api, "admin")
    monkeypatch.setattr(signin, "_now", lambda: start + 10 * 60 + 1)
    assert api.post("/api/auth/second-factor/email").json()["code"] == "second_factor_expired"
