from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from apps.core.views import health
from apps.platform_content.public_views import ArticleEmailsCronView

urlpatterns = [
    path("api/health", health, name="health"),
    path("api/public/", include("apps.website.urls")),
    path("api/public/platform/", include("apps.platform_content.urls_public")),
    path("api/cron/article-emails", ArticleEmailsCronView.as_view()),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/platform/", include("apps.platform_admin.urls")),
]

if settings.DEBUG:
    # Development only: Django admin and media files. Production edits content in the
    # portal (Plan 4) and serves media through Caddy (Plan 5).
    urlpatterns += [path("django-admin/", admin.site.urls)]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
