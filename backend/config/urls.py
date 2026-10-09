from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from apps.core.views import health

urlpatterns = [
    path("api/health", health, name="health"),
    path("api/public/", include("apps.website.urls")),
]

if settings.DEBUG:
    # Development only: Django admin and media files. Production edits content in the
    # portal (Plan 4) and serves media through Caddy (Plan 5).
    urlpatterns += [path("django-admin/", admin.site.urls)]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
