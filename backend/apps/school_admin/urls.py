from django.urls import path

from apps.school_admin import profile, views

urlpatterns = [
    path("me", views.MeView.as_view()),
    path("dashboard", views.DashboardView.as_view()),
    path("profile", profile.ProfileView.as_view()),
    path("profile/logo", profile.LogoView.as_view()),
]
