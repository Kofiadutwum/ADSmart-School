"""The rest of the parent portal (SMS spec §26): daily reports and notes, one-time pick-up
approvals, attendance, report cards, fees with Pay now, the wallet and receipts, bookshop and
uniform orders, announcements, learning resources, the bus, and data requests.

Every query starts from the parent's own wards, so another family's child is never reached."""

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response

from apps.academics.models import Term
from apps.accounts.views import validated
from apps.care.models import CareNote, DailyCare, OneTimeApproval
from apps.core.exceptions import ApiError
from apps.family.views import ParentView
from apps.finance import online, services
from apps.finance.models import Account, Invoice, OnlinePayment, Payment
from apps.learning.attendance import attendance_summary
from apps.learning.models import LearningResource
from apps.learning.results import class_results, report_card
from apps.learning.teaching import (
    resource_row,
    resources_for_class,
    serve_resource,
    timetable_for_class,
)
from apps.notifications.api import feed_row
from apps.notifications.models import Announcement
from apps.shop import api as shop
from apps.shop.models import Book, Order, RequiredBook, UniformItem, UniformSize
from apps.support.models import DataRequest
from apps.transport.api import answer_stop_change
from apps.transport.models import BusAssignment, StopChangeRequest


class WardView(ParentView):
    def ward(self, pk):
        return get_object_or_404(self.wards(), pk=pk)


def class_of(pupil):
    return services.current_class(pupil)


class DailyCareView(WardView):
    def get(self, request, pk):
        pupil = self.ward(pk)
        reports = DailyCare.objects.filter(student=pupil).order_by("-date")[:30]
        notes = CareNote.objects.filter(student=pupil).filter(
            Q(approved=True) | Q(author=request.user)
        )[:50]
        return Response(
            {
                "reports": [
                    {
                        "date": r.date,
                        "arrival": r.arrival,
                        "departure": r.departure,
                        "meals": r.meals,
                        "ate_well": r.ate_well,
                        "sleep": r.sleep,
                        "toilet": r.toilet,
                        "mood": r.mood,
                        "activities": r.activities,
                        "incident": r.incident,
                        "supplies_needed": r.supplies_needed,
                    }
                    for r in reports
                ],
                "notes": [
                    {
                        "id": n.pk,
                        "text": n.text,
                        "from_parent": n.from_parent,
                        "approved": n.approved,
                        "created_at": n.created_at,
                    }
                    for n in notes
                ],
            }
        )


class NoteSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=500)


class NoteView(WardView):
    """A parent's note waits for the class teacher before it appears for staff (SMS §11A)."""

    def post(self, request, pk):
        pupil = self.ward(pk)
        note = CareNote.objects.create(
            school=pupil.school,
            student=pupil,
            author=request.user,
            from_parent=True,
            text=validated(NoteSerializer, request)["text"],
        )
        return Response({"id": note.pk, "approved": note.approved}, status=201)


class ApprovalSerializer(serializers.Serializer):
    date = serializers.DateField()
    name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=16, required=False, default="", allow_blank=True)

    def validate_date(self, value):
        today = timezone.localdate()
        if not today <= value <= today + timedelta(days=14):
            raise serializers.ValidationError("Choose today or a day in the next two weeks.")
        return value


class ApprovalsView(WardView):
    """Let someone not on the list collect a child on one day."""

    def get(self, request, pk):
        pupil = self.ward(pk)
        rows = OneTimeApproval.objects.filter(
            student=pupil, date__gte=timezone.localdate()
        ).order_by("date")
        return Response(
            [{"id": a.pk, "date": a.date, "name": a.name, "phone": a.phone} for a in rows]
        )

    def post(self, request, pk):
        pupil = self.ward(pk)
        data = validated(ApprovalSerializer, request)
        approval = OneTimeApproval.objects.create(
            school=pupil.school, student=pupil, approved_by=request.user, **data
        )
        return Response(
            {"id": approval.pk, "date": approval.date, "name": approval.name}, status=201
        )


class AttendanceView(WardView):
    def get(self, request, pk):
        return Response(attendance_summary(self.ward(pk)))


class TermsView(WardView):
    def get(self, request, pk):
        pupil = self.ward(pk)
        terms = Term.objects.filter(
            school=pupil.school, start_date__lte=timezone.localdate()
        ).order_by("-start_date")
        return Response([{"id": t.pk, "name": str(t)} for t in terms[:12]])


class ReportCardView(WardView):
    def get(self, request, pk):
        pupil = self.ward(pk)
        term = get_object_or_404(
            Term.objects.filter(school=pupil.school), pk=request.query_params.get("term") or 0
        )
        return Response(report_card(pupil, term, for_family=True))


