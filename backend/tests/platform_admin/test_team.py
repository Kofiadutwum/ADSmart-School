"""Business tools spec §2: the Owner's Team screen."""

import pytest

from apps.accounts import roles
from apps.accounts.models import User
from apps.audit.models import AuditLog
from tests.platform_admin.conftest import make_platform_member, signed_in
from tests.records import make_staff

pytestmark = pytest.mark.django_db
TEAM = "/api/platform/team"


def member(**overrides) -> dict:
    return {
        "first_name": "Ama",
        "surname": "Mensah",
        "username": "ama",
        "phone": "024 400 1111",
        "email": "",
        "roles": [roles.PLATFORM_CONTENT],
        **overrides,
    }


def audited(action: str, user: User) -> bool:
    return AuditLog.objects.filter(action=action, entity_id=str(user.pk)).exists()


def test_owner_lists_and_adds_a_member_with_a_one_time_password(console):
    response = console.post(TEAM, member(), format="json")

    assert response.status_code == 201
    body = response.json()
    assert body["member"]["username"] == "ama" and body["member"]["name"] == "Ama Mensah"
    assert body["member"]["roles"] == [roles.PLATFORM_CONTENT]
    user = User.objects.get(login="ama", kind=User.Kind.PLATFORM)
    assert user.phone == "+233244001111" and user.must_change_password
    assert user.check_password(body["one_time_password"])
    assert audited(AuditLog.Action.USER_CREATED, user)
    assert {row["username"] for row in console.get(TEAM).json()} == {"ops", "ama"}


def test_a_member_needs_a_mobile_or_email(console):
    response = console.post(TEAM, member(phone="", email=""), format="json")

    assert response.status_code == 400 and "phone" in response.json()["fields"]


@pytest.mark.parametrize("given", [[], [roles.ADMINISTRATOR], ["Nobody"]])
def test_roles_must_be_platform_roles(console, given):
    response = console.post(TEAM, member(roles=given), format="json")

    assert response.status_code == 400 and "roles" in response.json()["fields"]


def test_usernames_are_unique_in_the_team(console, ops):
    response = console.post(TEAM, member(username="OPS"), format="json")

    assert response.status_code == 400 and "username" in response.json()["fields"]


def test_owner_changes_roles_and_switches_off(console):
    user = make_platform_member("ama", roles.PLATFORM_CONTENT, phone="+233244001111")
    their_browser = signed_in(user)
    url = f"{TEAM}/{user.pk}"

    assert console.patch(url, {"roles": [roles.PLATFORM_SUPPORT]}, format="json").json()[
        "roles"
    ] == [roles.PLATFORM_SUPPORT]
    assert audited(AuditLog.Action.ROLES_CHANGED, user)
    assert their_browser.get("/api/platform/schools").status_code == 200

    assert console.patch(url, {"is_active": False}, format="json").json()["is_active"] is False
    assert audited(AuditLog.Action.ACCOUNT_DEACTIVATED, user)
    assert their_browser.get("/api/platform/schools").json()["code"] == "not_authenticated"


def test_the_last_owner_cannot_be_removed_or_switched_off(console, ops):
    url = f"{TEAM}/{ops.pk}"
    for change in ({"roles": [roles.PLATFORM_SUPPORT]}, {"is_active": False}):
        response = console.patch(url, change, format="json")
        assert response.status_code == 400 and response.json()["code"] == "last_owner"

    make_platform_member("boss", roles.PLATFORM_OWNER)
    assert console.patch(url, {"roles": [roles.PLATFORM_SUPPORT]}, format="json").status_code == 200


def test_school_accounts_are_not_team_members(console, school):
    teacher = make_staff(school, roles_held=[roles.TEACHER]).user

    response = console.patch(f"{TEAM}/{teacher.pk}", {"is_active": False}, format="json")
    assert response.status_code == 404


def test_reset_password_returns_a_one_time_password(console):
    user = make_platform_member("ama", roles.PLATFORM_CONTENT)

    body = console.post(f"{TEAM}/{user.pk}/reset-password").json()

    user.refresh_from_db()
    assert user.check_password(body["one_time_password"]) and user.must_change_password
    assert audited(AuditLog.Action.PASSWORD_RESET, user)
