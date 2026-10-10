"""Signed-in sessions (Phase 1 spec §5.6, amendment §3.3): timeouts by role, binding to the
school's own address, and the "Where you're signed in" list."""

from datetime import timedelta
from importlib import import_module

from django.conf import settings
from django.utils import timezone

from apps.accounts import roles
from apps.accounts.models import User, UserSession
from apps.audit.services import client_ip
from apps.school.hosts import ADMIN, SCHOOL, resolve_host

MINUTE, HOUR, DAY = 60, 60 * 60, 24 * 60 * 60

BROWSERS = (
    ("Edg/", "Edge"),
    ("OPR/", "Opera"),
    ("SamsungBrowser/", "Samsung Internet"),
    ("Chrome/", "Chrome"),
    ("Firefox/", "Firefox"),
    ("Safari/", "Safari"),
)
SYSTEMS = (
    ("Android", "Android"),
    ("iPhone", "iPhone"),
    ("iPad", "iPad"),
    ("Windows", "Windows"),
    ("Mac OS X", "Mac"),
    ("CrOS", "Chromebook"),
    ("Linux", "Linux"),
)


def session_policy(user: User, remember: bool) -> tuple[int, int]:
    """(idle seconds, maximum seconds) for a new session."""
    if roles.needs_second_factor(user):
        return 30 * MINUTE, 12 * HOUR
    if user.kind == User.Kind.PARENT:
        return (30 * DAY if remember else 2 * HOUR), 30 * DAY
    return 2 * HOUR, 12 * HOUR


def start_session(request, user: User, *, remember: bool) -> UserSession:
    idle, maximum = session_policy(user, remember)
    request.session.set_expiry(idle)
    if request.session.session_key is None:
        request.session.save()  # login() flushed another user's session, leaving no key yet
    now = timezone.now()
    UserSession.objects.filter(user=user, expires_at__lte=now).delete()
    return UserSession.objects.create(
        user=user,
        session_key=request.session.session_key,
        user_agent=request.META.get("HTTP_USER_AGENT", "")[:300],
        ip_address=client_ip(request),
        last_seen=now,
        idle_seconds=idle,
        expires_at=now + timedelta(seconds=maximum),
    )


def is_expired(session: UserSession, now=None) -> bool:
    now = now or timezone.now()
    idle_for = now - session.last_seen
    return now >= session.expires_at or idle_for > timedelta(seconds=session.idle_seconds)


def end_session(session: UserSession) -> None:
    import_module(settings.SESSION_ENGINE).SessionStore(session_key=session.session_key).delete()
    session.delete()


def end_other_sessions(user: User, keep_key: str | None) -> int:
    others = list(UserSession.objects.filter(user=user).exclude(session_key=keep_key or ""))
    for session in others:
        end_session(session)
    return len(others)


def belongs_here(request) -> bool:
    """Is this request at the signed-in user's own address, with their school still active?"""
    site = resolve_host(request.get_host())
    school_id = request.user.school_id
    if site is None:
        return False
    if school_id is None:
        return site.kind == ADMIN
    return site.kind == SCHOOL and site.school.pk == school_id and not site.school.is_suspended


def describe_device(user_agent: str) -> str:
    browser = next((name for token, name in BROWSERS if token in user_agent), "Unknown browser")
    system = next((name for token, name in SYSTEMS if token in user_agent), "unknown device")
    return f"{browser} on {system}"
