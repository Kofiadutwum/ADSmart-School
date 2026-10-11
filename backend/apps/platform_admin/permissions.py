"""The platform team only (amendment §4), each member limited to their roles (business tools
spec §2). Plan 3's session binding keeps their sessions to the admin address, so a school's own
users are never signed in there."""

from rest_framework.permissions import BasePermission

from apps.accounts import roles
from apps.accounts.models import User


class IsPlatformStaff(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.kind == User.Kind.PLATFORM)


def PlatformRole(*allowed: str) -> type[BasePermission]:  # noqa: N802 - used like a class
    """Platform staff holding one of ``allowed``. The Owner holds them all."""
    names = {roles.PLATFORM_OWNER, *allowed}

    class HasPlatformRole(IsPlatformStaff):
        message = "Your role on the team doesn't include this."

        def has_permission(self, request, view):
            return super().has_permission(request, view) and roles.has_role(request.user, *names)

    return HasPlatformRole


# Which role each part of /api/platform/ belongs to. tests/platform_admin/test_roles.py checks
# every route against it, so a new area must be added here.
ROLE_FOR_AREA = {
    "schools": roles.PLATFORM_SUPPORT,
    "leads": roles.PLATFORM_SUPPORT,
    "audit": roles.PLATFORM_OWNER,
    "team": roles.PLATFORM_OWNER,
    "website": roles.PLATFORM_CONTENT,
}
