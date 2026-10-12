from django.urls import path

from apps.school_admin import calendar_views, profile, views

urlpatterns = [
    path("me", views.MeView.as_view()),
    path("dashboard", views.DashboardView.as_view()),
    path("profile", profile.ProfileView.as_view()),
    path("profile/logo", profile.LogoView.as_view()),
    path("years", calendar_views.YearsView.as_view()),
    path("years/<int:pk>", calendar_views.YearDetailView.as_view()),
    path("years/<int:pk>/terms", calendar_views.TermsView.as_view()),
    path("terms/<int:pk>", calendar_views.TermDetailView.as_view()),
    path("calendar", calendar_views.CalendarView.as_view()),
    path("calendar/<str:day>", calendar_views.CalendarDayView.as_view()),
]
