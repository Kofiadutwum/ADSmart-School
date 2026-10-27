"""Password sign-in (Phase 1 spec §5.1, §5.5; amendment §3.3): one generic failure message,
temporary lockouts, and only the accounts that belong to the address used.

Lockout counters store their own deadline because DatabaseCache.incr() resets the expiry.
"""

import hashlib
import time

from django.contrib.auth import login
from django.core.cache import cache
from django.http import Http404

from apps.accounts import roles
from apps.accounts.identifiers import normalise_identifier
from apps.accounts.models import User, UserSession
from apps.accounts.sessions import start_session
from apps.audit.models import AuditLog
from apps.audit.services import client_ip, record
from apps.core.exceptions import ApiError
from apps.core.phones import format_gh_local
from apps.school.hosts import ADMIN, SCHOOL, UNAVAILABLE, Site, resolve_host

WINDOW_SECONDS = 15 * 60
MAX_FAILURES_PER_ACCOUNT = 5
MAX_FAILURES_PER_ADDRESS = 30
GENERIC_FAILURE = "Incorrect username or password."
LOCKED_MESSAGE = "Too many attempts. Please wait 15 minutes and try again."
ACCOUNT_UNAVAILABLE = "Account unavailable. Contact the school."
SCHOOL_KINDS = frozenset({User.Kind.STAFF, User.Kind.PARENT, User.Kind.STUDENT})

PENDING_KEY = "pending_second_factor"
PENDING_SECONDS = 10 * 60


def _now() -> float:
    return time.time()


def _failures(key: str) -> int:
    count, until = cache.get(key, (0, 0.0))
    return count if until > _now() else 0


def _add_failure(key: str) -> int:
    now = _now()
    count, until = cache.get(key, (0, 0.0))
    if until <= now:
        count, until = 0, now + WINDOW_SECONDS
    cache.set(key, (count + 1, until), timeout=int(until - now) + 1)
    return count + 1


def sign_in_site(request) -> Site:
    """Where a sign-in belongs: a school's address, or the admin area (amendment §2.1)."""
    site = resolve_host(request.get_host())
    if site is None or site.kind not in (SCHOOL, ADMIN):
        raise Http404("There is no sign-in at this address.")
    if site.school is not None and site.school.is_suspended:
        raise ApiError("suspended", UNAVAILABLE, 503)
    return site


def _account_key(school_id, kind: str, identifier: str) -> str:
    # Hashed: the identifier is raw user input, unsafe in a cache key.
    account = hashlib.sha256(f"{school_id or 'platform'}:{kind}:{identifier}".encode()).hexdigest()
    return f"signin:account:{account}"


def _count_failure(request, account_key: str, *, user, school, attempt: dict) -> None:
    """One more failure for the account and the address; the lockout is audited as it starts."""
    account_count = _add_failure(account_key)
    address_count = _add_failure(f"signin:address:{client_ip(request)}")
    if account_count == MAX_FAILURES_PER_ACCOUNT or address_count == MAX_FAILURES_PER_ADDRESS:
        record(AuditLog.Action.LOCKED_OUT, entity=user, new=attempt, request=request, school=school)


def count_wrong_code(request, user: User) -> None:
    """Wrong second-factor codes count towards the same lockouts as wrong passwords, so starting
    sign-in again cannot buy unlimited guesses (Phase 1 spec §5.5)."""
    key = _account_key(user.school_id, user.kind, user.login)
    attempt = {"kind": user.kind, "identifier": user.login}
    _count_failure(request, key, user=user, school=user.school, attempt=attempt)


