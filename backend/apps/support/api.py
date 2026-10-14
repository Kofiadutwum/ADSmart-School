"""Support between a school and the platform team (MS §4, business tools spec §6) and the data
protection records (SMS spec §30).

School side: support access for 24 or 72 hours, support conversations, data requests, breach
records and the retention rule. Platform side: read-only school records while access is granted
(every view logged), the domain list, SMS credits, announcements and conversation replies.
"""

import json
import urllib.parse
import urllib.request
from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response

from apps.accounts import roles
from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError
from apps.core.resources import Resource
from apps.notifications.models import SmsCreditEntry, SmsMessage
from apps.notifications.sms import credit_balance
from apps.people.models import Parent, Staff, Student
from apps.people.services import STAFF_ROLES
from apps.platform_admin.permissions import PlatformView
from apps.school.models import School, SchoolDomain
from apps.school_admin.views import SchoolView
from apps.support.models import (
    BreachRecord,
    DataRequest,
    PlatformAnnouncement,
    RetentionRule,
    SupportGrant,
    SupportMessage,
    SupportThread,
)

ADMIN = (roles.ADMINISTRATOR,)
LEADERS = (roles.ADMINISTRATOR, roles.HEAD_TEACHER)
SUPPORT = (roles.PLATFORM_SUPPORT,)


# ---- School side -------------------------------------------------------------------------


def grant_row(grant: SupportGrant | None) -> dict | None:
    if grant is None:
        return None
    return {
        "id": grant.pk,
        "hours": grant.hours,
        "starts_at": grant.starts_at,
        "ends_at": grant.ends_at,
        "ended_at": grant.ended_at,
        "active": grant.is_active(),
        "granted_by": str(grant.granted_by),
    }


class GrantSerializer(serializers.Serializer):
    hours = serializers.ChoiceField(choices=[24, 72])


class SupportAccessView(SchoolView):
    """The Administrator lets the platform team read the school's records for a while (MS §4)."""

    read_roles = write_roles = ADMIN

    def get(self, request):
        history = SupportGrant.objects.filter(school=self.school)[:20]
        return Response(
            {
                "current": grant_row(SupportGrant.active_for(self.school)),
                "history": [grant_row(row) for row in history],
            }
        )

    @transaction.atomic
    def post(self, request):
        hours = validated(GrantSerializer, request)["hours"]
        SupportGrant.objects.filter(school=self.school, ended_at__isnull=True).update(
            ended_at=timezone.now()
        )
        now = timezone.now()
        grant = SupportGrant.objects.create(
            school=self.school,
            granted_by=request.user,
            hours=hours,
            starts_at=now,
            ends_at=now + timedelta(hours=hours),
        )
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=grant,
            new={"hours": hours},
            request=request,
        )
        return Response(grant_row(grant), status=201)

    @transaction.atomic
    def delete(self, request):
        grant = SupportGrant.active_for(self.school)
        if grant is None:
            raise ApiError("no_access", "Support access isn't switched on.")
        grant.ended_at = timezone.now()
        grant.save(update_fields=["ended_at"])
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=grant,
            new={"ended": True},
            request=request,
        )
        return Response(grant_row(grant))


def thread_row(thread: SupportThread, messages: bool = False) -> dict:
    row = {
        "id": thread.pk,
        "school": thread.school.name,
        "subject": thread.subject,
        "status": thread.status,
        "created_by": str(thread.created_by),
        "created_at": thread.created_at,
        "updated_at": thread.updated_at,
    }
    if messages:
        row["messages"] = [
            {
                "id": message.pk,
                "author": str(message.author),
                "from_platform": message.from_platform,
                "body": message.body,
                "created_at": message.created_at,
            }
            for message in thread.messages.select_related("author")
        ]
    return row


class NewThreadSerializer(serializers.Serializer):
    subject = serializers.CharField(max_length=160)
    body = serializers.CharField(max_length=4000)


class MessageSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=4000)
    close = serializers.BooleanField(required=False, default=False)


