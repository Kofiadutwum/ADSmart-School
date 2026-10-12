"""The school portal API (Phase 1 spec §7.2–7.3). Every query starts from the signed-in user's
own school, so another school's records are never fetched."""

from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import ClassTeacherAssignment, TeachingAssignment
from apps.accounts import roles
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