class PerformanceView(WardView):
    """How the child has done term by term: average and each subject's total (published only)."""

    def get(self, request, pk):
        pupil = self.ward(pk)
        rows = []
        for term in Term.objects.filter(
            school=pupil.school, start_date__lte=timezone.localdate()
        ).order_by("start_date"):
            enrolment = (
                pupil.enrolments.filter(school_class__academic_year=term.academic_year)
                .select_related("school_class")
                .first()
            )
            if not enrolment:
                continue
            results = class_results(enrolment.school_class, term, published_only=True)
            mine = next((r for r in results["pupils"] if r["student"] == pupil.pk), None)
            if mine and mine["subjects"]:
                rows.append(
                    {
                        "term": str(term),
                        "average": mine["average"],
                        "subjects": {
                            name: value["total"] for name, value in mine["subjects"].items()
                        },
                    }
                )
        return Response(rows)


def receipt_row(payment: Payment) -> dict:
    return {
        "id": payment.pk,
        "receipt_number": payment.receipt_number,
        "amount": payment.amount,
        "method": payment.get_method_display(),
        "purpose": payment.get_purpose_display(),
        "status": payment.status,
        "received_at": payment.received_at,
    }


class MoneyView(WardView):
    def get(self, request, pk):
        pupil = self.ward(pk)
        invoices = (
            Invoice.objects.filter(student=pupil)
            .exclude(status=Invoice.Status.CANCELLED)
            .select_related("term")
        )
        return Response(
            {
                "fees_owed": services.balance(pupil),
                "wallet": services.balance(pupil, Account.WALLET),
                "invoices": [
                    {
                        "id": i.pk,
                        "number": i.number,
                        "term": str(i.term),
                        "total": i.total,
                        "arrears": i.arrears,
                        "due_on": i.due_on,
                        "status": i.status,
                        "lines": [
                            {"description": line.description, "amount": line.amount}
                            for line in i.lines.all()
                        ],
                        "instalments": [
                            {
                                "due_on": item.due_on,
                                "amount": item.amount,
                                "outstanding": services.outstanding_on(item),
                            }
                            for item in i.instalments.all()
                        ],
                    }
                    for i in invoices
                ],
                "receipts": [receipt_row(p) for p in Payment.objects.filter(student=pupil)[:50]],
                "online_payment": bool(settings.PAYSTACK_SECRET_KEY),
            }
        )


class ReceiptView(ParentView):
    def get(self, request, pk):
        payment = get_object_or_404(
            Payment.objects.filter(student__in=self.wards()).select_related("student", "school"),
            pk=pk,
        )
        return Response(
            {
                **receipt_row(payment),
                "pupil": f"{payment.student.first_name} {payment.student.surname}",
                "student_id": payment.student.student_id,
                "reference": payment.reference,
                "school": {"name": payment.school.name, "phone": payment.school.phone},
            }
        )


class PayView(ParentView):
    def post(self, request):
        return Response(online.pay_for_ward(request, self.wards()))


class PaymentStatusView(ParentView):
    def get(self, request):
        reference = request.query_params.get("reference", "")[:40]
        found = OnlinePayment.objects.filter(reference=reference, student__in=self.wards()).first()
        if found is None:
            raise ApiError("unknown_reference", "That payment isn't known.", 404)
        return Response(online.online_row(online.complete(reference)))


class ShopView(WardView):
    def get(self, request, pk):
        pupil = self.ward(pk)
        school_class = class_of(pupil)
        required = (
            set(
                RequiredBook.objects.filter(school_class=school_class).values_list(
                    "book_id", flat=True
                )
            )
            if school_class
            else set()
        )
        sizes = {
            row.item_id: row.size
            for row in UniformSize.objects.filter(student=pupil).order_by("recorded_at")
        }
        return Response(
            {
                "books": [
                    {
                        "id": b.pk,
                        "title": b.title,
                        "price": b.price,
                        "required": b.pk in required,
                        "in_stock": b.stock > 0,
                    }
                    for b in Book.objects.filter(school=pupil.school, active=True)
                ],
                "uniforms": [
                    {
                        "id": u.pk,
                        "name": u.name,
                        "price": u.price,
                        "sizes": u.sizes,
                        "last_size": sizes.get(u.pk, ""),
                    }
                    for u in UniformItem.objects.filter(school=pupil.school, active=True)
                ],
                "orders": [shop.order_row(o) for o in Order.objects.filter(student=pupil)[:30]],
            }
        )


class OrderItemSerializer(serializers.Serializer):
    book = serializers.IntegerField(required=False)
    uniform = serializers.IntegerField(required=False)
    size = serializers.CharField(max_length=20, required=False, default="", allow_blank=True)
    quantity = serializers.IntegerField(min_value=1, max_value=10, default=1)


class OrderSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=Order.Kind.choices)
    items = OrderItemSerializer(many=True)


class OrdersView(WardView):
    def post(self, request, pk):
        pupil = self.ward(pk)
        data = validated(OrderSerializer, request)
        order = shop.create_order(pupil, data["kind"], data["items"], by=request.user)
        return Response(shop.order_row(order), status=201)


class OrderPaySerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=["WALLET", "ONLINE"])


