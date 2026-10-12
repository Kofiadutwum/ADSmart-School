"""A school's staff, managed by its Administrator (Phase 1 spec §7.2, §9; SMS spec §28): add with
a one-time password, edit, roles, switch sign-in off and on, reset the password, and turn a
demo record into a real one. The school always keeps one active Administrator."""

from django.contrib.auth.models import Group
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.response import Response

from apps.accounts import roles
from apps.accounts.identifiers import normalise_identifier
from apps.accounts.models import User
from apps.accounts.sessions import end_other_sessions
from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError
from apps.core.phones import normalise_gh_phone
from apps.people.demo import mark_real
from apps.people.models import Staff
from apps.people.services import STAFF_ROLES, create_staff
from apps.platform_admin.services import issue_password
from apps.school_admin.dashboard import current_year
from apps.school_admin.views import SchoolView, assignments, staff_profile


def staff_row(staff: Staff) -> dict:
    user = staff.user
    held = roles.roles_of(user)
    return {
        "id": staff.pk,
        "name": f"{staff.first_name} {staff.surname}",
        "username": user.login,
        "staff_number": staff.staff_number,
        "roles": held,
        "phone": staff.phone,
        "email": staff.email,
        "employment_status": staff.employment_status,
        "is_active": user.is_active,
        "is_demo": staff.is_demo,
        "needs_second_factor": bool(set(held) & roles.SECOND_FACTOR_ROLES),
        "second_factor_ready": bool(user.email or user.phone),
        "last_sign_in": user.last_login,
    }


def staff_detail(staff: Staff) -> dict:
    year = current_year(staff.school)
    empty = {"teaching": [], "class_teacher_of": []}
    return {
        **staff_profile(staff),
        **staff_row(staff),
        **(assignments(staff, year) if year else empty),
    }


class PhoneField(serializers.CharField):
    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        try:
            return normalise_gh_phone(value) if value else ""
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc


class StaffSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=60)
    surname = serializers.CharField(max_length=60)
    staff_number = serializers.CharField(max_length=20, allow_blank=True, default="")
    phone = PhoneField(max_length=20, allow_blank=True, default="")
    email = serializers.EmailField(allow_blank=True, default="")
    qualifications = serializers.CharField(max_length=2000, allow_blank=True, default="")
    licence_number = serializers.CharField(max_length=40, allow_blank=True, default="")
    emergency_contact = serializers.CharField(max_length=120, allow_blank=True, default="")
    employment_status = serializers.ChoiceField(
        choices=Staff.EmploymentStatus.choices, default=Staff.EmploymentStatus.ACTIVE
    )
    roles = serializers.ListField(child=serializers.CharField(max_length=40))
    is_active = serializers.BooleanField(required=False)

    def validate_roles(self, value):
        if not value:
            raise serializers.ValidationError("Choose at least one role.")
        unknown = sorted(set(value) - STAFF_ROLES)
        if unknown:
            raise serializers.ValidationError(f"Not a staff role: {', '.join(unknown)}.")
        return sorted(set(value))


class NewStaffSerializer(StaffSerializer):
    username = serializers.CharField(max_length=150)

    def validate_username(self, value):
        try:
            return normalise_identifier(User.Kind.STAFF, value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc


def _staff(school, pk) -> Staff:
    return get_object_or_404(Staff.objects.for_school(school).select_related("user"), pk=pk)


class StaffListView(SchoolView):
    def get(self, request):
        staff = Staff.objects.for_school(self.school).select_related("user")
        return Response([staff_row(member) for member in staff.order_by("first_name", "surname")])

    @transaction.atomic
    def post(self, request):
        data = validated(NewStaffSerializer, request)
        if User.objects.filter(school=self.school, login=data["username"]).exists():
            raise serializers.ValidationError(
                {"username": ["That username is already used at this school."]}
            )
        data.pop("is_active", None)
        staff = create_staff(
            self.school,
            username=data.pop("username"),
            roles_held=data.pop("roles"),
            by=request.user,
            **data,
        )
        password = issue_password(staff.user)
        return Response({"staff": staff_detail(staff), "one_time_password": password}, status=201)


def _keep_an_administrator(staff: Staff, roles_after: list[str], active_after: bool) -> None:
    user = staff.user
    was_admin = user.is_active and roles.has_role(user, roles.ADMINISTRATOR)
    if not was_admin or (active_after and roles.ADMINISTRATOR in roles_after):
        return
    others = (
        User.objects.select_for_update()
        .filter(school=staff.school, kind=User.Kind.STAFF, is_active=True)
        .filter(groups__name=roles.ADMINISTRATOR)
        .exclude(pk=user.pk)
    )
    if not others.exists():
        raise ApiError(
            "last_administrator",
            "The school must keep at least one active Administrator. Give someone else the "
            "Administrator role first.",
        )


class StaffDetailView(SchoolView):
    def get(self, request, pk):
        return Response(staff_detail(_staff(self.school, pk)))

    @transaction.atomic
    def patch(self, request, pk):
        staff = _staff(self.school, pk)
        user = staff.user
        serializer = StaffSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        current_roles = [name for name in roles.roles_of(user) if name in STAFF_ROLES]
        roles_after = data.pop("roles", current_roles)
        active_after = data.pop("is_active", user.is_active)
        if data.get("employment_status") == Staff.EmploymentStatus.LEFT:
            active_after = False
        _keep_an_administrator(staff, roles_after, active_after)

        old = {key: getattr(staff, key) for key in data if getattr(staff, key) != data[key]}
        if old:
            for key in old:
                setattr(staff, key, data[key])
            staff.save(update_fields=list(old))
            user.display_name = f"{staff.first_name} {staff.surname}"
            user.phone, user.email = staff.phone, staff.email  # where sign-in codes go
            user.save(update_fields=["display_name", "phone", "email"])
            record(
                AuditLog.Action.UPDATED,
                actor=request.user,
                entity=staff,
                old=old,
                new={key: getattr(staff, key) for key in old},
                request=request,
            )
        if sorted(roles_after) != sorted(current_roles):
            user.groups.remove(*Group.objects.filter(name__in=STAFF_ROLES))
            user.groups.add(*Group.objects.filter(name__in=roles_after))
            record(
                AuditLog.Action.ROLES_CHANGED,
                actor=request.user,
                entity=user,
                old={"roles": current_roles},
                new={"roles": sorted(roles_after)},
                request=request,
            )
        if active_after != user.is_active:
            user.is_active = active_after
            user.save(update_fields=["is_active"])
            action = (
                AuditLog.Action.ACCOUNT_REACTIVATED
                if active_after
                else AuditLog.Action.ACCOUNT_DEACTIVATED
            )
            record(action, actor=request.user, entity=user, request=request)
            if not active_after:
                end_other_sessions(user, keep_key=None)
        return Response(staff_detail(staff))


class StaffResetPasswordView(SchoolView):
    @transaction.atomic
    def post(self, request, pk):
        staff = _staff(self.school, pk)
        password = issue_password(staff.user)
        end_other_sessions(staff.user, keep_key=None)
        record(
            AuditLog.Action.PASSWORD_RESET,
            actor=request.user,
            entity=staff.user,
            reason="Reset by the school's Administrator",
            request=request,
        )
        return Response({"username": staff.user.login, "one_time_password": password})


class StaffMakeRealView(SchoolView):
    @transaction.atomic
    def post(self, request, pk):
        staff = mark_real(_staff(self.school, pk), by=request.user)
        return Response(staff_detail(staff))
