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
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import SmsCode, TotpDevice, User, UserSession
from apps.accounts.roles import needs_second_factor
from apps.accounts.second_factor import (
    finish_second_factor,
    issue_backup_codes,
    new_device,
    provisioning,
    reject_code,
    use_backup_code,
    verify_totp,
)
from apps.accounts.sessions import describe_device, end_other_sessions, end_session, is_expired
from apps.accounts.signin import (
    check_password_sign_in,
    complete_login,
    has_authenticator,
    me_payload,
    pending_user,
    start_second_factor,
)
from apps.accounts.sms_codes import check_code, consume, send_code, sms_failed_message
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError
from apps.core.phones import normalise_gh_phone
from apps.notifications.models import SmsMessage
from apps.school.hosts import request_school

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


class CodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=20)


class VerifySerializer(CodeSerializer):
    method = serializers.ChoiceField(choices=["totp", "sms", "backup"])


class SecondFactorSetupView(OpenView):
    def post(self, request):
        user = pending_user(request)
        if has_authenticator(user):
            raise ApiError(
                "already_set_up", "An authenticator app is already set up for this account.", 400
            )
        return Response(provisioning(user, new_device(user).secret))


class SecondFactorConfirmView(OpenView):
    def post(self, request):
        user = pending_user(request)
        code = validated(CodeSerializer, request)["code"]
        device = TotpDevice.objects.filter(user=user, confirmed_at__isnull=True).first()
        if device is None or not verify_totp(device, code):
            reject_code(request)
        device.confirmed_at = timezone.now()
        device.save(update_fields=["confirmed_at"])
        codes = issue_backup_codes(user)
        record(AuditLog.Action.SECOND_FACTOR_SET_UP, actor=user, entity=user, request=request)
        return Response({**finish_second_factor(request, user), "backup_codes": codes})


class SecondFactorSmsView(OpenView):
    def post(self, request):
        user = pending_user(request)
        if not user.phone:
            raise ApiError(
                "no_phone",
                "There's no mobile number on your account. Use your authenticator app or a "
                "backup code.",
                400,
            )
        message = send_code(user, SmsCode.Purpose.SIGN_IN, user.phone)
        if message.status == SmsMessage.Status.REFUSED:
            raise ApiError(
                "too_many_codes",
                "Too many codes have been sent to your phone. Wait an hour, or use your "
                "authenticator app or a backup code.",
                429,
            )
        if message.status != SmsMessage.Status.SENT:
            raise ApiError("sms_failed", sms_failed_message(user.school), 503)
        return Response({"sent": True})


class SecondFactorVerifyView(OpenView):
    def post(self, request):
        user = pending_user(request)
        data = validated(VerifySerializer, request)
        method, code = data["method"], data["code"]
        if method == "totp":
            device = TotpDevice.objects.filter(user=user, confirmed_at__isnull=False).first()
            ok = device is not None and verify_totp(device, code)
        elif method == "sms":
            row = check_code(user, SmsCode.Purpose.SIGN_IN, code)
            ok = row is not None and consume(row)
        else:
            ok = use_backup_code(user, code)
            if ok:
                record(AuditLog.Action.BACKUP_CODE_USED, actor=user, entity=user, request=request)
        if not ok:
            reject_code(request)
        return Response(finish_second_factor(request, user))


class SmsCodeAddressThrottle(AnonRateThrottle):
    scope = "sms_code_ip"


class PhoneField(serializers.CharField):
    def to_internal_value(self, data):
        try:
            return normalise_gh_phone(super().to_internal_value(data))
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc


class RequestCodeSerializer(serializers.Serializer):
    phone = PhoneField(max_length=20)


class SetPasswordSerializer(RequestCodeSerializer):
    code = serializers.RegexField(
        r"^\d{6}$", error_messages={"invalid": "Enter the 6-digit code from the SMS."}
    )
    password = serializers.CharField(max_length=PASSWORD_MAX, trim_whitespace=False)
    remember = serializers.BooleanField(default=False)


CODE_SENT = "If this number is registered, a code has been sent."
BAD_CODE = "That code is wrong or has expired. Request a new code."


def active_parent(school, phone: str) -> User | None:
    return User.objects.filter(
        school=school, kind=User.Kind.PARENT, login=phone, is_active=True
    ).first()


class ParentRequestCodeView(OpenView):
    throttle_classes = [SmsCodeAddressThrottle]

    def post(self, request):
        school = request_school(request)
        phone = validated(RequestCodeSerializer, request)["phone"]
        user = active_parent(school, phone)
        if user is not None:
            send_code(user, SmsCode.Purpose.ACTIVATION, phone)  # outcome not revealed (§5.2)
        return Response({"message": CODE_SENT})


class ParentSetPasswordView(OpenView):
    def post(self, request):
        school = request_school(request)
        data = validated(SetPasswordSerializer, request)
        # Checked before the lookup, so a weak password says nothing about the number.
        check_new_password(data["password"], field="password")
        user = active_parent(school, data["phone"])
        row = check_code(user, SmsCode.Purpose.ACTIVATION, data["code"]) if user else None
        if row is None:
            raise ApiError("invalid_code", BAD_CODE, 400)
        check_new_password(data["password"], user, field="password")
        if not consume(row):
            raise ApiError("invalid_code", BAD_CODE, 400)

        first_time = user.activated_at is None
        user.set_password(data["password"])
        user.activated_at = user.activated_at or timezone.now()
        user.save()
        end_other_sessions(user, keep_key=None)
        action = AuditLog.Action.ACCOUNT_ACTIVATED if first_time else AuditLog.Action.PASSWORD_RESET
        record(action, actor=user, entity=user, request=request)
        complete_login(request, user, remember=data["remember"])
        return Response({"status": "signed_in", "user": me_payload(user)})
