from django.urls import path

from apps.pupil import portal, views

urlpatterns = [
    path("me", views.MeView.as_view()),
    path("photo", views.PhotoView.as_view()),
    path("terms", portal.TermsView.as_view()),
    path("report-card", portal.ReportCardView.as_view()),
    path("attendance", portal.AttendanceView.as_view()),
    path("timetable", portal.TimetableView.as_view()),
    path("resources", portal.ResourcesView.as_view()),
    path("resources/<int:pk>", portal.ResourceFileView.as_view()),
    path("quizzes", portal.QuizzesView.as_view()),
    path("quizzes/<int:pk>", portal.QuizView.as_view()),
]
