from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts import roles
from apps.accounts.models import UserSession
from apps.accounts.sessions import DAY, HOUR, MINUTE, describe_device, session_policy
from apps.audit.models import AuditLog
from apps.school.models import School
from tests.helpers import PASSWORD, sign_in

pytestmark = pytest.mark.django_db
NEW_PASSWORD = "a brand new passphrase"
ANDROID_CHROME = (
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36"
)


def change_password(api, current=PASSWORD, new=NEW_PASSWORD):
    return api.post(
        "/api/auth/password", {"current_password": current, "new_password": new}, format="json"
    )


@pytest.mark.parametrize(
    ("kind", "login", "role", "remember", "expected"),
    [
        ("staff", "k.mensah", roles.ADMINISTRATOR, False, (30 * MINUTE, 12 * HOUR)),
        ("staff", "k.mensah", roles.TEACHER, True, (2 * HOUR, 12 * HOUR)),
        ("student", "2601473", roles.STUDENT, True, (2 * HOUR, 12 * HOUR)),
        ("parent", "+233241234567", roles.PARENT, False, (2 * HOUR, 30 * DAY)),
        ("parent", "+233241234567", roles.PARENT, True, (30 * DAY, 30 * DAY)),
    ],
)
def test_session_policy(make_user, kind, login, role, remember, expected):
    assert session_policy(make_user(login, kind=kind, role=role), remember) == expected


def test_platform_staff_get_the_second_factor_timeouts(make_user):
    staff = make_user("ops", kind="platform", school=None)
    assert session_policy(staff, True) == (30 * MINUTE, 12 * HOUR)


def test_remembered_parents_stay_signed_in_for_thirty_days(api, make_user):
    make_user("+233241234567", kind="parent")
    response = sign_in(api, "0241234567", kind="parent", remember=True)
    assert response.cookies["sessionid"]["max-age"] == 30 * DAY
    assert UserSession.objects.get().idle_seconds == 30 * DAY


def test_idle_sessions_are_signed_out(api, make_user):
    make_user()
    sign_in(api, "k.mensah")
    UserSession.objects.update(last_seen=timezone.now() - timedelta(hours=2, seconds=1))
    assert api.get("/api/auth/me").json()["code"] == "not_authenticated"
    assert not UserSession.objects.exists()


def test_sessions_end_at_their_maximum_age(api, make_user):
    make_user()
    sign_in(api, "k.mensah")
    UserSession.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
    assert api.get("/api/auth/me").json()["code"] == "not_authenticated"


def test_activity_keeps_a_session_alive(api, make_user):
    make_user()
    sign_in(api, "k.mensah")
    earlier = timezone.now() - timedelta(minutes=5)
    UserSession.objects.update(last_seen=earlier)
    assert api.get("/api/auth/me").status_code == 200
    assert UserSession.objects.get().last_seen > earlier


def test_a_session_is_honoured_only_at_its_own_schools_address(api, make_user, other_school):
    make_user()
    sign_in(api, "k.mensah")
    assert api.get("/api/auth/me", HTTP_HOST="brightfuture.localhost").json()["code"] == (
        "not_authenticated"
    )
    assert api.get("/api/auth/me").json()["code"] == "not_authenticated"  # and it has ended


def test_suspending_a_school_signs_its_users_out(api, make_user, school):
    make_user()
    sign_in(api, "k.mensah")
    school.status = School.Status.SUSPENDED
    school.save()
    assert api.get("/api/auth/me").json()["code"] == "not_authenticated"


def test_platform_sessions_are_honoured_only_at_the_admin_address(make_user):
    staff = make_user("ops", kind="platform", school=None)
    client = APIClient(HTTP_HOST="admin.localhost")
    client.force_login(staff)
    assert client.get("/api/auth/me").json()["school"] is None
    assert client.get("/api/auth/me", HTTP_HOST="adsmart.localhost").json()["code"] == (
        "not_authenticated"
    )


def test_where_you_are_signed_in_and_signing_out_another_device(api, make_user):
    make_user()
    phone = APIClient(HTTP_HOST="adsmart.localhost", HTTP_USER_AGENT=ANDROID_CHROME)
    sign_in(phone, "k.mensah")
    sign_in(api, "k.mensah")
    listed = api.get("/api/auth/sessions").json()
    assert sorted(row["current"] for row in listed) == [False, True]
    other = next(row for row in listed if not row["current"])
    assert other["device"] == "Chrome on Android"

    assert api.delete(f"/api/auth/sessions/{other['id']}").status_code == 204
    assert phone.get("/api/auth/me").json()["code"] == "not_authenticated"
    assert api.get("/api/auth/me").status_code == 200
    assert AuditLog.objects.filter(action="SESSION_REVOKED").count() == 1


def test_the_current_session_ends_with_sign_out_not_revoke(api, make_user):
    make_user()
    sign_in(api, "k.mensah")
    current = api.get("/api/auth/sessions").json()[0]
    assert api.delete(f"/api/auth/sessions/{current['id']}").json()["code"] == "current_session"


def test_other_peoples_sessions_cannot_be_revoked(api, make_user):
    make_user()
    other_user = make_user("ama.boateng")
    sign_in(APIClient(HTTP_HOST="adsmart.localhost"), "ama.boateng")
    sign_in(api, "k.mensah")
    theirs = UserSession.objects.get(user=other_user)
    assert api.delete(f"/api/auth/sessions/{theirs.pk}").status_code == 404


def test_changing_the_password_signs_out_other_sessions(api, make_user):
    user = make_user()
    other = APIClient(HTTP_HOST="adsmart.localhost")
    sign_in(other, "k.mensah")
    sign_in(api, "k.mensah")
    assert change_password(api).status_code == 200
    assert api.get("/api/auth/me").status_code == 200
    assert other.get("/api/auth/me").json()["code"] == "not_authenticated"
    user.refresh_from_db()
    assert user.check_password(NEW_PASSWORD)
    assert UserSession.objects.count() == 1  # this one, still tracked under its new key
    assert AuditLog.objects.filter(action="PASSWORD_CHANGED").count() == 1


def test_password_change_errors_are_field_errors(api, make_user):
    make_user()
    sign_in(api, "k.mensah")
    wrong = change_password(api, current="not it at all")
    assert wrong.json()["fields"] == {"current_password": ["That isn't your current password."]}
    assert "new_password" in change_password(api, new="password").json()["fields"]


def test_students_must_change_their_first_password_before_anything_else(api, make_user):
    make_user("2601473", kind="student", role=roles.STUDENT, must_change_password=True)
    sign_in(api, "26-0147-3", kind="student")
    assert api.get("/api/auth/me").json()["must_change_password"] is True
    assert api.get("/api/anything-else").json()["code"] == "password_change_required"
    change_password(api)
    assert api.get("/api/anything-else").status_code == 404


@pytest.mark.parametrize(
    ("agent", "expected"),
    [
        (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari/604.1",
            "Safari on iPhone",
        ),
        (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36 Edg/130.0",
            "Edge on Windows",
        ),
        (
            "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
            "Firefox on Linux",
        ),
        (ANDROID_CHROME, "Chrome on Android"),
        ("", "Unknown browser on unknown device"),
    ],
)
def test_describe_device(agent, expected):
    assert describe_device(agent) == expected
