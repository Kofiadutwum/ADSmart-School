"""Append-only audit trail (Phase 1 spec §3.8, §11.3). Write entries with services.record()."""

from django.conf import settings
from django.db import models


class AppendOnlyError(Exception):
    """Raised on any attempt to change or remove an audit entry."""


class AuditLogQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise AppendOnlyError("Audit entries cannot be changed.")

    def delete(self):
        raise AppendOnlyError("Audit entries cannot be deleted.")


class AuditLog(models.Model):
    class Action(models.TextChoices):
        SIGN_IN = "SIGN_IN", "Signed in"
        SIGN_IN_FAILED = "SIGN_IN_FAILED", "Sign-in failed"
        LOCKED_OUT = "LOCKED_OUT", "Locked out"
        SIGN_OUT = "SIGN_OUT", "Signed out"
        SESSION_REVOKED = "SESSION_REVOKED", "Signed out another session"
        PASSWORD_CHANGED = "PASSWORD_CHANGED", "Password changed"
        PASSWORD_RESET = "PASSWORD_RESET", "Password reset"
        ACCOUNT_ACTIVATED = "ACCOUNT_ACTIVATED", "Account activated"
        ACCOUNT_DEACTIVATED = "ACCOUNT_DEACTIVATED", "Account deactivated"
        ACCOUNT_REACTIVATED = "ACCOUNT_REACTIVATED", "Account reactivated"
        SECOND_FACTOR_SET_UP = "SECOND_FACTOR_SET_UP", "Second factor set up"
        SECOND_FACTOR_RESET = "SECOND_FACTOR_RESET", "Second factor reset"
        BACKUP_CODE_USED = "BACKUP_CODE_USED", "Backup code used"
        USER_CREATED = "USER_CREATED", "User created"
        ROLES_CHANGED = "ROLES_CHANGED", "Roles changed"
        CREATED = "CREATED", "Created"
        UPDATED = "UPDATED", "Updated"
        DELETED = "DELETED", "Deleted"
        PUBLISHED = "PUBLISHED", "Published"
        UNPUBLISHED = "UNPUBLISHED", "Unpublished"
        STATUS_CHANGED = "STATUS_CHANGED", "Status changed"
        WEBSITE_LIVE = "WEBSITE_LIVE", "Website went live"
        VIEWED_RESTRICTED = "VIEWED_RESTRICTED", "Viewed a restricted record"
        CONSENT_GIVEN = "CONSENT_GIVEN", "Consent given"
        CONSENT_WITHDRAWN = "CONSENT_WITHDRAWN", "Consent withdrawn"
        DEMO_CONVERTED = "DEMO_CONVERTED", "Demo record made real"
        DEMO_PURGED = "DEMO_PURGED", "Demo records deleted"

    # No database constraints: entries must outlive any user or school they mention.
    school = models.ForeignKey(
        "school.School",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        db_constraint=False,
        related_name="+",
        help_text="Empty for platform events (amendment §4).",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        db_constraint=False,
        related_name="+",
    )
    actor_name = models.CharField(max_length=150, blank=True)
    action = models.CharField(max_length=40, db_index=True)
    entity_type = models.CharField(max_length=60, blank=True)
    entity_id = models.CharField(max_length=64, blank=True)
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    reason = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    objects = AuditLogQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["entity_type", "entity_id"])]

    def __str__(self):
        return f"{self.action} {self.entity_type}:{self.entity_id}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise AppendOnlyError("Audit entries cannot be changed.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise AppendOnlyError("Audit entries cannot be deleted.")
