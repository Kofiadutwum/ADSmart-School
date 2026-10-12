from django.urls import path

from apps.school_admin import views

urlpatterns = [
    path("me", views.MeView.as_view()),
    path("dashboard", views.DashboardView.as_view()),
]
