from django.urls import path

from apps.pupil import views

urlpatterns = [
    path("me", views.MeView.as_view()),
    path("photo", views.PhotoView.as_view()),
]
