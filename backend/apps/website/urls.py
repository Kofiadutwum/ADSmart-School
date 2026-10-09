from django.urls import path

from apps.website import views

urlpatterns = [
    path("sites/<str:host>/site", views.SiteView.as_view(), name="public-site"),
    path("sites/<str:host>/news", views.NewsListView.as_view(), name="public-news"),
    path(
        "sites/<str:host>/news/<slug:slug>",
        views.NewsDetailView.as_view(),
        name="public-news-detail",
    ),
    path(
        "sites/<str:host>/privacy-notice",
        views.PrivacyNoticeView.as_view(),
        name="public-privacy-notice",
    ),
    path("enquiries/form-token", views.EnquiryFormTokenView.as_view(), name="enquiry-token"),
    path("enquiries", views.EnquiryCreateView.as_view(), name="enquiry-create"),
]
