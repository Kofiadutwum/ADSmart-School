"""A school's own staff, at their own school's address (Phase 1 spec §4.2). The session
middleware already refuses a school user anywhere but their school, so a view only needs the
user's school and their role."""

from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts import roles
from apps.accounts.models import User


class BillingPaused(PermissionDenied):
    """Business tools spec §3.7: while paused for an unpaid bill only the Billing page works."""

    default_detail = "Your school is paused until its bill is paid. Open Billing to pay."
    default_code = "billing_paused"


class SchoolRolePermission(BasePermission):
    """Reads need one of ``view.read_roles``; changes need one of ``view.write_roles``."""

    message = "Your role at this school doesn't include this."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.kind == User.Kind.STAFF and user.school_id):
            return False
        if user.school.billing_paused and not getattr(view, "allowed_while_paused", False):
            raise BillingPaused()
        allowed = view.read_roles if request.method in SAFE_METHODS else view.write_roles
        return roles.has_role(user, *allowed)
