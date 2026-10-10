from django.urls import path

from apps.platform_admin import views

urlpatterns = [
    path("schools", views.SchoolsView.as_view()),
    path("schools/<slug:slug>", views.SchoolDetailView.as_view()),
]