def check_password_sign_in(request, kind: str, raw_identifier: str, password: str) -> User:
    """The user whose password matches, or ApiError. Callers decide what happens next."""
    site = sign_in_site(request)
    try:
        identifier = normalise_identifier(kind, raw_identifier)
    except ValueError:
        identifier = (raw_identifier or "").strip().lower()[:150]
    account_key = _account_key(site.school.pk if site.school else None, kind, identifier)
    address_key = f"signin:address:{client_ip(request)}"
    if (
        _failures(account_key) >= MAX_FAILURES_PER_ACCOUNT
        or _failures(address_key) >= MAX_FAILURES_PER_ADDRESS
    ):
        raise ApiError("locked_out", LOCKED_MESSAGE, 429)

    allowed = kind == User.Kind.PLATFORM if site.kind == ADMIN else kind in SCHOOL_KINDS
    user = (
        User.objects.filter(school=site.school, kind=kind, login=identifier).first()
        if allowed
        else None
    )
    if user is None or not user.has_usable_password():
        User().set_password(password)  # same hashing time as a real check: timing reveals nothing
        matched = False
    else:
        matched = user.check_password(password)

    if not matched:
        attempt = {"kind": kind, "identifier": identifier}
        record(
            AuditLog.Action.SIGN_IN_FAILED,
            entity=user,
            new=attempt,
            request=request,
            school=site.school,
        )
        _count_failure(request, account_key, user=user, school=site.school, attempt=attempt)
        raise ApiError("invalid_credentials", GENERIC_FAILURE, 400)
    if not user.is_active:
        record(
            AuditLog.Action.SIGN_IN_FAILED, entity=user, reason="Account inactive", request=request
        )
        raise ApiError("account_unavailable", ACCOUNT_UNAVAILABLE, 403)
    cache.delete(account_key)
    return user


def _masked_email(email: str) -> str | None:
    """k•••@gmail.com: enough to recognise, not enough to harvest."""
    if not email:
        return None
    name, _, domain = email.partition("@")
    return f"{name[:1]}•••@{domain}"


def _masked_phone(phone: str) -> str | None:
    """024 ••• 4567."""
    if not phone:
        return None
    first, *_, last = format_gh_local(phone).split()
    return f"{first} ••• {last}"


def start_second_factor(request, user: User, *, remember: bool) -> dict:
    """Password accepted: hold the user in the session until the second factor (§5.3)."""
    request.session.cycle_key()
    request.session[PENDING_KEY] = {
        "user_id": user.pk,
        "remember": remember,
        "started": _now(),
        "failures": 0,
    }
    return {
        "status": "second_factor",
        "email": _masked_email(user.email),
        "phone": _masked_phone(user.phone),
    }


def pending_user(request) -> User:
    """The user part-way through signing in here, or ApiError when it has expired."""
    site = sign_in_site(request)
    pending = request.session.get(PENDING_KEY)
    user = None
    if pending and _now() - pending["started"] <= PENDING_SECONDS:
        user = User.objects.filter(
            pk=pending["user_id"], is_active=True, school=site.school
        ).first()
    if user is None:
        raise ApiError(
            "second_factor_expired", "Your sign-in has expired. Please start again.", 400
        )
    return user


def complete_login(request, user: User, *, remember: bool) -> None:
    request.session.pop(PENDING_KEY, None)
    # Any earlier sign-in on this browser ends here; login() replaces its session.
    UserSession.objects.filter(session_key=request.session.session_key).delete()
    login(request, user)
    start_session(request, user, remember=remember)
    record(AuditLog.Action.SIGN_IN, actor=user, entity=user, request=request)


def notice_row(notice) -> dict | None:
    if notice is None:
        return None
    return {"id": notice.pk, "title": notice.title, "version": notice.version, "body": notice.body}


def me_payload(user: User) -> dict:
    # Imported here: consent depends on people, which depends on accounts.
    from apps.consent.services import notice_to_accept

    school = user.school
    return {
        "privacy_notice": notice_row(notice_to_accept(user)),
        "id": user.pk,
        "kind": user.kind,
        "username": user.login,
        "display_name": str(user),
        "roles": roles.roles_of(user),
        "must_change_password": user.must_change_password,
        "school": {"name": school.name, "slug": school.slug} if school else None,
    }
