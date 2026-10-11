"""What the platform team does to schools (amendment §5). Every change is audited."""

import secrets

from django.conf import settings
from django.contrib.auth.models import Group
from django.db import transaction

from apps.accounts import roles
from apps.accounts.models import User
from apps.accounts.sessions import end_other_sessions
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.notifications.sms import Purpose, send_sms
from apps.people.services import create_staff
from apps.school.models import School
from apps.website.provisioning import create_school

PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no 0/o or 1/i/l to misread


def one_time_password() -> str:
    """Handed over once by the platform team; it must be changed at the first sign-in."""
    raw = "".join(secrets.choice(PASSWORD_ALPHABET) for _ in range(12))
    return f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"


def _issue_password(user: User) -> str:
    password = one_time_password()
    user.set_password(password)
    user.must_change_password = True
    user.save(update_fields=["password", "must_change_password"])
    return password


@transaction.atomic
def add_administrator(
    school: School, *, first_name, surname, username, phone, by, email=""
) -> tuple[User, str]:
    staff = create_staff(
        school,
        username=username,
        first_name=first_name,
        surname=surname,
        roles_held=[roles.ADMINISTRATOR],
        phone=phone,
        email=email,
        by=by,
    )
    return staff.user, _issue_password(staff.user)


@transaction.atomic
def open_school(*, administrator: dict, by, request=None, **fields) -> tuple[School, User, str]:
    """A new school on trial, with its placeholder site and first Administrator (amendment §5)."""
    school = create_school(**fields)
    record(
        AuditLog.Action.CREATED,
        actor=by,
        entity=school,
        new={"slug": school.slug, "name": school.name},
        request=request,
    )
    user, password = add_administrator(school, **administrator, by=by)
    return school, user, password


def set_status(school: School, status: str, *, reason: str, by, request=None) -> School:
    """Suspending signs the school's users out at their next request and takes its website
    offline (amendment §2, §3.3)."""
    if not reason.strip():
        raise ValueError("Give a reason.")
    old = school.status
    school.status = status
    school.save(update_fields=["status"])
    record(
        AuditLog.Action.STATUS_CHANGED,
        actor=by,
        entity=school,
        old={"status": old},
        new={"status": status},
        reason=reason,
        request=request,
    )
    return school


def _tell(user: User, text: str) -> None:
    """Administrators hear about every reset platform support makes (amendment §4)."""
    if user.phone:
        send_sms(
            user.phone,
            f"{user.school.name}: {text}",
            purpose=Purpose.ACCOUNT_NOTICE,
            school=user.school,
        )


def reset_administrator_password(user: User, *, by, request=None) -> str:
    password = _issue_password(user)
    end_other_sessions(user, keep_key=None)
    record(
        AuditLog.Action.PASSWORD_RESET,
        actor=by,
        entity=user,
        reason="Reset by platform support",
        request=request,
    )
    _tell(
        user,
        f"{settings.PLATFORM_NAME} support has reset your sign-in password. "
        "If you did not ask for this, contact them at once.",
    )
    return password


class LastOwnerError(Exception):
    """The team must keep at least one active Owner (business tools spec §2)."""


def _set_team_roles(user: User, names) -> None:
    user.groups.remove(*Group.objects.filter(name__in=roles.PLATFORM_ROLES))
    user.groups.add(*Group.objects.filter(name__in=names))


@transaction.atomic
def add_team_member(
    *, first_name, surname, username, phone, email, roles_held, by, request=None
) -> tuple[User, str]:
    user = User.objects.create_user(
        username,
        kind=User.Kind.PLATFORM,
        display_name=f"{first_name} {surname}".strip(),
        phone=phone,
        email=email,
    )
    _set_team_roles(user, roles_held)
    record(
        AuditLog.Action.USER_CREATED,
        actor=by,
        entity=user,
        new={"roles": sorted(roles_held)},
        request=request,
    )
    return user, _issue_password(user)


@transaction.atomic
def update_team_member(user: User, *, roles_held=None, is_active=None, by, request=None) -> User:
    owners = set(
        User.objects.select_for_update(of=("self",))
        .filter(kind=User.Kind.PLATFORM, is_active=True, groups__name=roles.PLATFORM_OWNER)
        .values_list("pk", flat=True)
    )
    current = [name for name in roles.roles_of(user) if name in roles.PLATFORM_ROLES]
    new_roles = sorted(set(roles_held)) if roles_held is not None else current
    active = user.is_active if is_active is None else is_active
    stays_owner = active and roles.PLATFORM_OWNER in new_roles
    if user.pk in owners and not stays_owner and len(owners) == 1:
        raise LastOwnerError
    if new_roles != current:
        _set_team_roles(user, new_roles)
        record(
            AuditLog.Action.ROLES_CHANGED,
            actor=by,
            entity=user,
            old={"roles": current},
            new={"roles": new_roles},
            request=request,
        )
    if active != user.is_active:
        user.is_active = active
        user.save(update_fields=["is_active"])
        action = (
            AuditLog.Action.ACCOUNT_REACTIVATED if active else AuditLog.Action.ACCOUNT_DEACTIVATED
        )
        record(action, actor=by, entity=user, request=request)
        if not active:
            end_other_sessions(user, keep_key=None)
    return user


def reset_team_password(user: User, *, by, request=None) -> str:
    password = _issue_password(user)
    end_other_sessions(user, keep_key=None)
    record(
        AuditLog.Action.PASSWORD_RESET,
        actor=by,
        entity=user,
        reason="Reset by an Owner",
        request=request,
    )
    return password
