"""The Owner's Team screen (business tools spec §2): platform accounts and their roles."""

from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.response import Response

from apps.accounts import roles
from apps.accounts.identifiers import normalise_identifier
from apps.accounts.models import User
from apps.accounts.views import validated
from apps.core.exceptions import ApiError
from apps.core.phones import normalise_gh_phone
from apps.platform_admin import services
from apps.platform_admin.views import OwnerView

ROLES_MESSAGE = "Choose at least one of Owner, Finance, Content and Support."


def team_row(user: User) -> dict:
    return {
        "id": user.pk,
        "name": str(user),
        "username": user.login,
        "phone": user.phone,
        "email": user.email,
        "roles": [name for name in roles.roles_of(user) if name in roles.PLATFORM_ROLES],
        "is_active": user.is_active,
        "last_sign_in": user.last_login,
    }


def _team_roles(value: list[str]) -> list[str]:
    if not value or not set(value) <= set(roles.PLATFORM_ROLES):
        raise serializers.ValidationError(ROLES_MESSAGE)
    return sorted(set(value))


class NewMemberSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=60)
    surname = serializers.CharField(max_length=60)
    username = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=20, allow_blank=True, default="")
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    roles = serializers.ListField(child=serializers.CharField(), allow_empty=True)

    def validate_username(self, value):
        try:
            login = normalise_identifier(User.Kind.PLATFORM, value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        if User.objects.filter(school=None, login=login).exists():
            raise serializers.ValidationError("That username is already taken.")
        return login

    def validate_phone(self, value):
        try:
            return normalise_gh_phone(value) if value else ""
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate_roles(self, value):
        return _team_roles(value)

    def validate(self, data):
        if not data["phone"] and not data["email"]:
            raise serializers.ValidationError(
                {"phone": ["Give a mobile number or an email address for sign-in codes."]}
            )
        return data


class MemberUpdateSerializer(serializers.Serializer):
    roles = serializers.ListField(child=serializers.CharField(), required=False)
    is_active = serializers.BooleanField(required=False)

    def validate_roles(self, value):
        return _team_roles(value)


def _member(pk: int) -> User:
    return get_object_or_404(User, pk=pk, kind=User.Kind.PLATFORM)


class TeamView(OwnerView):
    def get(self, request):
        members = User.objects.filter(kind=User.Kind.PLATFORM).order_by("display_name", "login")
        return Response([team_row(user) for user in members])

    def post(self, request):
        data = validated(NewMemberSerializer, request)
        user, password = services.add_team_member(
            first_name=data["first_name"],
            surname=data["surname"],
            username=data["username"],
            phone=data["phone"],
            email=data["email"],
            roles_held=data["roles"],
            by=request.user,
            request=request,
        )
        return Response({"member": team_row(user), "one_time_password": password}, status=201)


class TeamMemberView(OwnerView):
    def patch(self, request, pk):
        user = _member(pk)
        data = validated(MemberUpdateSerializer, request)
        try:
            services.update_team_member(
                user,
                roles_held=data.get("roles"),
                is_active=data.get("is_active"),
                by=request.user,
                request=request,
            )
        except services.LastOwnerError as exc:
            raise ApiError(
                "last_owner", "The team must keep at least one active Owner.", 400
            ) from exc
        return Response(team_row(user))


class TeamResetPasswordView(OwnerView):
    def post(self, request, pk):
        user = _member(pk)
        password = services.reset_team_password(user, by=request.user, request=request)
        return Response({"username": user.login, "one_time_password": password})
