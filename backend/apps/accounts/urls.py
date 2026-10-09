from django.urls import path

from apps.accounts import views

urlpatterns = [
    path("login", views.LoginView.as_view()),
    path("logout", views.LogoutView.as_view()),
    path("me", views.MeView.as_view()),
    path("sessions", views.SessionsView.as_view()),
    path("sessions/<int:pk>", views.SessionDetailView.as_view()),
    path("password", views.PasswordView.as_view()),
    path("second-factor/setup", views.SecondFactorSetupView.as_view()),
    path("second-factor/confirm", views.SecondFactorConfirmView.as_view()),
    path("second-factor/sms", views.SecondFactorSmsView.as_view()),
    path("second-factor/verify", views.SecondFactorVerifyView.as_view()),
]
