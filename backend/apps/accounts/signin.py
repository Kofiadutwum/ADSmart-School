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
from apps.accounts.models import TotpDevice, User
from apps.audit.models import AuditLog
from apps.audit.services import client_ip, record
from apps.core.exceptions import ApiError
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


def check_password_sign_in(request, kind: str, raw_identifier: str, password: str) -> User:
    """The user whose password matches, or ApiError. Callers decide what happens next."""
    site = sign_in_site(request)
    try:
        identifier = normalise_identifier(kind, raw_identifier)
    except ValueError:
        identifier = (raw_identifier or "").strip().lower()[:150]
    scope = site.school.pk if site.school else "platform"
    # Hashed: the identifier is raw user input, unsafe in a cache key.
    account = hashlib.sha256(f"{scope}:{kind}:{identifier}".encode()).hexdigest()
    account_key = f"signin:account:{account}"
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
        account_count = _add_failure(account_key)
        address_count = _add_failure(address_key)
        if account_count == MAX_FAILURES_PER_ACCOUNT or address_count == MAX_FAILURES_PER_ADDRESS:
            record(
                AuditLog.Action.LOCKED_OUT,
                entity=user,
                new=attempt,
                request=request,
                school=site.school,
            )
        raise ApiError("invalid_credentials", GENERIC_FAILURE, 400)
    if not user.is_active:
        record(
            AuditLog.Action.SIGN_IN_FAILED, entity=user, reason="Account inactive", request=request
        )
        raise ApiError("account_unavailable", ACCOUNT_UNAVAILABLE, 403)
    cache.delete(account_key)
    return user


def has_authenticator(user: User) -> bool:
    return TotpDevice.objects.filter(user=user, confirmed_at__isnull=False).exists()


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
        "totp_ready": has_authenticator(user),
        "sms_available": bool(user.phone),
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
    login(request, user)
    record(AuditLog.Action.SIGN_IN, actor=user, entity=user, request=request)


def me_payload(user: User) -> dict:
    school = user.school
    return {
        "id": user.pk,
        "kind": user.kind,
        "username": user.login,
        "display_name": str(user),
        "roles": roles.roles_of(user),
        "must_change_password": user.must_change_password,
        "has_authenticator": has_authenticator(user),
        "school": {"name": school.name, "slug": school.slug} if school else None,
    }
