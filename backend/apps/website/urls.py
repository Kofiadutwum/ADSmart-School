from django.urls import path

from apps.website import views

urlpatterns = [
    path("site", views.SiteView.as_view(), name="public-site"),
    path("news", views.NewsListView.as_view(), name="public-news"),
    path("news/<slug:slug>", views.NewsDetailView.as_view(), name="public-news-detail"),
    path("privacy-notice", views.PrivacyNoticeView.as_view(), name="public-privacy-notice"),
    path("enquiries/form-token", views.EnquiryFormTokenView.as_view(), name="enquiry-token"),
    path("enquiries", views.EnquiryCreateView.as_view(), name="enquiry-create"),
]
