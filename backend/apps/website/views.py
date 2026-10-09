from django.shortcuts import get_object_or_404
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.consent.models import PrivacyNotice
from apps.website.models import NewsPost
from apps.website.services import build_site_payload, news_summary

DEFAULT_NEWS_LIMIT = 20
MAX_NEWS_LIMIT = 50


class PublicView(APIView):
    """Anonymous endpoints for the public website."""

    authentication_classes = []
    permission_classes = [AllowAny]


class SiteView(PublicView):
    def get(self, request):
        return Response(build_site_payload())


class NewsListView(PublicView):
    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", DEFAULT_NEWS_LIMIT))
        except ValueError:
            limit = DEFAULT_NEWS_LIMIT
        limit = max(1, min(limit, MAX_NEWS_LIMIT))
        return Response([news_summary(post) for post in NewsPost.objects.published()[:limit]])


class NewsDetailView(PublicView):
    def get(self, request, slug):
        post = get_object_or_404(NewsPost.objects.published(), slug=slug)
        return Response({**news_summary(post), "body": post.body})


class PrivacyNoticeView(PublicView):
    def get(self, request):
        notice = PrivacyNotice.current()
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
