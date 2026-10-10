import re
import time
from datetime import timedelta

import pyotp
import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts import roles, signin
from apps.accounts.models import BackupCode, SmsCode, TotpDevice
from apps.accounts.second_factor import issue_backup_codes, matching_step
from apps.accounts.sms_codes import check_code, consume, send_code
from apps.audit.models import AuditLog
from apps.notifications.backends import MemoryBackend
from apps.notifications.models import SmsMessage
from tests.helpers import sign_in

pytestmark = pytest.mark.django_db
PHONE = "+233241234567"
WRONG = "nope00"


@pytest.fixture
def admin(make_user):
    return make_user("admin", role=roles.ADMINISTRATOR, phone=PHONE)


def with_authenticator(user):
    secret = pyotp.random_base32()
    TotpDevice.objects.create(user=user, secret=secret, confirmed_at=timezone.now())
    return secret


def verify(api, method, code, **headers):
    payload = {"method": method, "code": code}
    return api.post("/api/auth/second-factor/verify", payload, format="json", **headers)


def texted_code():
    return re.search(r"\d{6}", MemoryBackend.outbox[-1]["body"]).group()


def test_first_sign_in_sets_up_an_authenticator_named_after_the_school(api, admin):
    sign_in(api, "admin")
    setup = api.post("/api/auth/second-factor/setup").json()
    assert setup["qr_image"].startswith("data:image/svg+xml;base64,")
    assert setup["otpauth_url"].startswith("otpauth://totp/")
    assert "issuer=AD%20Smart%20School" in setup["otpauth_url"]
    code = pyotp.TOTP(setup["secret"]).now()
    body = api.post("/api/auth/second-factor/confirm", {"code": code}, format="json").json()
    assert body["status"] == "signed_in" and len(body["backup_codes"]) == 10
    assert api.get("/api/auth/me").json()["has_authenticator"] is True
    assert AuditLog.objects.filter(action="SECOND_FACTOR_SET_UP").count() == 1


def test_platform_staff_set_up_an_authenticator_named_after_the_platform(make_user):
    make_user("ops", kind="platform", school=None)
    admin_api = APIClient(HTTP_HOST="admin.localhost")
    assert sign_in(admin_api, "ops", kind="platform").json()["status"] == "second_factor"
    setup = admin_api.post("/api/auth/second-factor/setup").json()
    assert "issuer=SchoolSite" in setup["otpauth_url"]
    code = pyotp.TOTP(setup["secret"]).now()
    assert (
        admin_api.post("/api/auth/second-factor/confirm", {"code": code}, format="json").json()[
            "status"
        ]
        == "signed_in"
    )


def test_a_pending_sign_in_cannot_be_finished_at_another_address(api, admin, other_school):
    secret = with_authenticator(admin)
    sign_in(api, "admin")
    response = verify(api, "totp", pyotp.TOTP(secret).now(), HTTP_HOST="brightfuture.localhost")
    assert response.json()["code"] == "second_factor_expired"


def test_setup_is_refused_once_an_authenticator_exists(api, admin):
    with_authenticator(admin)
    sign_in(api, "admin")
    assert api.post("/api/auth/second-factor/setup").json()["code"] == "already_set_up"


def test_returning_staff_sign_in_with_their_app(api, admin):
    secret = with_authenticator(admin)
    assert sign_in(api, "admin").json()["totp_ready"] is True
    assert verify(api, "totp", pyotp.TOTP(secret).now()).json()["status"] == "signed_in"
    assert api.get("/api/auth/me").status_code == 200


def test_an_authenticator_code_works_only_once(api, admin):
    secret = with_authenticator(admin)
    code = pyotp.TOTP(secret).now()
    sign_in(api, "admin")
    verify(api, "totp", code)
    api.post("/api/auth/logout")
    sign_in(api, "admin")
    assert verify(api, "totp", code).json()["code"] == "invalid_code"


