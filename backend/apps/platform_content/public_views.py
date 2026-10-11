"""Public endpoints for the owner's website (business tools spec §5)."""

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils.crypto import constant_time_compare
from rest_framework import serializers
from rest_framework.exceptions import NotFound, ParseError
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from apps.core.exceptions import ApiError
from apps.platform_content import articles, tips, visits
from apps.platform_content.models import Article
from apps.school.hosts import PLATFORM, resolve_host
from apps.website.enquiries import check_form_token
from apps.website.views import PublicView

DEFAULT_LIMIT, MAX_LIMIT = 50, 100


class ArticlesPublicView(PublicView):
    def get(self, request):
        found = Article.objects.public()
        kind = request.query_params.get("kind", "")
        if kind in Article.Kind.values:
            found = found.filter(kind=kind)
        try:
            limit = int(request.query_params.get("limit", DEFAULT_LIMIT))
        except ValueError:
            limit = DEFAULT_LIMIT
        limit = max(1, min(limit, MAX_LIMIT))
        return Response([articles.summary(article) for article in found[:limit]])


class ArticlePublicView(PublicView):
    def get(self, request, slug):
        return Response(articles.detail(get_object_or_404(Article.objects.public(), slug=slug)))


# Tips by email (§5.6)

CHECK_EMAIL = {"status": "check_email"}


class TipsIpThrottle(AnonRateThrottle):
    scope = "tips_ip"


class TipSignUpSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    consent = serializers.BooleanField()

    def validate_email(self, value):
        return value.strip().lower()

    def validate_consent(self, value):
        if not value:
            raise serializers.ValidationError("Tick the box to agree to receive tips by email.")
        return value


class TokenSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=500)


class TipSignUpView(PublicView):
    throttle_classes = [TipsIpThrottle]

    def post(self, request):
        site = resolve_host(request.get_host())
        if site is None or site.kind != PLATFORM:
            raise NotFound("Sign up for tips on the platform's own website.")
        if request.data.get("website"):  # honeypot: pretend success, keep nothing
            return Response(CHECK_EMAIL, status=202)
        check_form_token(str(request.data.get("form_token", "")))
        serializer = TipSignUpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tips.sign_up(serializer.validated_data["email"])
        return Response(CHECK_EMAIL, status=202)


def _token(request) -> str:
    serializer = TokenSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data["token"]


class TipConfirmView(PublicView):
    throttle_classes = [TipsIpThrottle]

    def post(self, request):
        if not tips.confirm(_token(request)):
            raise ApiError(
                "invalid_link",
                "This link has expired or isn't valid. Please sign up again.",
                400,
            )
        return Response({"status": "confirmed"})


class TipUnsubscribeView(PublicView):
    throttle_classes = [TipsIpThrottle]

    def post(self, request):
        if not tips.unsubscribe(_token(request)):
            raise ApiError("invalid_link", "This link isn't valid.", 400)
        return Response({"status": "unsubscribed"})


# Visit counts (§4)


class VisitIpThrottle(AnonRateThrottle):
    scope = "visit_ip"


class VisitView(PublicView):
    """Always answers 204: a visit that isn't counted is not an error for the visitor."""

    throttle_classes = [VisitIpThrottle]

    def post(self, request):
        try:
            data = request.data
        except ParseError:
            data = None
        site = resolve_host(request.get_host())
        path = visits.page_of(data.get("path")) if isinstance(data, dict) else None
        robot = visits.is_robot(request.META.get("HTTP_USER_AGENT", ""))
        if site is not None and site.kind == PLATFORM and path and not robot:
            visits.count_visit(path)
        return Response(status=204)


# Scheduled article emails (Plan 6A): Vercel Cron calls this once a day.


class ArticleEmailsCronView(PublicView):
    def get(self, request):
        secret = settings.CRON_SECRET
        given = request.headers.get("Authorization", "")
        if not secret or not constant_time_compare(given, f"Bearer {secret}"):
            raise ApiError("not_allowed", "Only the scheduler may call this.", 401)
        return Response({"sent": articles.email_due_articles()})
