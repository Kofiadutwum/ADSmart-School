from django.urls import path

from apps.school_admin import calendar_views, classes, profile, staff, views

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
    path("classes", classes.ClassesView.as_view()),
    path("classes/<int:pk>", classes.ClassDetailView.as_view()),
    path("classes/<int:pk>/class-teacher", classes.ClassTeacherView.as_view()),
    path("subjects", classes.SubjectsView.as_view()),
    path("subjects/<int:pk>", classes.SubjectDetailView.as_view()),
    path("teaching", classes.TeachingView.as_view()),
    path("teaching/<int:pk>", classes.TeachingDetailView.as_view()),
    path("staff", staff.StaffListView.as_view()),
    path("staff/<int:pk>", staff.StaffDetailView.as_view()),
    path("staff/<int:pk>/reset-password", staff.StaffResetPasswordView.as_view()),
    path("staff/<int:pk>/make-real", staff.StaffMakeRealView.as_view()),
]