def test_neighbouring_steps_are_accepted_for_clock_drift():
    secret = pyotp.random_base32()
    totp, now = pyotp.TOTP(secret), time.time()
    current = int(now // 30)
    assert matching_step(secret, totp.at(now - 30), now=now) == current - 1
    assert matching_step(secret, totp.at(now + 30), now=now) == current + 1
    assert matching_step(secret, "12345", now=now) is None
    assert matching_step(secret, "١٢٣٤٥٦", now=now) is None


def test_sms_fallback_names_the_school_and_logs_the_code_redacted(api, admin, school):
    with_authenticator(admin)
    sign_in(api, "admin")
    assert api.post("/api/auth/second-factor/sms").json() == {"sent": True}
    sent = MemoryBackend.outbox[-1]
    assert sent["to"] == PHONE and sent["body"].startswith("AD Smart School: your code is ")
    logged = SmsMessage.objects.get()
    assert "******" in logged.body and logged.school == school
    assert verify(api, "sms", texted_code()).json()["status"] == "signed_in"


def test_staff_without_a_phone_cannot_use_sms(api, make_user):
    make_user("head", role=roles.HEAD_TEACHER)
    assert sign_in(api, "head").json()["sms_available"] is False
    assert api.post("/api/auth/second-factor/sms").json()["code"] == "no_phone"


def test_a_failed_text_gives_the_schools_phone_number(api, admin, settings):
    settings.SMS_BACKEND = "tests.notifications.test_sms.BrokenBackend"
    sign_in(api, "admin")
    response = api.post("/api/auth/second-factor/sms")
    assert response.status_code == 503
    assert response.json()["message"] == (
        "We couldn't send the code. Try again, or call the school on 054 587 5881."
    )


def test_sms_codes_are_stored_hashed_and_expire_after_ten_minutes(admin):
    send_code(admin, SmsCode.Purpose.SIGN_IN, PHONE)
    code = texted_code()
    assert code not in SmsCode.objects.get().code_hash
    SmsCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
    assert check_code(admin, SmsCode.Purpose.SIGN_IN, code) is None


def test_sms_codes_allow_five_attempts(admin):
    send_code(admin, SmsCode.Purpose.SIGN_IN, PHONE)
    code = texted_code()
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert check_code(admin, SmsCode.Purpose.SIGN_IN, wrong) is None
    assert check_code(admin, SmsCode.Purpose.SIGN_IN, code) is None


def test_sms_codes_work_once_and_a_new_code_replaces_the_old(admin):
    send_code(admin, SmsCode.Purpose.SIGN_IN, PHONE)
    first = texted_code()
    send_code(admin, SmsCode.Purpose.SIGN_IN, PHONE)
    second = texted_code()
    if first != second:
        assert check_code(admin, SmsCode.Purpose.SIGN_IN, first) is None
    row = check_code(admin, SmsCode.Purpose.SIGN_IN, second)
    assert row is not None and consume(row)
    assert not consume(row)
    assert check_code(admin, SmsCode.Purpose.SIGN_IN, second) is None


def test_backup_codes_work_once(api, admin):
    with_authenticator(admin)
    codes = issue_backup_codes(admin)
    assert len(set(codes)) == 10
    assert not any(codes[1].replace("-", "") in row.code_hash for row in BackupCode.objects.all())
    sign_in(api, "admin")
    assert verify(api, "backup", codes[0].upper()).json()["status"] == "signed_in"
    api.post("/api/auth/logout")
    sign_in(api, "admin")
    assert verify(api, "backup", codes[0]).json()["code"] == "invalid_code"
    assert AuditLog.objects.filter(action="BACKUP_CODE_USED").count() == 1


def test_five_wrong_codes_end_the_attempt(api, admin):
    secret = with_authenticator(admin)
    sign_in(api, "admin")
    for _ in range(4):
        assert verify(api, "totp", WRONG).json()["code"] == "invalid_code"
    assert verify(api, "totp", WRONG).status_code == 429
    assert verify(api, "totp", pyotp.TOTP(secret).now()).json()["code"] == "second_factor_expired"


def test_second_factor_steps_need_a_recent_password(api, admin, monkeypatch):
    assert api.post("/api/auth/second-factor/setup").json()["code"] == "second_factor_expired"
    start = signin._now()
    sign_in(api, "admin")
    monkeypatch.setattr(signin, "_now", lambda: start + 10 * 60 + 1)
    assert api.post("/api/auth/second-factor/setup").json()["code"] == "second_factor_expired"


def test_reset_second_factor_command(api, admin):
    with_authenticator(admin)
    issue_backup_codes(admin)
    call_command("reset_second_factor", "Admin", school="adsmart")
    assert not TotpDevice.objects.filter(user=admin).exists()
    assert not BackupCode.objects.filter(user=admin).exists()
    assert AuditLog.objects.filter(action="SECOND_FACTOR_RESET").count() == 1
    assert sign_in(api, "admin").json()["totp_ready"] is False


def test_wrong_codes_count_towards_the_account_lockout(api, admin):
    with_authenticator(admin)
    sign_in(api, "admin")
    for _ in range(5):
        verify(api, "totp", WRONG)
    response = sign_in(api, "admin")
    assert response.status_code == 429 and response.json()["code"] == "locked_out"
    assert AuditLog.objects.filter(action="LOCKED_OUT").count() == 1
