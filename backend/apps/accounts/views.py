"""Sign-in API (Phase 1 spec §5). Errors use the shared {code, message, fields} shape."""

from django.contrib.auth import logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.roles import needs_second_factor
from apps.accounts.signin import (
    check_password_sign_in,
    complete_login,
    me_payload,
    start_second_factor,
)
from apps.audit.models import AuditLog
from apps.audit.services import record

PASSWORD_MAX = 256


def validated(serializer_class, request) -> dict:
    serializer = serializer_class(data=request.data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


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
            record(AuditLog.Action.SIGN_OUT, entity=request.user, request=request)
        logout(request)
        return Response(status=204)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class MeView(APIView):
    """Who is signed in. Also gives the browser its CSRF cookie, even when signed out."""

    def get(self, request):
        return Response(me_payload(request.user))
