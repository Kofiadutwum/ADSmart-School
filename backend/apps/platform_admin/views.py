"""The platform admin API (amendment §5): schools, their Administrators, leads and the audit
log. Platform staff see counts and setup details, never pupils', parents' or staff records."""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import roles
from apps.accounts.identifiers import normalise_identifier
from apps.accounts.models import User
from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.phones import normalise_gh_phone
from apps.people.models import Parent, Staff, Student
from apps.platform_admin import services
from apps.platform_admin.permissions import PlatformRole
from apps.school.models import LEVEL_CODES, School
from apps.website.models import Enquiry, Lead
from apps.website.services import publication_blockers


class SupportView(APIView):
    permission_classes = [PlatformRole(roles.PLATFORM_SUPPORT)]


class OwnerView(APIView):
    permission_classes = [PlatformRole()]


def school_row(school: School, blockers: list[str] | None = None) -> dict:
    blockers = publication_blockers(school) if blockers is None else blockers
    return {
        "slug": school.slug,
        "name": school.name,
        "town": school.town,
        "region": school.region,
        "status": school.status,
        "is_public": not blockers,
        "to_do": len(blockers),
        "created_at": school.created_at,
        "url": school.base_url(),
    }


def administrators(school: School) -> list[dict]:
    users = User.objects.filter(
        school=school, kind=User.Kind.STAFF, groups__name=roles.ADMINISTRATOR
    ).order_by("display_name", "login")
    return [
        {
            "id": user.pk,
            "name": str(user),
            "username": user.login,
            "phone": user.phone,
            "email": user.email,
            "must_change_password": user.must_change_password,
            "last_sign_in": user.last_login,
            "is_active": user.is_active,
        }
        for user in users
    ]


def school_detail(school: School) -> dict:
    blockers = publication_blockers(school)
    return {
        **school_row(school, blockers),
        "phone": school.phone,
        "email": school.email,
        "levels_offered": school.levels_offered,
        "blockers": blockers,
        "counts": {
            "pupils": Student.objects.for_school(school).count(),
            "staff": Staff.objects.for_school(school).count(),
            "parents": Parent.objects.for_school(school).count(),
            "enquiries": Enquiry.objects.for_school(school).count(),
        },
        "administrators": administrators(school),
    }


def _one_time(user: User, password: str) -> dict:
    return {"username": user.login, "one_time_password": password}


class AdministratorSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=60)
    surname = serializers.CharField(max_length=60)
    username = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=20)
    email = serializers.EmailField(required=False, allow_blank=True, default="")

    def validate_username(self, value):
        try:
            return normalise_identifier(User.Kind.STAFF, value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate_phone(self, value):
        try:
            return normalise_gh_phone(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc


class NewSchoolSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    slug = serializers.CharField(max_length=30)
    town = serializers.CharField(max_length=80)
    region = serializers.CharField(max_length=80)
    phone = serializers.CharField(max_length=20)
    email = serializers.EmailField()
    levels_offered = serializers.ListField(
        child=serializers.ChoiceField(choices=LEVEL_CODES), allow_empty=False
    )
    administrator = AdministratorSerializer()


class SchoolsView(SupportView):
    def get(self, request):
        schools = School.objects.all()
        query = request.query_params.get("q", "").strip()
        if query:
            schools = schools.filter(
                Q(name__icontains=query) | Q(slug__icontains=query) | Q(town__icontains=query)
            )
        status = request.query_params.get("status", "")
        if status:
            schools = schools.filter(status=status)
        return Response([school_row(school) for school in schools])

    def post(self, request):
        data = validated(NewSchoolSerializer, request)
        try:
            school, user, password = services.open_school(**data, by=request.user, request=request)
        except DjangoValidationError as exc:  # the School model's own checks (slug, phone, …)
            raise serializers.ValidationError(exc.message_dict) from exc
        body = {"school": school_detail(school), "administrator": _one_time(user, password)}
        return Response(body, status=201)


class SchoolDetailView(SupportView):
    def get(self, request, slug):
        return Response(school_detail(get_object_or_404(School, slug=slug)))


class AdministratorsView(SupportView):
    def post(self, request, slug):
        school = get_object_or_404(School, slug=slug)
        data = validated(AdministratorSerializer, request)
        if User.objects.filter(school=school, login=data["username"]).exists():
            raise serializers.ValidationError(
                {"username": ["That username is already used at this school."]}
            )
        user, password = services.add_administrator(school, **data, by=request.user)
        return Response(_one_time(user, password), status=201)


class StatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=School.Status.choices)
    reason = serializers.CharField(max_length=500)


class SchoolStatusView(SupportView):
    def post(self, request, slug):
        school = get_object_or_404(School, slug=slug)
        data = validated(StatusSerializer, request)
        services.set_status(
            school, data["status"], reason=data["reason"], by=request.user, request=request
        )
        return Response(school_detail(school))


def _administrator(slug: str, pk: int) -> User:
    """Only a school's own Administrators can be reset by the platform team (amendment §4)."""
    return get_object_or_404(
        User,
        pk=pk,
        school__slug=slug,
        kind=User.Kind.STAFF,
        groups__name=roles.ADMINISTRATOR,
    )


class ResetPasswordView(SupportView):
    def post(self, request, slug, pk):
        user = _administrator(slug, pk)
        password = services.reset_administrator_password(user, by=request.user, request=request)
        return Response(_one_time(user, password))


def lead_row(lead: Lead) -> dict:
    return {
        "id": lead.pk,
        "school_name": lead.school_name,
        "contact_name": lead.contact_name,
        "phone": lead.phone,
        "email": lead.email,
        "town": lead.town,
        "message": lead.message,
        "status": lead.status,
        "staff_notes": lead.staff_notes,
        "created_at": lead.created_at,
    }


class LeadUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Lead.Status.choices)
    staff_notes = serializers.CharField(max_length=2000, allow_blank=True, default="")


class LeadsView(SupportView):
    def get(self, request):
        leads = Lead.objects.order_by("-created_at", "-id")
        return Response([lead_row(lead) for lead in leads])


class LeadDetailView(SupportView):
    def patch(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        data = validated(LeadUpdateSerializer, request)
        old = {"status": lead.status}
        lead.status, lead.staff_notes = data["status"], data["staff_notes"]
        lead.save(update_fields=["status", "staff_notes"])
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=lead,
            old=old,
            new={"status": lead.status},
            request=request,
        )
        return Response(lead_row(lead))


AUDIT_LIMIT = 200  # shortcut: the latest entries only; add paging once the log grows


class AuditView(OwnerView):
    """Platform events, plus everything platform staff did in any school (amendment §4)."""

    def get(self, request):
        entries = AuditLog.objects.filter(
            Q(school__isnull=True) | Q(actor__kind=User.Kind.PLATFORM)
        ).select_related("school")[:AUDIT_LIMIT]
        return Response(
            [
                {
                    "id": entry.pk,
                    "created_at": entry.created_at,
                    "actor_name": entry.actor_name,
                    "action": entry.action,
                    "entity_type": entry.entity_type,
                    "entity_id": entry.entity_id,
                    "school": entry.school.name if entry.school_id else None,
                    "reason": entry.reason,
                }
                for entry in entries
            ]
        )


class AuditExportView(OwnerView):
    """The whole audit log as CSV for the Owner (SMS spec §38)."""

    def get(self, request):
        from apps.billing.api import csv_response
        from apps.school_admin.reports import AUDIT_HEADER, audit_rows

        logs = AuditLog.objects.select_related("actor", "school").order_by("-created_at")[:50000]
        rows = [
            [log.school.name if log.school_id else "", *row]
            for log, row in zip(logs, audit_rows(logs), strict=True)
        ]
        return csv_response("audit-log", ["School", *AUDIT_HEADER], rows)