def add_message(
    thread: SupportThread, user, body: str, from_platform: bool, close: bool = False
) -> None:
    SupportMessage.objects.create(
        thread=thread, author=user, from_platform=from_platform, body=body
    )
    thread.status = SupportThread.Status.CLOSED if close else SupportThread.Status.OPEN
    thread.save(update_fields=["status", "updated_at"])


class SchoolThreadsView(SchoolView):
    read_roles = write_roles = LEADERS

    def get(self, request):
        threads = SupportThread.objects.filter(school=self.school).select_related(
            "school", "created_by"
        )
        return Response([thread_row(row) for row in threads])

    @transaction.atomic
    def post(self, request):
        data = validated(NewThreadSerializer, request)
        thread = SupportThread.objects.create(
            school=self.school, subject=data["subject"], created_by=request.user
        )
        add_message(thread, request.user, data["body"], from_platform=False)
        return Response(thread_row(thread, messages=True), status=201)


class SchoolThreadView(SchoolView):
    read_roles = write_roles = LEADERS

    def thread(self, pk):
        return get_object_or_404(SupportThread.objects.filter(school=self.school), pk=pk)

    def get(self, request, pk):
        return Response(thread_row(self.thread(pk), messages=True))

    @transaction.atomic
    def post(self, request, pk):
        thread = self.thread(pk)
        data = validated(MessageSerializer, request)
        add_message(thread, request.user, data["body"], from_platform=False, close=data["close"])
        return Response(thread_row(thread, messages=True))


class SchoolAnnouncementsView(SchoolView):
    """The platform team's published notices, for every member of staff."""

    read_roles = tuple(STAFF_ROLES)

    def get(self, request):
        rows = PlatformAnnouncement.objects.filter(published=True)[:30]
        return Response(
            [
                {"id": r.pk, "title": r.title, "body": r.body, "published_at": r.published_at}
                for r in rows
            ]
        )


class DataRequestResource(Resource):
    """Requests under the Data Protection Act: answered, with a due date, by the Administrator."""

    model = DataRequest
    fields = ("parent", "kind", "details", "status", "response", "due_on")
    shown = ("created_at",)
    labels = ("parent",)
    read_roles = LEADERS
    write_roles = ADMIN
    filters = {"status": "status"}
    deletable = False

    @classmethod
    def validate(cls, view, data, instance=None):
        if "status" in data and data["status"] != DataRequest.Status.OPEN:
            data["handled_by"] = view.request.user
        return data


class BreachResource(Resource):
    model = BreachRecord
    fields = (
        "occurred_on",
        "discovered_on",
        "description",
        "data_affected",
        "people_affected",
        "actions_taken",
        "reported_to_regulator",
        "reported_on",
    )
    read_roles = write_roles = ADMIN
    stamp_user = "recorded_by"
    deletable = False
    restricted = True


class RetentionSerializer(serializers.Serializer):
    left_pupil_years = serializers.IntegerField(min_value=1, max_value=50, required=False)
    staff_years = serializers.IntegerField(min_value=1, max_value=50, required=False)


class RetentionView(SchoolView):
    read_roles = LEADERS
    write_roles = ADMIN

    def rule(self) -> RetentionRule:
        return RetentionRule.objects.get_or_create(school=self.school)[0]

    def get(self, request):
        rule = self.rule()
        return Response(
            {"left_pupil_years": rule.left_pupil_years, "staff_years": rule.staff_years}
        )

    @transaction.atomic
    def patch(self, request):
        rule = self.rule()
        data = validated(RetentionSerializer, request)
        for key, value in data.items():
            setattr(rule, key, value)
        rule.save()
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=rule,
            new=dict(data),
            request=request,
        )
        return self.get(request)


# ---- Platform side -----------------------------------------------------------------------


class PlatformSchoolView(PlatformView):
    read_roles = write_roles = SUPPORT

    def get_school(self, slug) -> School:
        return get_object_or_404(School, slug=slug)


RECORDS = {
    "pupils": (
        Student,
        lambda s: {
            "id": s.pk,
            "student_id": s.student_id,
            "name": f"{s.first_name} {s.surname}",
            "status": s.status,
        },
    ),
    "staff": (
        Staff,
        lambda s: {
            "id": s.pk,
            "name": f"{s.first_name} {s.surname}",
            "phone": s.phone,
            "status": s.employment_status,
        },
    ),
    "parents": (
        Parent,
        lambda p: {"id": p.pk, "name": f"{p.first_name} {p.surname}", "phone": p.phone},
    ),
}


