from django.urls import path

from apps.family import views

urlpatterns = [
    path("wards", views.WardsView.as_view()),
    path("wards/<int:pk>/photo", views.WardPhotoView.as_view()),
    path("pickups/<int:pk>/photo", views.PickupPhotoView.as_view()),
    path("consents", views.ConsentsView.as_view()),
]
