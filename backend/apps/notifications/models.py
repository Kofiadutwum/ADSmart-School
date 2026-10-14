from django.conf import settings
from django.db import models

from apps.school.models import SchoolOwned


class SmsMessage(models.Model):
    """Every SMS the system tried to send (Phase 1 spec §3.7), with the school it was for."""

    class Status(models.TextChoices):
        SENT = "SENT", "Sent"
        DELIVERED = "DELIVERED", "Delivered"
        FAILED = "FAILED", "Failed"
        REFUSED = "REFUSED", "Refused"

    school = models.ForeignKey(
        "school.School", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    to = models.CharField(max_length=16, db_index=True)
    purpose = models.CharField(max_length=40)
    body = models.TextField(help_text="Sign-in codes are stored redacted.")
    status = models.CharField(max_length=10, choices=Status.choices)
    provider_reference = models.CharField(max_length=100, blank=True)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.to} {self.purpose} {self.status}"


class MessageTemplate(SchoolOwned):
    """The wording of an automatic message, approved by the Head Teacher (SMS spec §24)."""

    key = models.CharField(max_length=30)
    body = models.TextField(max_length=480)
    approved = models.BooleanField(default=False)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["key"]
        constraints = [
            models.UniqueConstraint(fields=["school", "key"], name="notifications_one_template")
        ]

    def __str__(self):
        return self.key


class SmsCreditEntry(SchoolOwned):
    """Credits bought (positive) and used (negative); the balance is their sum (SMS spec §24)."""

    change = models.IntegerField()
    reason = models.CharField(max_length=200)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.change:+d} {self.reason}"


class Announcement(SchoolOwned):
    """A message to parents, staff or both, shown in the portal and optionally texted."""

    class Audience(models.TextChoices):
        PARENTS = "PARENTS", "Parents"
        STAFF = "STAFF", "Staff"
        EVERYONE = "EVERYONE", "Parents and staff"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SENT = "SENT", "Sent"

    title = models.CharField(max_length=160)
    body = models.TextField(max_length=2000)
    audience = models.CharField(max_length=8, choices=Audience.choices, default=Audience.PARENTS)
    school_class = models.ForeignKey(
        "academics.SchoolClass",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        help_text="Only this class's parents",
    )
    essential = models.BooleanField(
        default=False, help_text="Safety or payment: sent even to parents who opted out of texts"
    )
    send_sms = models.BooleanField(default=False)
    status = models.CharField(max_length=5, choices=Status.choices, default=Status.DRAFT)
    sent_at = models.DateTimeField(null=True, blank=True)
    texts_sent = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title
