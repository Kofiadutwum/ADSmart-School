"""The platform admin API (amendment §5): schools, their Administrators, leads and the audit
log. Platform staff see counts and setup details, never pupils', parents' or staff records."""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import roles
from apps.accounts.models import User
from apps.accounts.signin import has_authenticator
from apps.people.models import Parent, Staff, Student
from apps.platform_admin.permissions import IsPlatformStaff
from apps.school.models import School
from apps.website.models import Enquiry
from apps.website.services import publication_blockers


class PlatformStaffView(APIView):
    permission_classes = [IsPlatformStaff]


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
            "has_authenticator": has_authenticator(user),
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


class SchoolsView(PlatformStaffView):
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


class SchoolDetailView(PlatformStaffView):
    def get(self, request, slug):
        return Response(school_detail(get_object_or_404(School, slug=slug)))
