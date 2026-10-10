"""The platform team only (amendment §4). Plan 3's session binding keeps their sessions to
the admin address, so a school's own users are never signed in there."""

from rest_framework.permissions import BasePermission

from apps.accounts.models import User


class IsPlatformStaff(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.kind == User.Kind.PLATFORM)
