from django.urls import path

from apps.family import portal, views

urlpatterns = [
    path("wards", views.WardsView.as_view()),
    path("wards/<int:pk>/photo", views.WardPhotoView.as_view()),
    path("pickups/<int:pk>/photo", views.PickupPhotoView.as_view()),
    path("consents", views.ConsentsView.as_view()),
    path("summary", portal.SummaryView.as_view()),
    path("wards/<int:pk>/daily-care", portal.DailyCareView.as_view()),
    path("wards/<int:pk>/notes", portal.NoteView.as_view()),
    path("wards/<int:pk>/approvals", portal.ApprovalsView.as_view()),
    path("wards/<int:pk>/attendance", portal.AttendanceView.as_view()),
    path("wards/<int:pk>/terms", portal.TermsView.as_view()),
    path("wards/<int:pk>/report-card", portal.ReportCardView.as_view()),
    path("wards/<int:pk>/performance", portal.PerformanceView.as_view()),
    path("wards/<int:pk>/money", portal.MoneyView.as_view()),
    path("wards/<int:pk>/shop", portal.ShopView.as_view()),
    path("wards/<int:pk>/orders", portal.OrdersView.as_view()),
    path("wards/<int:pk>/resources", portal.ResourcesView.as_view()),
    path("wards/<int:pk>/timetable", portal.TimetableView.as_view()),
    path("wards/<int:pk>/bus", portal.BusView.as_view()),
    path("receipts/<int:pk>", portal.ReceiptView.as_view()),
    path("pay", portal.PayView.as_view()),
    path("pay/status", portal.PaymentStatusView.as_view()),
    path("orders/<int:pk>/pay", portal.OrderPayView.as_view()),
    path("stop-changes/<int:pk>", portal.StopChangeView.as_view()),
    path("announcements", portal.AnnouncementsView.as_view()),
    path("resources/<int:pk>", portal.ResourceFileView.as_view()),
    path("data-requests", portal.DataRequestsView.as_view()),
]
