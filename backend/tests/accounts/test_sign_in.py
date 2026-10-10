import pytest
from rest_framework.test import APIClient

from apps.accounts import roles, signin
from apps.audit.models import AuditLog
from apps.school.models import School
from tests.helpers import PASSWORD, sign_in

pytestmark = pytest.mark.django_db
GENERIC = {
    "code": "invalid_credentials",
    "message": "Incorrect username or password.",
    "fields": {},
}
OTHER = {"HTTP_HOST": "brightfuture.localhost"}
ADMIN = {"HTTP_HOST": "admin.localhost"}


def actions():
    return list(AuditLog.objects.order_by("id").values_list("action", flat=True))


def test_staff_sign_in_and_me(api, make_user, school):
    make_user(role=roles.TEACHER, display_name="Kofi Mensah")
    response = sign_in(api, "K.Mensah")
    assert response.status_code == 200 and response.json()["status"] == "signed_in"
    me = api.get("/api/auth/me").json()
    assert me["username"] == "k.mensah" and me["display_name"] == "Kofi Mensah"
    assert me["roles"] == ["Teacher"] and me["kind"] == "staff"
    assert me["must_change_password"] is False
    assert me["school"] == {"name": "AD Smart School", "slug": "adsmart"}
    assert actions() == ["SIGN_IN"]
    assert AuditLog.objects.get().school == school


def test_parents_sign_in_with_their_phone_number(api, make_user):
    make_user("+233241234567", kind="parent")
    assert sign_in(api, "024 123 4567", kind="parent").json()["status"] == "signed_in"


def test_the_same_login_at_another_school_is_another_account(api, make_user, other_school):
    make_user()
    make_user(school=other_school, password="another long passphrase")
    assert sign_in(api, "k.mensah", **OTHER).json() == GENERIC
    assert (
        sign_in(api, "k.mensah", "another long passphrase", **OTHER).json()["status"] == "signed_in"
    )


def test_platform_staff_sign_in_only_at_the_admin_address(api, make_user):
    make_user("ops", kind="platform", school=None)
    assert sign_in(api, "ops", kind="platform").json() == GENERIC
    assert sign_in(api, "ops", kind="platform", **ADMIN).json()["status"] == "second_factor"


def test_school_accounts_cannot_sign_in_at_the_admin_address(api, make_user):
    make_user()
    assert sign_in(api, "k.mensah", **ADMIN).json() == GENERIC


def test_there_is_no_sign_in_on_the_platform_site_or_unknown_addresses(api, make_user):
    make_user()
    assert sign_in(api, "k.mensah", HTTP_HOST="localhost").status_code == 404
    assert sign_in(api, "k.mensah", HTTP_HOST="nobody.localhost").status_code == 404


def test_a_suspended_school_refuses_sign_in(api, make_user, school):
    make_user()
    school.status = School.Status.SUSPENDED
    school.save()
    response = sign_in(api, "k.mensah")
    assert response.status_code == 503 and response.json()["code"] == "suspended"


def test_wrong_password_and_unknown_user_get_the_same_answer(api, make_user):
    make_user()
    wrong = sign_in(api, "k.mensah", "wrong password!")
    unknown = sign_in(api, "nobody.here")
    assert wrong.status_code == unknown.status_code == 400
    assert wrong.json() == unknown.json() == GENERIC
    assert actions() == ["SIGN_IN_FAILED", "SIGN_IN_FAILED"]


def test_malformed_identifiers_and_the_wrong_tab_get_the_generic_answer(api, make_user):
    make_user("+233241234567", kind="parent")
    assert sign_in(api, "024", kind="parent").json() == GENERIC
    assert sign_in(api, "024 123 4567", kind="staff").json() == GENERIC
    assert sign_in(api, "024 123 4567", kind="student").json() == GENERIC


def test_accounts_awaiting_activation_cannot_sign_in(api, make_user):
    make_user("+233241234567", kind="parent", password=None)
    assert sign_in(api, "024 123 4567", "anything at all", kind="parent").json() == GENERIC


def test_inactive_accounts_are_told_only_after_the_right_password(api, make_user):
    make_user(is_active=False)
    assert sign_in(api, "k.mensah", "wrong password!").json() == GENERIC
    response = sign_in(api, "k.mensah")
    assert response.status_code == 403
    assert response.json()["message"] == "Account unavailable. Contact the school."


def test_five_failures_lock_the_account_at_that_school_only(api, make_user, other_school):
    make_user()
    make_user(school=other_school)
    for _ in range(5):
        sign_in(api, "k.mensah", "wrong password!")
    locked = sign_in(api, "k.mensah")
    assert locked.status_code == 429 and locked.json()["code"] == "locked_out"
    assert actions().count("LOCKED_OUT") == 1
    assert sign_in(api, "k.mensah", **OTHER).json()["status"] == "signed_in"


def test_the_lockout_ends_after_fifteen_minutes(api, make_user, monkeypatch):
    make_user()
    start = signin._now()
    for _ in range(5):
        sign_in(api, "k.mensah", "wrong password!")
    monkeypatch.setattr(signin, "_now", lambda: start + 15 * 60 + 1)
    assert sign_in(api, "k.mensah").json()["status"] == "signed_in"


def test_a_success_clears_earlier_failures(api, make_user):
    make_user()
    for _ in range(4):
        sign_in(api, "k.mensah", "wrong password!")
    sign_in(api, "k.mensah")
    api.post("/api/auth/logout")
    for _ in range(4):
        sign_in(api, "k.mensah", "wrong password!")
    assert sign_in(api, "k.mensah").json()["status"] == "signed_in"


def test_thirty_failures_from_one_address_lock_that_address(api, make_user):
    make_user()
    for n in range(30):
        sign_in(api, f"user{n}", "wrong password!")
    assert sign_in(api, "k.mensah").json()["code"] == "locked_out"


def test_second_factor_roles_are_not_signed_in_by_password_alone(api, make_user):
    make_user(role=roles.ADMINISTRATOR, phone="+233241234567")
    response = sign_in(api, "k.mensah")
    assert response.json() == {"status": "second_factor", "email": None, "phone": "024 ••• 4567"}
    assert api.get("/api/auth/me").json()["code"] == "not_authenticated"


def test_sign_out(api, make_user):
    make_user()
    sign_in(api, "k.mensah")
    assert api.post("/api/auth/logout").status_code == 204
    assert api.get("/api/auth/me").json()["code"] == "not_authenticated"
    assert actions() == ["SIGN_IN", "SIGN_OUT"]


def test_sign_in_needs_a_csrf_token_and_the_sites_own_origin(make_user):
    make_user()
    browser = APIClient(enforce_csrf_checks=True, HTTP_HOST="adsmart.localhost")
    refused = sign_in(browser, "k.mensah")
    assert refused.status_code == 403 and refused.json()["code"] == "csrf_failed"

    browser.get("/api/auth/me")  # hands out the CSRF cookie even when signed out
    token = browser.cookies["csrftoken"].value
    payload = {"kind": "staff", "identifier": "k.mensah", "password": PASSWORD}
    for origin, outcome in [
        ("https://evil.example", "csrf_failed"),
        ("http://brightfuture.localhost", "csrf_failed"),
    ]:
        foreign = browser.post(
            "/api/auth/login", payload, format="json", HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN=origin
        )
        assert foreign.json()["code"] == outcome
    ok = browser.post(
        "/api/auth/login",
        payload,
        format="json",
        HTTP_X_CSRFTOKEN=token,
        HTTP_ORIGIN="http://adsmart.localhost",
    )
    assert ok.json()["status"] == "signed_in"
