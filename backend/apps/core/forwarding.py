"""Next.js forwards the visitor's address and IP in headers signed with PROXY_SECRET (Plan 6A).
Vercel may replace the usual X-Forwarded-* headers between two projects, and the backend is
reachable on its own address too, so these headers count only with the right secret."""

from django.conf import settings
from django.utils.crypto import constant_time_compare

SIGNED = ("HTTP_X_PROXY_SECRET", "HTTP_X_SITE_HOST", "HTTP_X_SITE_CLIENT_IP")


class SignedForwardingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        given, site, client_ip = (request.META.pop(key, "") for key in SIGNED)
        secret = settings.PROXY_SECRET
        if secret and constant_time_compare(given, secret):
            if site:
                request.META["HTTP_X_FORWARDED_HOST"] = site
            if client_ip:
                request.META["HTTP_X_FORWARDED_FOR"] = client_ip
        return self.get_response(request)
