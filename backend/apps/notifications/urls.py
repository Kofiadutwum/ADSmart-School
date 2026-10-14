from django.urls import path

from apps.notifications import api
from apps.school_admin.views import SchoolView

urlpatterns = [
    *api.TemplateResource.urls("templates", SchoolView),
    path("templates/defaults", api.TemplateDefaultsView.as_view()),
    path("templates/<int:pk>/approve", api.TemplateApproveView.as_view()),
    path("credits", api.CreditsView.as_view()),
    path("log", api.SmsLogView.as_view()),
    *api.AnnouncementResource.urls("announcements", SchoolView),
    path("announcements/<int:pk>/send", api.AnnouncementSendView.as_view()),
    path("feed", api.StaffFeedView.as_view()),
]
