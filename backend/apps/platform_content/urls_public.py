from django.urls import path

from apps.platform_content import public_views as views

urlpatterns = [
    path("articles", views.ArticlesPublicView.as_view()),
    path("articles/<slug:slug>", views.ArticlePublicView.as_view()),
]
