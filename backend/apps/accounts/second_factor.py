"""Authenticator app and backup codes for the second factor (Phase 1 spec §5.3)."""

import base64
import hmac
import secrets
import time

import pyotp
import qrcode
import qrcode.image.svg
from django.conf import settings
from django.utils import timezone
from django.utils.crypto import salted_hmac

from apps.accounts.models import BackupCode, TotpDevice, User
from apps.accounts.sessions import end_other_sessions
from apps.accounts.signin import PENDING_KEY, complete_login, me_payload
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError

BACKUP_CODE_COUNT = 10
BACKUP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no 0/o or 1/i/l to misread
MAX_WRONG_CODES = 5


def new_device(user: User) -> TotpDevice:
    device, _ = TotpDevice.objects.update_or_create(
        user=user,
        defaults={"secret": pyotp.random_base32(), "confirmed_at": None, "last_used_step": None},
    )
    return device


def provisioning(user: User, secret: str) -> dict:
    issuer = user.school.name if user.school else settings.PLATFORM_NAME
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.login, issuer_name=issuer)
    svg = qrcode.make(uri, image_factory=qrcode.image.svg.SvgPathImage).to_string()
    return {
        "secret": secret,
        "otpauth_url": uri,
        "qr_image": "data:image/svg+xml;base64," + base64.b64encode(svg).decode(),
    }


def matching_step(
    secret: str, code: str, *, after: int | None = None, now: float | None = None
) -> int | None:
    """The 30-second step the code belongs to, allowing one step of clock drift."""
    if len(code) != 6 or not code.isascii() or not code.isdigit():
        return None
    totp = pyotp.TOTP(secret)
    current = int((time.time() if now is None else now) // totp.interval)
    for step in (current - 1, current, current + 1):
        if (after is None or step > after) and hmac.compare_digest(totp.generate_otp(step), code):
            return step
    return None


def verify_totp(device: TotpDevice, code: str) -> bool:
    step = matching_step(device.secret, code.strip(), after=device.last_used_step)
    if step is None:
        return False
    device.last_used_step = step  # a used code is refused for the rest of its window
    device.save(update_fields=["last_used_step"])
    return True


def _backup_digest(code: str) -> str:
    normalised = code.replace("-", "").strip().lower()
    return salted_hmac("accounts.backup-code", normalised, algorithm="sha256").hexdigest()


def issue_backup_codes(user: User) -> list[str]:
    BackupCode.objects.filter(user=user).delete()
    codes = []
    for _ in range(BACKUP_CODE_COUNT):
        raw = "".join(secrets.choice(BACKUP_ALPHABET) for _ in range(8))
        codes.append(f"{raw[:4]}-{raw[4:]}")
    BackupCode.objects.bulk_create(
        BackupCode(user=user, code_hash=_backup_digest(code)) for code in codes
    )
    return codes


def use_backup_code(user: User, code: str) -> bool:
    matching = BackupCode.objects.filter(
        user=user, code_hash=_backup_digest(code), used_at__isnull=True
    )
    return matching.update(used_at=timezone.now()) == 1


def reset_second_factor(user: User, *, by: User | None = None, request=None, reason="") -> None:
    TotpDevice.objects.filter(user=user).delete()
    BackupCode.objects.filter(user=user).delete()
    end_other_sessions(user, keep_key=None)
    record(
        AuditLog.Action.SECOND_FACTOR_RESET, actor=by, entity=user, reason=reason, request=request
    )


def reject_code(request):
    """Count a wrong code; the fifth ends the attempt (§5.5). Always raises."""
    pending = request.session[PENDING_KEY]
    pending["failures"] = pending.get("failures", 0) + 1
    if pending["failures"] >= MAX_WRONG_CODES:
        del request.session[PENDING_KEY]
        raise ApiError("second_factor_expired", "Too many wrong codes. Please sign in again.", 429)
    request.session[PENDING_KEY] = pending
    raise ApiError("invalid_code", "That code didn't work. Check it and try again.", 400)


def finish_second_factor(request, user: User) -> dict:
    complete_login(request, user, remember=request.session[PENDING_KEY]["remember"])
    return {"status": "signed_in", "user": me_payload(user)}
