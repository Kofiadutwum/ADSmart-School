from django.urls import include, path

from apps.accounts import roles
from apps.platform_admin import team, views
from apps.platform_admin.permissions import PlatformView
from apps.school_admin.website_editor import notices_view
from apps.support import api as support

CONTENT = (roles.PLATFORM_CONTENT,)
PlatformNoticesView, PlatformNoticeDetailView = notices_view(lambda view: None, PlatformView, CONTENT, CONTENT)

urlpatterns = [
    path("schools", views.SchoolsView.as_view()),
    path("schools/<slug:slug>", views.SchoolDetailView.as_view()),
    path("schools/<slug:slug>/administrators", views.AdministratorsView.as_view()),
    path("schools/<slug:slug>/status", views.SchoolStatusView.as_view()),
    path(
        "schools/<slug:slug>/administrators/<int:pk>/reset-password",
        views.ResetPasswordView.as_view(),
    ),
    path("leads", views.LeadsView.as_view()),
    path("leads/<int:pk>", views.LeadDetailView.as_view()),
    path("audit", views.AuditView.as_view()),
    path("team", team.TeamView.as_view()),
    path("website/notices", PlatformNoticesView.as_view()),
    path("website/notices/<int:pk>", PlatformNoticeDetailView.as_view()),
    path("website/", include("apps.platform_content.urls_admin")),
    path("schools/<slug:slug>/records/pupils", support.records_view("pupils").as_view()),
    path("schools/<slug:slug>/records/staff", support.records_view("staff").as_view()),
    path("schools/<slug:slug>/records/parents", support.records_view("parents").as_view()),
    path("schools/<slug:slug>/domains", support.DomainsView.as_view()),
    path("schools/<slug:slug>/domains/<int:pk>", support.DomainDetailView.as_view()),
    path("schools/<slug:slug>/sms-credits", support.SmsCreditsView.as_view()),
    path("sms", support.SmsCountsView.as_view()),
    *support.AnnouncementResource.urls("announcements", PlatformView),
    path("announcements/<int:pk>/publish", support.AnnouncementPublishView.as_view()),
    path("support/threads", support.PlatformThreadsView.as_view()),
    path("support/threads/<int:pk>", support.PlatformThreadView.as_view()),
    path("team/<int:pk>", team.TeamMemberView.as_view()),
    path("team/<int:pk>/reset-password", team.TeamResetPasswordView.as_view()),
]
