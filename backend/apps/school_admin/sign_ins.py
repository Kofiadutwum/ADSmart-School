"""Sign-in lists the Administrator downloads at any time: Student IDs, parents' phones and staff
usernames, each with a fresh one-time password for anyone who hasn't signed in yet.

Passwords are stored scrambled and can't be read back, so a list makes new ones; the old unused
ones stop working. Nobody who has chosen their own password is touched, and demo records never
get one.
"""

from django.db import transaction
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework.response import Response

from apps.academics.models import SchoolClass
from apps.academics.structure import BANDS
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.phones import format_gh_local
from apps.people.models import Enrolment, Staff
from apps.people.services import give_student_login
from apps.platform_admin.services import issue_password, one_time_password
from apps.school_admin.dashboard import current_year
from apps.school_admin.views import SchoolView

REASON = "New sign-in list from the school's Administrator"


def signed_in(user) -> bool:
    return user.has_usable_password() and not user.must_change_password


def _renew(user, by) -> str:
    password = issue_password(user)
    record(AuditLog.Action.PASSWORD_RESET, actor=by, entity=user, reason=REASON)
    return password


def _enrolments(school, class_id):
    rows = Enrolment.objects.filter(
        end_date__isnull=True,
        school_class__academic_year=current_year(school),
        student__school=school,
    ).select_related("student__user", "school_class")
    if class_id:
        chosen = get_object_or_404(SchoolClass.objects.for_school(school), pk=class_id)
        rows = rows.filter(school_class=chosen)
    return rows.order_by("school_class__year_group", "school_class__stream", "student__first_name")


def pupils(school, class_id, by) -> list[dict]:
    rows = []
    for enrolment in _enrolments(school, class_id):
        student, school_class = enrolment.student, enrolment.school_class
        user, password = student.user, ""
        done = user is not None and signed_in(user)
        if BANDS[school_class.band].student_login and not student.is_demo and not done:
            if user is None:
                password = one_time_password()
                give_student_login(student, password, by=by, one_time=True)
            else:
                password = _renew(user, by)
        rows.append(
            {
                "name": student.full_name,
                "class": school_class.name,
                "student_id": student.student_id,
                "password": password,
                "signed_in": done,
            }
        )
    return rows


def parents(school, class_id, by) -> list[dict]:
    found = {}
    enrolments = _enrolments(school, class_id).prefetch_related(
        "student__guardianships__parent__user"
    )
    for enrolment in enrolments:
        child = f"{enrolment.student.first_name} ({enrolment.school_class.name})"
        for link in enrolment.student.guardianships.all():
            found.setdefault(link.parent.pk, (link.parent, []))[1].append(child)
    rows = []
    for parent, children in sorted(found.values(), key=lambda entry: str(entry[0])):
        done = signed_in(parent.user) or parent.user.activated_at is not None
        rows.append(
            {
                "name": f"{parent.first_name} {parent.surname}",
                "phone": format_gh_local(parent.phone),
                "children": children,
                "password": "" if done or parent.is_demo else _renew(parent.user, by),
                "signed_in": done,
            }
        )
    return rows


def staff(school, class_id, by) -> list[dict]:
    members = (
        Staff.objects.filter(school=school, user__is_active=True)
        .exclude(user=by)
        .select_related("user")
        .order_by("first_name", "surname")
    )
    rows = []
    for member in members:
        done = signed_in(member.user)
        rows.append(
            {
                "name": f"{member.first_name} {member.surname}",
                "username": member.user.login,
                "password": "" if done or member.is_demo else _renew(member.user, by),
                "signed_in": done,
            }
        )
    return rows


LISTS = {"pupils": pupils, "parents": parents, "staff": staff}


class SignInsView(SchoolView):
    """POST, not GET: making a list changes passwords, so only the Administrator may."""

    def post(self, request, kind):
        if kind not in LISTS:
            raise Http404
        with transaction.atomic():
            rows = LISTS[kind](self.school, request.data.get("class"), request.user)
        return Response({"rows": rows})
