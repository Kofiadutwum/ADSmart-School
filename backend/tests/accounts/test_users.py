import pytest
from django.conf import settings
from django.contrib.auth.models import Group
from django.core.management import CommandError, call_command
from django.db import IntegrityError, transaction

from apps.accounts import roles
from apps.accounts.identifiers import normalise_identifier
from apps.accounts.models import User

pytestmark = pytest.mark.django_db
STRONG = "correct horse battery"


def test_every_role_exists_as_a_group():
    assert len(roles.ALL_ROLES) == 14 and roles.PLATFORM_ADMIN in roles.ALL_ROLES
    assert set(roles.ALL_ROLES) <= set(Group.objects.values_list("name", flat=True))


def test_who_needs_a_second_factor(make_user):
    assert roles.SECOND_FACTOR_ROLES == {
        "Administrator",
        "Head Teacher",
        "Accountant",
        "Proprietor",
    }
    teacher = make_user()
    assert not roles.needs_second_factor(teacher)
    teacher.groups.add(Group.objects.get(name=roles.HEAD_TEACHER))
    assert roles.needs_second_factor(teacher)
    assert roles.roles_of(teacher) == ["Head Teacher"]
    assert roles.needs_second_factor(make_user("ops", kind="platform", school=None))


def test_logins_are_unique_within_a_school_only(make_user, school, other_school):
    first = make_user("k.mensah")
    second = make_user("k.mensah", school=other_school)
    assert first.username == f"{school.pk}:k.mensah"
    assert second.username == f"{other_school.pk}:k.mensah"
    with pytest.raises(IntegrityError), transaction.atomic():
        make_user("k.mensah")


def test_platform_staff_have_no_school_and_school_users_need_one(make_user):
    assert make_user("ops", kind="platform", school=None).username == "platform:ops"
    with pytest.raises(IntegrityError), transaction.atomic():
        make_user("lost", school=None)


def test_production_hashes_passwords_with_argon2():
    import config.settings as base

    assert base.PASSWORD_HASHERS[0] == "django.contrib.auth.hashers.Argon2PasswordHasher"
    assert settings.AUTH_USER_MODEL == "accounts.User"


@pytest.mark.parametrize(
    ("kind", "raw", "expected"),
    [
        ("staff", "  K.Mensah ", "k.mensah"),
        ("platform", "Ops.Team", "ops.team"),
        ("parent", "024 123 4567", "+233241234567"),
        ("parent", "+233 24 123 4567", "+233241234567"),
        ("student", "26-0147-3", "2601473"),
        ("student", " 26 0147 3 ", "2601473"),
    ],
)
def test_normalise_identifier(kind, raw, expected):
    assert normalise_identifier(kind, raw) == expected


@pytest.mark.parametrize(
    ("kind", "raw"),
    [
        ("staff", "1234"),
        ("staff", "+233241234567"),
        ("staff", "ab"),
        ("platform", "9ops"),
        ("parent", "12345"),
        ("student", "26-0147"),
        ("student", "abc1234"),
        ("other", "someone"),
    ],
)
def test_normalise_identifier_rejects(kind, raw):
    with pytest.raises(ValueError):
        normalise_identifier(kind, raw)


def test_create_user_command_makes_a_school_administrator(school):
    call_command(
        "create_user",
        kind="staff",
        school="adsmart",
        username="Admin",
        name="School Admin",
        role=["Administrator"],
        password=STRONG,
    )
    user = User.objects.get(login="admin")
    assert user.school == school and user.kind == "staff" and user.display_name == "School Admin"
    assert user.check_password(STRONG)
    assert roles.roles_of(user) == ["Administrator"]


def test_create_user_command_makes_platform_staff(db):
    call_command("create_user", kind="platform", username="ops", password=STRONG)
    user = User.objects.get(username="platform:ops")
    assert user.school is None and roles.roles_of(user) == ["Platform Admin"]


def test_create_user_command_needs_a_known_school_for_school_users(school):
    with pytest.raises(CommandError, match="--school"):
        call_command("create_user", kind="staff", username="admin", password=STRONG)
    with pytest.raises(CommandError, match="No school"):
        call_command(
            "create_user", kind="staff", school="nowhere", username="admin", password=STRONG
        )
    with pytest.raises(CommandError, match="no school"):
        call_command(
            "create_user", kind="platform", school="adsmart", username="ops", password=STRONG
        )


def test_create_user_command_leaves_a_parent_awaiting_activation(school):
    call_command(
        "create_user", kind="parent", school="adsmart", username="024 123 4567", name="Ama Mensah"
    )
    user = User.objects.get(login="+233241234567")
    assert user.phone == "+233241234567" and roles.roles_of(user) == ["Parent"]
    assert user.is_active and user.activated_at is None and not user.has_usable_password()


def test_create_user_command_makes_students_change_their_first_password(school):
    call_command(
        "create_user",
        kind="student",
        school="adsmart",
        username="26-0147-3",
        password="first password 1",
    )
    user = User.objects.get(login="2601473")
    assert user.must_change_password and roles.roles_of(user) == ["Student"]


def test_create_user_command_refuses_duplicates_and_weak_passwords(school, other_school):
    call_command("create_user", kind="staff", school="adsmart", username="admin", password=STRONG)
    with pytest.raises(CommandError, match="already exists"):
        call_command(
            "create_user", kind="staff", school="adsmart", username="ADMIN", password=STRONG
        )
    call_command(
        "create_user", kind="staff", school="brightfuture", username="admin", password=STRONG
    )
    with pytest.raises(CommandError, match="too common"):
        call_command(
            "create_user", kind="staff", school="adsmart", username="teacher", password="password"
        )
