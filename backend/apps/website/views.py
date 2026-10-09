from django.shortcuts import get_object_or_404
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.consent.models import PrivacyNotice
from apps.core.exceptions import ApiError
from apps.school.hosts import request_school, school_for_host
from apps.website.enquiries import (
    check_form_token,
    issue_form_token,
    notify_school,
    phone_limit_reached,
)
from apps.website.models import Enquiry, NewsPost
from apps.website.serializers import EnquirySerializer
from apps.website.services import build_site_payload, news_summary

DEFAULT_NEWS_LIMIT = 20
MAX_NEWS_LIMIT = 50


class PublicView(APIView):
    """Anonymous endpoints for the public websites."""

    authentication_classes = []
    permission_classes = [AllowAny]


class SiteView(PublicView):
    def get(self, request, host):
        return Response(build_site_payload(school_for_host(host)))


class NewsListView(PublicView):
    def get(self, request, host):
        school = school_for_host(host)
        try:
            limit = int(request.query_params.get("limit", DEFAULT_NEWS_LIMIT))
        except ValueError:
            limit = DEFAULT_NEWS_LIMIT
        limit = max(1, min(limit, MAX_NEWS_LIMIT))
        posts = NewsPost.objects.for_school(school).published()[:limit]
        return Response([news_summary(post) for post in posts])


class NewsDetailView(PublicView):
    def get(self, request, host, slug):
        posts = NewsPost.objects.for_school(school_for_host(host)).published()
        post = get_object_or_404(posts, slug=slug)
        return Response({**news_summary(post), "body": post.body})


class PrivacyNoticeView(PublicView):
    def get(self, request, host):
        notice = PrivacyNotice.current(school_for_host(host))
        if notice is None:
            raise NotFound("No privacy notice has been published yet.")
        return Response(
            {
                "version": notice.version,
                "title": notice.title,
                "body": notice.body,
                "effective_from": notice.effective_from.isoformat(),
                "is_draft": notice.is_draft,
            }
        )


class EnquiryIpThrottle(AnonRateThrottle):
    scope = "enquiry_ip"


class EnquiryTokenThrottle(AnonRateThrottle):
    scope = "enquiry_token"


class EnquiryFormTokenView(PublicView):
    throttle_classes = [EnquiryTokenThrottle]

    def get(self, request):
        return Response({"token": issue_form_token()})


class EnquiryCreateView(PublicView):
    throttle_classes = [EnquiryIpThrottle]

    def post(self, request):
        school = request_school(request)
        if request.data.get("website"):  # honeypot: pretend success, keep nothing
            return Response({"status": "received"}, status=201)
        check_form_token(str(request.data.get("form_token", "")))
        serializer = EnquirySerializer(data=request.data, context={"school": school})
        serializer.is_valid(raise_exception=True)
        if phone_limit_reached(school, serializer.validated_data["phone"]):
            raise ApiError(
                "too_many_enquiries",
                "We already have your recent enquiries and will call you soon.",
                429,
            )
        enquiry = Enquiry.objects.create(school=school, **serializer.validated_data)
        notify_school(enquiry)
        return Response({"status": "received"}, status=201)
