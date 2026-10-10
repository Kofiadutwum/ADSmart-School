"""The second sign-in step (Phase 1 spec §5.3, owner decision 2026-10-10): a 6-digit code sent
by SMS or email to the phone number or address on the account."""

from apps.accounts.models import User
from apps.accounts.signin import PENDING_KEY, complete_login, count_wrong_code, me_payload
from apps.core.exceptions import ApiError

MAX_WRONG_CODES = 5


def reject_code(request, user: User):
    """Count a wrong code; the fifth ends the attempt (§5.5). Always raises."""
    count_wrong_code(request, user)
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