def records_view(kind: str):
    model, row = RECORDS[kind]

    class RecordsView(PlatformSchoolView):
        """Read-only while the school's support access is on; every look is logged (MS §4)."""

        read_roles = write_roles = SUPPORT

        def get(self, request, slug):
            school = self.get_school(slug)
            grant = SupportGrant.active_for(school)
            if grant is None:
                raise ApiError(
                    "no_support_access", "The school hasn't switched on support access.", 409
                )
            record(
                AuditLog.Action.VIEWED_RESTRICTED,
                actor=request.user,
                entity_type=model._meta.label_lower,
                entity_id="list",
                request=request,
                school=school,
            )
            rows = model.objects.for_school(school).order_by("pk")[:500]
            return Response({"ends_at": grant.ends_at, "rows": [row(item) for item in rows]})

    return RecordsView


def domain_row(domain: SchoolDomain) -> dict:
    return {
        "id": domain.pk,
        "domain": domain.domain,
        "verified_at": domain.verified_at,
        "is_primary": domain.is_primary,
        "txt_name": f"_adsmartschool.{domain.domain}",
        "txt_value": domain.verification_token,
    }


class DomainSerializer(serializers.Serializer):
    domain = serializers.RegexField(r"^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$", max_length=253)

    def validate_domain(self, value):
        value = value.strip().lower().rstrip(".")
        if SchoolDomain.objects.filter(domain=value).exists():
            raise serializers.ValidationError("That address is already in use.")
        return value


def txt_records(name: str) -> list[str]:
    """DNS over HTTPS, so no resolver library is needed."""
    url = "https://cloudflare-dns.com/dns-query?" + urllib.parse.urlencode(
        {"name": name, "type": "TXT"}
    )
    request = urllib.request.Request(url, headers={"accept": "application/dns-json"})
    with urllib.request.urlopen(request, timeout=8) as response:  # noqa: S310 - fixed host
        answer = json.loads(response.read() or b"{}")
    return [item.get("data", "").strip('"') for item in answer.get("Answer", [])]


class DomainsView(PlatformSchoolView):
    def get(self, request, slug):
        school = self.get_school(slug)
        return Response([domain_row(d) for d in school.domains.order_by("domain")])

    @transaction.atomic
    def post(self, request, slug):
        school = self.get_school(slug)
        data = validated(DomainSerializer, request)
        domain = SchoolDomain.objects.create(school=school, domain=data["domain"])
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=domain,
            request=request,
            school=school,
        )
        return Response(domain_row(domain), status=201)


class DomainActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["check", "primary"])


class DomainDetailView(PlatformSchoolView):
    def domain(self, slug, pk) -> SchoolDomain:
        return get_object_or_404(SchoolDomain, school__slug=slug, pk=pk)

    @transaction.atomic
    def post(self, request, slug, pk):
        domain = self.domain(slug, pk)
        action = validated(DomainActionSerializer, request)["action"]
        if action == "check":
            try:
                values = txt_records(f"_adsmartschool.{domain.domain}")
            except OSError as exc:
                raise ApiError(
                    "dns_unavailable", "The address couldn't be checked just now; try again.", 503
                ) from exc
            if domain.verification_token not in values:
                raise ApiError(
                    "not_verified",
                    "The TXT record isn't there yet. DNS changes can take a few hours.",
                )
            domain.verified_at = timezone.now()
            domain.save(update_fields=["verified_at"])
        else:
            if not domain.verified_at:
                raise ApiError("not_verified", "Check the address before making it the main one.")
            SchoolDomain.objects.filter(school=domain.school, is_primary=True).update(
                is_primary=False
            )
            domain.is_primary = True
            domain.save(update_fields=["is_primary"])
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=domain,
            new={"action": action},
            request=request,
            school=domain.school,
        )
        return Response(domain_row(domain))

    @transaction.atomic
    def delete(self, request, slug, pk):
        domain = self.domain(slug, pk)
        record(
            AuditLog.Action.DELETED,
            actor=request.user,
            entity=domain,
            old={"domain": domain.domain},
            request=request,
            school=domain.school,
        )
        domain.delete()
        return Response(status=204)


