"""What the platform team does to schools (amendment §5). Every change is audited."""

import secrets

from django.conf import settings
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
