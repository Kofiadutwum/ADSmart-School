"""Sign-in API (Phase 1 spec §5). Errors use the shared {code, message, fields} shape."""

from django.contrib.auth import logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User, UserSession
from apps.accounts.roles import needs_second_factor
from apps.accounts.sessions import describe_device, end_other_sessions, end_session, is_expired
from apps.accounts.signin import (
    check_password_sign_in,
    complete_login,
    me_payload,
    start_second_factor,
)
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError

PASSWORD_MAX = 256


def validated(serializer_class, request) -> dict:
    serializer = serializer_class(data=request.data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def check_new_password(password: str, user=None, field: str = "new_password") -> None:
    try:
        validate_password(password, user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError({field: list(exc.messages)}) from exc


@method_decorator(csrf_protect, name="dispatch")
class OpenView(APIView):
    """Usable before sign-in, but cross-site posts are still refused (login CSRF)."""

    permission_classes = [AllowAny]


class LoginSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=User.Kind.choices)
    identifier = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=PASSWORD_MAX, trim_whitespace=False)
    remember = serializers.BooleanField(default=False)


class LoginView(OpenView):
    def post(self, request):
        data = validated(LoginSerializer, request)
        user = check_password_sign_in(request, data["kind"], data["identifier"], data["password"])
        if needs_second_factor(user):
            return Response(start_second_factor(request, user, remember=data["remember"]))
        complete_login(request, user, remember=data["remember"])
        return Response({"status": "signed_in", "user": me_payload(user)})


class LogoutView(OpenView):
    def post(self, request):
        if request.user.is_authenticated:
            UserSession.objects.filter(session_key=request.session.session_key).delete()
            record(AuditLog.Action.SIGN_OUT, entity=request.user, request=request)
        logout(request)
        return Response(status=204)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class MeView(APIView):
    """Who is signed in. Also gives the browser its CSRF cookie, even when signed out."""

    def get(self, request):
        return Response(me_payload(request.user))


class SessionsView(APIView):
    def get(self, request):
        now = timezone.now()
        current = request.session.session_key
        sessions = request.user.sessions.order_by("-last_seen")
        return Response(
            [
                {
                    "id": session.pk,
                    "device": describe_device(session.user_agent),
                    "ip_address": session.ip_address,
                    "signed_in_at": session.created_at,
                    "last_seen": session.last_seen,
                    "current": session.session_key == current,
                }
                for session in sessions
                if not is_expired(session, now)
            ]
        )


class SessionDetailView(APIView):
    def delete(self, request, pk):
        session = get_object_or_404(UserSession, pk=pk, user=request.user)
        if session.session_key == request.session.session_key:
            raise ApiError("current_session", "To end this session, use Sign out.", 400)
        device = describe_device(session.user_agent)
        end_session(session)
        record(
            AuditLog.Action.SESSION_REVOKED,
            entity=request.user,
            new={"device": device},
            request=request,
        )
        return Response(status=204)


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(max_length=PASSWORD_MAX, trim_whitespace=False)
    new_password = serializers.CharField(max_length=PASSWORD_MAX, trim_whitespace=False)


class PasswordView(APIView):
    def post(self, request):
        data = validated(PasswordChangeSerializer, request)
        user = request.user
        if not user.check_password(data["current_password"]):
            raise serializers.ValidationError(
                {"current_password": ["That isn't your current password."]}
            )
        check_new_password(data["new_password"], user)
        user.set_password(data["new_password"])
        user.must_change_password = False
        user.save()
        old_key = request.session.session_key
        update_session_auth_hash(request, user)  # keeps this session, under a new key
        new_key = request.session.session_key
        UserSession.objects.filter(session_key=old_key).update(session_key=new_key)
        end_other_sessions(user, keep_key=new_key)
        record(AuditLog.Action.PASSWORD_CHANGED, entity=user, request=request)
        return Response(me_payload(user))