class SmsCountsView(PlatformView):
    """Texts and credits per school; the platform pays the provider and resells credits."""

    read_roles = write_roles = SUPPORT

    def get(self, request):
        since = timezone.now() - timedelta(days=30)
        texts = {
            row["school"]: row
            for row in SmsMessage.objects.filter(school__isnull=False)
            .values("school")
            .annotate(
                total=Count("id"),
                month=Count("id", filter=Q(created_at__gte=since)),
                failed=Count("id", filter=Q(status=SmsMessage.Status.FAILED)),
            )
        }
        credits = dict(
            SmsCreditEntry.objects.values("school")
            .annotate(balance=Sum("change"))
            .values_list("school", "balance")
        )
        return Response(
            [
                {
                    "slug": school.slug,
                    "name": school.name,
                    "texts": texts.get(school.pk, {}).get("total", 0),
                    "texts_this_month": texts.get(school.pk, {}).get("month", 0),
                    "failed": texts.get(school.pk, {}).get("failed", 0),
                    "credits": credits.get(school.pk) or 0,
                }
                for school in School.objects.order_by("name")
            ]
        )


class TopUpSerializer(serializers.Serializer):
    credits = serializers.IntegerField(min_value=-100000, max_value=100000)
    reason = serializers.CharField(max_length=200)

    def validate_credits(self, value):
        if value == 0:
            raise serializers.ValidationError("Enter a number of credits.")
        return value


class SmsCreditsView(PlatformSchoolView):
    def get(self, request, slug):
        school = self.get_school(slug)
        entries = SmsCreditEntry.objects.filter(school=school)[:100]
        return Response(
            {
                "balance": credit_balance(school),
                "entries": [
                    {"change": e.change, "reason": e.reason, "created_at": e.created_at}
                    for e in entries
                ],
            }
        )

    @transaction.atomic
    def post(self, request, slug):
        school = self.get_school(slug)
        data = validated(TopUpSerializer, request)
        entry = SmsCreditEntry.objects.create(
            school=school, change=data["credits"], reason=data["reason"], created_by=request.user
        )
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=entry,
            new=dict(data),
            request=request,
            school=school,
        )
        return self.get(request, slug)


class AnnouncementResource(Resource):
    model = PlatformAnnouncement
    fields = ("title", "body")
    shown = ("published", "published_at", "created_at")
    school_scoped = False
    read_roles = write_roles = SUPPORT
    stamp_user = "created_by"


class AnnouncementPublishView(PlatformView):
    read_roles = write_roles = SUPPORT

    @transaction.atomic
    def post(self, request, pk):
        announcement = get_object_or_404(PlatformAnnouncement, pk=pk)
        announcement.published = not announcement.published
        announcement.published_at = timezone.now() if announcement.published else None
        announcement.save(update_fields=["published", "published_at"])
        action = (
            AuditLog.Action.PUBLISHED if announcement.published else AuditLog.Action.UNPUBLISHED
        )
        record(action, actor=request.user, entity=announcement, request=request)
        return Response(AnnouncementResource.row(self, announcement))


class PlatformThreadsView(PlatformView):
    read_roles = write_roles = SUPPORT

    def get(self, request):
        threads = SupportThread.objects.select_related("school", "created_by")
        status = request.query_params.get("status")
        if status in SupportThread.Status.values:
            threads = threads.filter(status=status)
        return Response([thread_row(row) for row in threads[:300]])


class PlatformThreadView(PlatformView):
    read_roles = write_roles = SUPPORT

    def get(self, request, pk):
        return Response(thread_row(get_object_or_404(SupportThread, pk=pk), messages=True))

    @transaction.atomic
    def post(self, request, pk):
        thread = get_object_or_404(SupportThread, pk=pk)
        data = validated(MessageSerializer, request)
        add_message(thread, request.user, data["body"], from_platform=True, close=data["close"])
        return Response(thread_row(thread, messages=True))
