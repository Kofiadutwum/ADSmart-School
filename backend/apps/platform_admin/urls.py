from django.urls import path

from apps.platform_admin import views

urlpatterns = [
    path("schools", views.SchoolsView.as_view()),
    path("schools/<slug:slug>", views.SchoolDetailView.as_view()),
    path("schools/<slug:slug>/administrators", views.AdministratorsView.as_view()),
    path("schools/<slug:slug>/status", views.SchoolStatusView.as_view()),
    path(
        "schools/<slug:slug>/administrators/<int:pk>/reset-password",
        views.ResetPasswordView.as_view(),
    ),
    path("leads", views.LeadsView.as_view()),
    path("leads/<int:pk>", views.LeadDetailView.as_view()),
    path("audit", views.AuditView.as_view()),
]
