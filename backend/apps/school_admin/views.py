"""The school portal API (Phase 1 spec §7.2–7.3). Every query starts from the signed-in user's
own school, so another school's records are never fetched."""

from datetime import date

from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import ClassTeacherAssignment, TeachingAssignment
from apps.accounts import roles
from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.core.exceptions import ApiError
from apps.people.models import Staff
from apps.people.services import STAFF_ROLES
from apps.school_admin import dashboard
from apps.school_admin.permissions import SchoolRolePermission


class SchoolView(APIView):
    """Administrators change things; the Head Teacher reads them (Phase 1 spec §4.3)."""

    permission_classes = [SchoolRolePermission]
    read_roles: tuple[str, ...] = (roles.ADMINISTRATOR, roles.HEAD_TEACHER)
    write_roles: tuple[str, ...] = (roles.ADMINISTRATOR,)

    @property
    def school(self):
        return self.request.user.school


def staff_profile(staff: Staff) -> dict:
    return {
        "id": staff.pk,
        "name": f"{staff.first_name} {staff.surname}",
        "first_name": staff.first_name,
        "surname": staff.surname,
        "staff_number": staff.staff_number,
        "phone": staff.phone,
        "email": staff.email,
        "qualifications": staff.qualifications,
        "licence_number": staff.licence_number,
        "emergency_contact": staff.emergency_contact,
        "employment_status": staff.employment_status,
        "is_demo": staff.is_demo,
    }


def assignments(staff: Staff, year) -> dict:
    teaching = TeachingAssignment.objects.filter(staff=staff, school_class__academic_year=year)
    classes = ClassTeacherAssignment.objects.filter(staff=staff, school_class__academic_year=year)
    return {
        "teaching": [
            {
                "id": row.pk,
                "class": row.school_class.name,
                "class_id": row.school_class_id,
                "subject": row.subject.name,
                "term": row.term.number,
                "term_id": row.term_id,
            }
            for row in teaching.select_related("school_class", "subject", "term").order_by(
                "term__number", "school_class__year_group", "school_class__stream", "subject__name"
            )
        ],
        "class_teacher_of": [
            {
                "id": row.pk,
                "class": row.school_class.name,
                "class_id": row.school_class_id,
                "term": row.term.number,
                "term_id": row.term_id,
            }
            for row in classes.select_related("school_class", "term").order_by(
                "term__number", "school_class__year_group", "school_class__stream"
            )
        ],
    }


class MeView(SchoolView):
    """Any member of staff: their own profile and this year's classes (Phase 1 spec §7.3)."""

    read_roles = tuple(STAFF_ROLES)

    def get(self, request):
        staff = Staff.objects.for_school(self.school).filter(user=request.user).first()
        year = dashboard.current_year(self.school)
        empty = {"teaching": [], "class_teacher_of": []}
        return Response(
            {
                "roles": roles.roles_of(request.user),
                "staff": staff_profile(staff) if staff else None,
                **(assignments(staff, year) if staff and year else empty),
            }
        )


class DashboardView(SchoolView):
    def get(self, request):
        return Response(dashboard.dashboard(self.school))


AUDIT_LIMIT = 200  # shortcut: the latest entries only; add paging once the log grows
ACTION_LABELS = dict(AuditLog.Action.choices)


def _date(value: str, name: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ApiError("bad_date", f"Choose a {name} date like 2026-10-12.") from exc


class AuditView(SchoolView):
    """The school's own trail (Phase 1 spec §7.2), filtered by person, record or date. Platform
    support appears by role, not by name (amendment §4)."""

    def get(self, request):
        log = AuditLog.objects.filter(school=self.school)
        entries = log.select_related("actor")
        params = request.query_params
        if params.get("actor"):
            if not params["actor"].isdigit():
                raise ApiError("bad_person", "Choose a person from the list.")
            entries = entries.filter(actor_id=params["actor"])
        if params.get("entity_type"):
            entries = entries.filter(entity_type=params["entity_type"])
        if params.get("entity_id"):
            entries = entries.filter(entity_id=params["entity_id"].strip())
        if params.get("date_from"):
            entries = entries.filter(created_at__date__gte=_date(params["date_from"], "from"))
        if params.get("date_to"):
            entries = entries.filter(created_at__date__lte=_date(params["date_to"], "to"))
        types = log.order_by("entity_type").values_list("entity_type", flat=True).distinct()
        return Response(
            {
                "entries": [audit_row(entry) for entry in entries[:AUDIT_LIMIT]],
                "record_types": [name for name in types if name],
                "people": _people(log),
            }
        )


def _people(log) -> list[dict]:
    """Everyone with an entry, for the person filter."""
    actors = User.objects.filter(pk__in=log.exclude(actor=None).values("actor_id"))
    rows = [
        {
            "id": user.pk,
            "name": "Platform support" if user.kind == User.Kind.PLATFORM else str(user),
        }
        for user in actors
    ]
    return sorted(rows, key=lambda row: row["name"])


def audit_row(entry: AuditLog) -> dict:
    platform = entry.actor is not None and entry.actor.kind == User.Kind.PLATFORM
    return {
        "id": entry.pk,
        "created_at": entry.created_at,
        "actor_id": entry.actor_id,
        "actor_name": "Platform support" if platform else entry.actor_name,
        "action": entry.action,
        "action_label": ACTION_LABELS.get(entry.action, entry.action),
        "entity_type": entry.entity_type,
        "entity_id": entry.entity_id,
        "reason": entry.reason,
    }
