from django.urls import path

from apps.platform_content import admin_views as views

urlpatterns = [
    path("gallery", views.GalleryView.as_view()),
    path("gallery/order", views.GalleryOrderView.as_view()),
    path("gallery/<int:pk>", views.GalleryPhotoView.as_view()),
]
