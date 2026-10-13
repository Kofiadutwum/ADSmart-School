"""Messages in the school portal (SMS spec §24): automatic-message wording approved by the Head
Teacher, SMS credits, the school's SMS log, and announcements to parents and staff."""

from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.crypto import constant_time_compare
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import roles
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.consent.models import Consent
from apps.consent.services import has_consent
from apps.core.exceptions import ApiError
from apps.core.resources import Resource
from apps.notifications.models import Announcement, MessageTemplate, SmsCreditEntry, SmsMessage
from apps.notifications.sms import Purpose, credit_balance, send_sms
from apps.notifications.templates import DEFAULTS
from apps.people.models import Parent, Staff, Student
from apps.people.services import STAFF_ROLES
from apps.school_admin.views import SchoolView

LEADERS = (roles.ADMINISTRATOR, roles.HEAD_TEACHER)


class TemplateResource(Resource):
    model = MessageTemplate
    fields = ("key", "body")
    shown = ("approved", "approved_at")
    read_roles = write_roles = LEADERS

    @classmethod
    def validate(cls, view, data, instance=None):
        if "key" in data and data["key"] not in DEFAULTS:
            from rest_framework import serializers

            raise serializers.ValidationError({"key": ["Choose one of the message kinds."]})
        if instance is None or data.get("body", instance.body) != instance.body:
            data["approved"], data["approved_by"], data["approved_at"] = False, None, None
        return data


class TemplateDefaultsView(SchoolView):
    read_roles = LEADERS

    def get(self, request):
        return Response([{"key": key, "body": body} for key, body in DEFAULTS.items()])


class TemplateApproveView(SchoolView):
    """Only the Head Teacher approves wording (SMS spec §24)."""

    read_roles = write_roles = (roles.HEAD_TEACHER,)

    @transaction.atomic
    def post(self, request, pk):
        template = get_object_or_404(MessageTemplate.objects.for_school(self.school), pk=pk)
        template.approved, template.approved_by, template.approved_at = True, request.user, timezone.now()
        template.save()
        record(AuditLog.Action.UPDATED, actor=request.user, entity=template, new={"approved": True}, request=request)
        return Response(TemplateResource.row(self, template))


class CreditsView(SchoolView):
    read_roles = (*LEADERS, roles.ACCOUNTANT)

    def get(self, request):
        balance = credit_balance(self.school)
        entries = SmsCreditEntry.objects.filter(school=self.school)[:50]
        return Response(
            {
                "balance": balance,
                "low": balance < settings.SMS_LOW_CREDIT,
                "entries": [
                    {"change": entry.change, "reason": entry.reason, "created_at": entry.created_at}
                    for entry in entries
                ],
            }
        )


class SmsLogView(SchoolView):
    """The school's own texts and what became of them (MS §8)."""

    read_roles = LEADERS

    def get(self, request):
        messages = SmsMessage.objects.filter(school=self.school)
        status = request.query_params.get("status")
        if status in SmsMessage.Status.values:
            messages = messages.filter(status=status)
        return Response(
            [
                {
                    "id": message.pk,
                    "to": message.to,
                    "purpose": message.purpose,
                    "body": message.body,
                    "status": message.status,
                    "error": message.error,
                    "created_at": message.created_at,
                }
                for message in messages[:300]
            ]
        )


class AnnouncementResource(Resource):
    model = Announcement
    fields = ("title", "body", "audience", "school_class", "essential", "send_sms")
    shown = ("status", "sent_at", "texts_sent", "created_at")
    labels = ("school_class",)
    read_roles = write_roles = LEADERS
    stamp_user = "created_by"

    @classmethod
    def validate(cls, view, data, instance=None):
        if instance is not None and instance.status == Announcement.Status.SENT:
            raise ApiError("already_sent", "This announcement has been sent and can't be changed.")
        return data


def parents_for(announcement: Announcement):
    pupils = Student.objects.for_school(announcement.school).filter(status=Student.Status.ACTIVE)
    if announcement.school_class_id:
        pupils = pupils.filter(
            enrolments__school_class=announcement.school_class, enrolments__end_date__isnull=True
        )
    return Parent.objects.filter(guardianships__student__in=pupils).distinct()


def staff_for(announcement: Announcement):
    return Staff.objects.for_school(announcement.school).filter(user__is_active=True)


def send_announcement(announcement: Announcement, by) -> int:
    """In the portal at once; by text too when asked. Non-essential texts only go to parents
    who allow them (P1 §3.5)."""
    texts = 0
    if announcement.send_sms:
        text = f"{announcement.school.name}: {announcement.title}. {announcement.body}"[:480]
        audience = announcement.audience
        if audience in (Announcement.Audience.PARENTS, Announcement.Audience.EVERYONE):
            for parent in parents_for(announcement):
                if not announcement.essential and not has_consent(parent, Consent.Type.SMS_CONTACT):
                    continue
                sent = send_sms(parent.phone, text, purpose=Purpose.ANNOUNCEMENT, school=announcement.school)
                texts += sent.status == SmsMessage.Status.SENT
        if audience in (Announcement.Audience.STAFF, Announcement.Audience.EVERYONE):
            for staff in staff_for(announcement):
                if staff.phone:
                    sent = send_sms(staff.phone, text, purpose=Purpose.ANNOUNCEMENT, school=announcement.school)
                    texts += sent.status == SmsMessage.Status.SENT
    announcement.status = Announcement.Status.SENT
    announcement.sent_at = timezone.now()
    announcement.texts_sent = texts
    announcement.save(update_fields=["status", "sent_at", "texts_sent"])
    record(AuditLog.Action.PUBLISHED, actor=by, entity=announcement, new={"texts": texts})
    return texts


class AnnouncementSendView(SchoolView):
    read_roles = write_roles = LEADERS

    @transaction.atomic
    def post(self, request, pk):
        announcement = get_object_or_404(Announcement.objects.for_school(self.school), pk=pk)
        if announcement.status == Announcement.Status.SENT:
            raise ApiError("already_sent", "This announcement has already been sent.")
        send_announcement(announcement, request.user)
        return Response(AnnouncementResource.row(self, announcement))


def feed_row(announcement: Announcement) -> dict:
    return {
        "id": announcement.pk,
        "title": announcement.title,
        "body": announcement.body,
        "sent_at": announcement.sent_at,
    }


class StaffFeedView(SchoolView):
    """Announcements to staff, for every member of staff."""

    read_roles = tuple(STAFF_ROLES)

    def get(self, request):
        sent = Announcement.objects.for_school(self.school).filter(
            status=Announcement.Status.SENT,
            audience__in=[Announcement.Audience.STAFF, Announcement.Audience.EVERYONE],
        )
        return Response([feed_row(row) for row in sent[:50]])


class DeliveryReportView(APIView):
    """The provider reports what became of each text (SMS spec §24). Token-protected."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        token = settings.SMS_WEBHOOK_TOKEN
        if not token or not constant_time_compare(request.query_params.get("token", ""), token):
            raise ApiError("not_allowed", "Unknown sender.", 401)
        reference = str(request.data.get("id") or request.data.get("message_id") or "")
        status = str(request.data.get("status", "")).upper()
        updated = 0
        if reference:
            new = SmsMessage.Status.DELIVERED if status in ("DELIVERED", "DELIVRD") else None
            if status in ("FAILED", "UNDELIVERED", "REJECTED"):
                new = SmsMessage.Status.FAILED
            if new:
                updated = SmsMessage.objects.filter(provider_reference=reference).update(status=new)
        return Response({"updated": updated})