class OrderPayView(ParentView):
    def post(self, request, pk):
        order = get_object_or_404(Order.objects.filter(student__in=self.wards()), pk=pk)
        method = validated(OrderPaySerializer, request)["method"]
        if order.status != Order.Status.AWAITING_PAYMENT:
            raise ApiError("paid", "This order is already paid.")
        if method == "WALLET":
            shop.pay_order(order, method=Payment.Method.WALLET, by=request.user)
            order.refresh_from_db()
            return Response(shop.order_row(order))
        return Response(
            online.start_payment(
                purpose=OnlinePayment.Purpose.ORDER,
                amount=order.total,
                school=order.school,
                student=order.student,
                order=order,
                email=request.user.email,
                phone=request.user.phone,
                callback=order.school.base_url() + "/payments/done",
            )
        )


class AnnouncementsView(ParentView):
    def get(self, request):
        parent = self.parent
        classes = [c for c in (class_of(p) for p in self.wards()) if c]
        sent = Announcement.objects.filter(
            school=parent.school,
            status=Announcement.Status.SENT,
            audience__in=[Announcement.Audience.PARENTS, Announcement.Audience.EVERYONE],
        ).filter(Q(school_class__isnull=True) | Q(school_class__in=classes))
        return Response([feed_row(row) for row in sent.order_by("-sent_at")[:50]])


class ResourcesView(WardView):
    def get(self, request, pk):
        school_class = class_of(self.ward(pk))
        if school_class is None:
            return Response([])
        return Response(
            [
                resource_row(item)
                for item in resources_for_class(school_class).order_by("-created_at")[:100]
            ]
        )


class ResourceFileView(ParentView):
    def get(self, request, pk):
        item = get_object_or_404(LearningResource, pk=pk)
        allowed = any(
            resources_for_class(c).filter(pk=item.pk).exists()
            for c in (class_of(p) for p in self.wards())
            if c
        )
        if not allowed:
            raise ApiError("not_found", "Not found.", 404)
        return serve_resource(item)


class TimetableView(WardView):
    def get(self, request, pk):
        pupil = self.ward(pk)
        school_class = class_of(pupil)
        today = timezone.localdate()
        term = Term.objects.filter(
            school=pupil.school, start_date__lte=today, end_date__gte=today
        ).first()
        return Response(timetable_for_class(school_class, term) if school_class and term else [])


class BusView(WardView):
    def get(self, request, pk):
        pupil = self.ward(pk)
        assignment = (
            BusAssignment.objects.filter(student=pupil, active=True)
            .select_related("route", "stop", "route__bus")
            .first()
        )
        changes = StopChangeRequest.objects.filter(
            student=pupil, status=StopChangeRequest.Status.WAITING
        ).select_related("new_stop")
        return Response(
            {
                "route": assignment.route.name if assignment else None,
                "stop": assignment.stop.name if assignment else None,
                "pickup_time": assignment.stop.pickup_time if assignment else None,
                "bus": assignment.route.bus.name
                if assignment and assignment.route.bus_id
                else None,
                "changes": [{"id": c.pk, "new_stop": c.new_stop.name} for c in changes],
            }
        )


class StopAnswerSerializer(serializers.Serializer):
    confirm = serializers.BooleanField()


class StopChangeView(ParentView):
    def post(self, request, pk):
        change = get_object_or_404(
            StopChangeRequest.objects.filter(student__in=self.wards()), pk=pk
        )
        change = answer_stop_change(change, validated(StopAnswerSerializer, request)["confirm"])
        return Response({"status": change.status})


class DataRequestSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=DataRequest.Kind.choices)
    details = serializers.CharField(max_length=2000, required=False, default="", allow_blank=True)


class DataRequestsView(ParentView):
    """A parent asks for a copy, a correction or deletion of their family's data (Act 843)."""

    def get(self, request):
        rows = DataRequest.objects.filter(parent=self.parent)
        return Response(
            [
                {
                    "id": r.pk,
                    "kind": r.kind,
                    "status": r.status,
                    "response": r.response,
                    "created_at": r.created_at,
                }
                for r in rows
            ]
        )

    @transaction.atomic
    def post(self, request):
        data = validated(DataRequestSerializer, request)
        parent = self.parent
        row = DataRequest.objects.create(
            school=parent.school,
            parent=parent,
            due_on=timezone.localdate() + timedelta(days=30),
            **data,
        )
        return Response({"id": row.pk, "status": row.status}, status=201)


class SummaryView(ParentView):
    """The home page: for each child, what needs attention today."""

    def get(self, request):
        rows = []
        for pupil in self.wards():
            today = pupil.attendance.filter(date=timezone.localdate()).first()
            rows.append(
                {
                    "id": pupil.pk,
                    "first_name": pupil.first_name,
                    "fees_owed": services.balance(pupil),
                    "wallet": services.balance(pupil, Account.WALLET),
                    "today": today.status if today else "",
                    "orders_ready": Order.objects.filter(
                        student=pupil, status=Order.Status.READY
                    ).count(),
                    "paid_this_term": Payment.objects.filter(
                        student=pupil,
                        status=Payment.Status.CONFIRMED,
                        received_at__gte=timezone.now() - timedelta(days=120),
                    ).aggregate(t=Sum("amount"))["t"]
                    or 0,
                }
            )
        return Response(rows)
