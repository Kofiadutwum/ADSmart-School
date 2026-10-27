"""Ends sessions that are idle, over age, at the wrong address or for a suspended school
(Phase 1 spec §5.6, amendment §3.3), and holds users who must change their password."""

from datetime import timedelta

from django.contrib.auth import logout
from django.http import JsonResponse
from django.utils import timezone

from apps.accounts.models import UserSession
from apps.accounts.sessions import belongs_here, is_expired

TOUCH_EVERY = timedelta(minutes=1)
OPEN_WHILE_PASSWORD_CHANGE = ("/api/auth/", "/api/public/", "/api/health")
PRIVACY_ACCEPTANCE_REQUIRED = {
    "code": "privacy_acceptance_required",
    "message": "Read and accept the privacy notice to continue.",
    "fields": {},
}
PASSWORD_CHANGE_REQUIRED = {
    "code": "password_change_required",
    "message": "Choose a new password to continue.",
    "fields": {},
}


class SessionActivityMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_authenticated:
            key = request.session.session_key
            session = UserSession.objects.filter(session_key=key, user=request.user).first()
            now = timezone.now()
            wrong_place = request.path.startswith("/api/") and not belongs_here(request)
            # Sessions started outside the API (Django admin in development) are not tracked.
            if wrong_place or (session is not None and is_expired(session, now)):
                if session is not None:
                    session.delete()
                logout(request)
            elif session is not None and now - session.last_seen >= TOUCH_EVERY:
                UserSession.objects.filter(pk=session.pk).update(last_seen=now)
                request.session.modified = True  # re-sends the cookie, extending its idle expiry
        if (
            request.user.is_authenticated
            and request.user.must_change_password
            and request.path.startswith("/api/")
            and not request.path.startswith(OPEN_WHILE_PASSWORD_CHANGE)
        ):
            return JsonResponse(PASSWORD_CHANGE_REQUIRED, status=403)
        if (
            request.user.is_authenticated
            and request.path.startswith("/api/")
            and not request.path.startswith(OPEN_WHILE_PASSWORD_CHANGE)
            and _notice_to_accept(request.user) is not None
        ):
            # Nobody uses the portal, so no information is taken, before the notice is accepted.
            return JsonResponse(PRIVACY_ACCEPTANCE_REQUIRED, status=403)
        return self.get_response(request)


def _notice_to_accept(user):
    from apps.consent.services import notice_to_accept  # consent depends on people → accounts

    return notice_to_accept(user)
