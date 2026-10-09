import re

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.core.phones import MOBILE_MESSAGE
from apps.notifications.backends import MemoryBackend
from tests.helpers import PASSWORD, sign_in

pytestmark = pytest.mark.django_db
PHONE = "+233241234567"
NEW = "our family passphrase"
OTHER = {"HTTP_HOST": "brightfuture.localhost"}
SENT = {"message": "If this number is registered, a code has been sent."}
BAD_CODE = {
    "code": "invalid_code",
    "message": "That code is wrong or has expired. Request a new code.",
    "fields": {},
}


@pytest.fixture
def parent(make_user):
    return make_user(PHONE, kind="parent", password=None, display_name="Ama Mensah", phone=PHONE)


def request_code(api, phone="024 123 4567", **headers):
    return api.post("/api/auth/parent/request-code", {"phone": phone}, format="json", **headers)


def set_password(api, code, password=NEW, phone="024 123 4567", **headers):
    payload = {"phone": phone, "code": code, "password": password}
    return api.post("/api/auth/parent/set-password", payload, format="json", **headers)


def texted_code():
    return re.search(r"\d{6}", MemoryBackend.outbox[-1]["body"]).group()


def test_registered_and_unknown_numbers_get_the_same_reply(api, parent):
    assert request_code(api).json() == request_code(api, "020 123 4567").json() == SENT
    assert [message["to"] for message in MemoryBackend.outbox] == [PHONE]
    assert MemoryBackend.outbox[0]["body"].startswith("AD Smart School: your code is ")


def test_codes_are_only_sent_for_the_school_at_the_address_used(api, parent, other_school):
    assert request_code(api, **OTHER).json() == SENT
    assert MemoryBackend.outbox == []


def test_a_code_from_one_school_does_not_work_at_another(api, parent, other_school, make_user):
    make_user(PHONE, kind="parent", password=None, school=other_school)
    request_code(api)
    assert set_password(api, texted_code(), **OTHER).json() == BAD_CODE


def test_an_invalid_number_is_a_field_error(api, school):
    assert request_code(api, "12345").json()["fields"] == {"phone": [MOBILE_MESSAGE]}


def test_there_is_no_activation_at_the_admin_address(api, parent):
    assert request_code(api, HTTP_HOST="admin.localhost").status_code == 404


def test_a_parent_activates_and_is_signed_in(api, parent):
    request_code(api)
    assert set_password(api, texted_code()).json()["status"] == "signed_in"
    assert api.get("/api/auth/me").json()["display_name"] == "Ama Mensah"
    parent.refresh_from_db()
    assert parent.activated_at is not None and parent.check_password(NEW)
    assert AuditLog.objects.filter(action="ACCOUNT_ACTIVATED").count() == 1
    fresh = APIClient(HTTP_HOST="adsmart.localhost")
    assert sign_in(fresh, "024 123 4567", NEW, kind="parent").json()["status"] == "signed_in"


def test_forgotten_passwords_are_reset_and_other_sessions_end(api, parent):
    parent.set_password(PASSWORD)
    parent.activated_at = timezone.now()
    parent.save()
    elsewhere = APIClient(HTTP_HOST="adsmart.localhost")
    sign_in(elsewhere, "024 123 4567", kind="parent")
    request_code(api)
    assert set_password(api, texted_code()).json()["status"] == "signed_in"
    assert elsewhere.get("/api/auth/me").json()["code"] == "not_authenticated"
    assert AuditLog.objects.filter(action="PASSWORD_RESET").count() == 1


def test_wrong_codes_and_unknown_numbers_get_the_same_answer(api, parent):
    request_code(api)
    wrong = "000000" if texted_code() != "000000" else "111111"
    assert set_password(api, wrong).json() == BAD_CODE
    assert set_password(api, "123456", phone="020 123 4567").json() == BAD_CODE


def test_weak_passwords_are_refused_the_same_way_for_any_number(api, parent):
    request_code(api)
    known = set_password(api, texted_code(), password="password")
    unknown = set_password(api, "123456", password="password", phone="020 123 4567")
    assert known.json() == unknown.json()
    assert "password" in known.json()["fields"]
    assert set_password(api, texted_code()).json()["status"] == "signed_in"  # code still valid


def test_deactivated_parents_get_no_code(api, make_user):
    make_user(PHONE, kind="parent", password=None, is_active=False)
    assert request_code(api).json() == SENT
    assert MemoryBackend.outbox == []


def test_three_codes_an_hour_per_number(api, parent):
    for _ in range(4):
        assert request_code(api).json() == SENT
    assert len(MemoryBackend.outbox) == 3


def test_ten_requests_an_hour_per_address(api, school):
    for _ in range(10):
        request_code(api, "020 123 4567")
    assert request_code(api, "020 123 4567").status_code == 429
