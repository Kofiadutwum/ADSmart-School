"""Public endpoints for the owner's website (business tools spec §5)."""

from django.shortcuts import get_object_or_404
from rest_framework.response import Response

from apps.platform_content import articles
from apps.platform_content.models import Article
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
