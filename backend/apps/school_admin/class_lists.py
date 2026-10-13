"""Teachers' class lists and pupil profiles (Phase 1 spec §4.2–4.3, §7.3), and pupil sign-ins
(§5.1). A teacher reaches only the classes they are assigned to, and the query is built from
those assignments; a class teacher also sees the class's parent and emergency contacts."""

from django.db import transaction
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework.response import Response

from apps.academics.models import ClassTeacherAssignment, SchoolClass, TeachingAssignment
from apps.accounts import roles
from apps.accounts.sessions import end_other_sessions
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError
from apps.people.models import Staff, Student
from apps.people.services import give_student_login
from apps.platform_admin.services import issue_password, one_time_password
from apps.school_admin.dashboard import current_year
from apps.school_admin.pupils import (
    pupil_detail,
    pupil_of,
    pupil_row,
    serve_pupil_photo,
    with_details,
)
from apps.school_admin.views import SchoolView

OVERSEERS = (roles.ADMINISTRATOR, roles.HEAD_TEACHER)
TEACHERS = (roles.TEACHER, roles.CAREGIVER)
TEACHER_FIELDS = (
    "id",
    "student_id",
    "name",
    "first_name",
    "surname",
    "gender",
    "date_of_birth",
    "class",
    "class_id",
    "status",
    "initials",
    "has_photo",
    "login",
    "can_have_login",
)


def class_access(request, school, pk) -> tuple[SchoolClass, bool, bool]:
    """The class, whether the user is its class teacher, and whether they see contacts.
    A class the user does not teach is not found (404), as if it did not exist."""
    school_class = get_object_or_404(SchoolClass.objects.for_school(school), pk=pk)
    staff = Staff.objects.for_school(school).filter(user=request.user).first()
    class_teacher = bool(staff) and (
        ClassTeacherAssignment.objects.filter(staff=staff, school_class=school_class).exists()
    )
    if roles.has_role(request.user, *OVERSEERS):
        return school_class, class_teacher, True
    teaches = class_teacher or (
        bool(staff)
        and TeachingAssignment.objects.filter(staff=staff, school_class=school_class).exists()
    )
    if not teaches:
        raise Http404
    return school_class, class_teacher, class_teacher


def pupils_in(school_class: SchoolClass):
    return Student.objects.filter(
        enrolments__school_class=school_class, enrolments__end_date__isnull=True
    ).distinct()


class ClassView(SchoolView):
    read_roles = (*OVERSEERS, *TEACHERS)


class ClassPupilsView(ClassView):
    def get(self, request, pk):
        school_class, class_teacher, _ = class_access(request, self.school, pk)
        pupils = with_details(pupils_in(school_class), school_class.academic_year)
        return Response(
            {
                "class": {
                    "id": school_class.pk,
                    "name": school_class.name,
                    "is_class_teacher": class_teacher,
                },
                "pupils": [pupil_row(pupil) for pupil in pupils],
            }
        )


def teacher_view(pupil: Student, *, sees_contacts: bool, can_issue_login: bool) -> dict:
    """Non-restricted fields only; contacts for the class teacher and school leaders."""
    detail = pupil_detail(pupil)
    shown = {key: detail[key] for key in TEACHER_FIELDS}
    shown["can_issue_login"] = can_issue_login and detail["can_have_login"]
    if sees_contacts:
        links = pupil.guardianships.select_related("parent").order_by("-is_primary_contact")
        shown["parents"] = [
            {
                "name": str(link.parent),
                "relationship": link.get_relationship_display(),
                "phone": link.parent.phone,
                "alt_phone": link.parent.alt_phone,
                "is_primary_contact": link.is_primary_contact,
            }
            for link in links
        ]
        shown["emergency_contacts"] = [
            {"name": contact.name, "phone": contact.phone, "relationship": contact.relationship}
            for contact in pupil.emergency_contacts.all()
        ]
    return shown


class ClassPupilView(ClassView):
    def get(self, request, pk, student):
        school_class, class_teacher, sees_contacts = class_access(request, self.school, pk)
        pupil = get_object_or_404(pupils_in(school_class), pk=student)
        admin = roles.has_role(request.user, roles.ADMINISTRATOR)
        return Response(
            teacher_view(pupil, sees_contacts=sees_contacts, can_issue_login=admin or class_teacher)
        )


class ClassPupilPhotoView(ClassView):
    def get(self, request, pk, student):
        school_class, _, _ = class_access(request, self.school, pk)
        return serve_pupil_photo(get_object_or_404(pupils_in(school_class), pk=student))


class PupilLoginView(SchoolView):
    """Pupils from Basic 4 sign in with their Student ID (P1 §5.1). The Administrator, or the
    class teacher of the pupil's class, issues the one-time password; issuing again resets it."""

    read_roles = write_roles = (roles.ADMINISTRATOR, roles.TEACHER)

    @transaction.atomic
    def post(self, request, pk):
        pupil = pupil_of(self.school, pk)
        if not roles.has_role(request.user, roles.ADMINISTRATOR):
            place = pupil.enrolments.filter(
                end_date__isnull=True, academic_year=current_year(self.school)
            ).first()
            looks_after = (
                place
                and ClassTeacherAssignment.objects.filter(
                    staff__user=request.user, school_class=place.school_class
                ).exists()
            )
            if not looks_after:
                raise Http404
        if pupil.user_id:
            password = issue_password(pupil.user)
            end_other_sessions(pupil.user, keep_key=None)
            record(
                AuditLog.Action.PASSWORD_RESET,
                actor=request.user,
                entity=pupil.user,
                reason="Pupil sign-in reset at school",
                request=request,
            )
            return Response({"username": pupil.user.login, "one_time_password": password})
        password = one_time_password()
        try:
            user = give_student_login(pupil, password, by=request.user)
        except ValueError as exc:
            raise ApiError("no_login", str(exc)) from exc
        return Response({"username": user.login, "one_time_password": password})
