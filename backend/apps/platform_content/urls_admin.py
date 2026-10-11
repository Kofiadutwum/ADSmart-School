from django.urls import path

from apps.platform_content import admin_views as views

urlpatterns = [
    path("gallery", views.GalleryView.as_view()),
    path("gallery/order", views.GalleryOrderView.as_view()),
    path("gallery/<int:pk>", views.GalleryPhotoView.as_view()),
    path("articles", views.ArticlesView.as_view()),
    path("articles/<int:pk>", views.ArticleView.as_view()),
    path("articles/<int:pk>/cover", views.ArticleCoverView.as_view()),
    path("articles/<int:pk>/publish", views.ArticlePublishView.as_view()),
    path("articles/<int:pk>/unpublish", views.ArticleUnpublishView.as_view()),
    path("article-images", views.ArticleImagesView.as_view()),
    path("testimonials", views.TestimonialsView.as_view()),
    path("testimonials/order", views.TestimonialOrderView.as_view()),
    path("testimonials/<int:pk>", views.TestimonialView.as_view()),
    path("testimonials/<int:pk>/photo", views.TestimonialPhotoView.as_view()),
    path("faqs", views.FaqsView.as_view()),
    path("faqs/order", views.FaqOrderView.as_view()),
    path("faqs/<int:pk>", views.FaqView.as_view()),
    path("settings", views.SettingsView.as_view()),
    path("subscribers", views.SubscribersView.as_view()),
    path("subscribers.csv", views.SubscribersCsvView.as_view()),
]
