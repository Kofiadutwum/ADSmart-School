"""Plan 6A Task 2: Next.js passes the visitor's address and IP in signed headers."""

from django.http import HttpResponse
from django.test import RequestFactory

from apps.core.forwarding import SignedForwardingMiddleware

SIGNED = {
    "HTTP_HOST": "adsmartschool-api.vercel.app",
    "HTTP_X_SITE_HOST": "sample.adsmartschool.com",
    "HTTP_X_SITE_CLIENT_IP": "41.66.1.2",
    "HTTP_X_FORWARDED_FOR": "76.76.21.21",
}


def seen_by_django(**meta):
    seen = {}

    def view(request):
        seen["request"] = request
        return HttpResponse()

    SignedForwardingMiddleware(view)(RequestFactory().get("/api/auth/me", **meta))
    return seen["request"]


def test_a_signed_address_and_ip_are_used(settings):
    settings.PROXY_SECRET = "s3cret"

    request = seen_by_django(HTTP_X_PROXY_SECRET="s3cret", **SIGNED)

    assert request.get_host() == "sample.adsmartschool.com"
    assert request.META["HTTP_X_FORWARDED_FOR"] == "41.66.1.2"
    assert "HTTP_X_PROXY_SECRET" not in request.META and "HTTP_X_SITE_HOST" not in request.META


def test_unsigned_or_wrongly_signed_headers_are_ignored(settings):
    settings.PROXY_SECRET = "s3cret"
    for given in ("", "guess"):
        request = seen_by_django(HTTP_X_PROXY_SECRET=given, **SIGNED)
        assert request.get_host() == "adsmartschool-api.vercel.app"
        assert request.META["HTTP_X_FORWARDED_FOR"] == "76.76.21.21"
        assert "HTTP_X_SITE_HOST" not in request.META


def test_nothing_is_trusted_without_a_secret_set(settings):
    settings.PROXY_SECRET = ""

    request = seen_by_django(HTTP_X_PROXY_SECRET="", **SIGNED)

    assert request.get_host() == "adsmartschool-api.vercel.app"
