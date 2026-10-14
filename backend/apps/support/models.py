"""Support between schools and the platform team, and data protection records.

- Support access (MS §4): a school's Administrator lets the platform team read its records for
  24 or 72 hours, and can end it early. Every record opened is logged.
- Platform announcements and support conversations (business tools spec §6).
- Data requests, breach records and retention (SMS spec §30).
"""

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.school.models import SchoolOwned


class SupportGrant(SchoolOwned):
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    hours = models.PositiveSmallIntegerField()
    starts_at = models.DateTimeField(default=timezone.now)
    ends_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-starts_at"]

    def __str__(self):
        return f"{self.school} support access until {self.ends_at:%Y-%m-%d %H:%M}"

    def is_active(self, now=None) -> bool:
        now = now or timezone.now()
        return self.ended_at is None and self.starts_at <= now < self.ends_at

    @classmethod
    def active_for(cls, school):
        now = timezone.now()
        return cls.objects.filter(school=school, ended_at__isnull=True, ends_at__gt=now).first()


class PlatformAnnouncement(models.Model):
    title = models.CharField(max_length=160)
    body = models.TextField()
    published = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class SupportThread(SchoolOwned):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        CLOSED = "CLOSED", "Closed"

    subject = models.CharField(max_length=160)
    status = models.CharField(max_length=6, choices=Status.choices, default=Status.OPEN)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.subject


class SupportMessage(models.Model):
    thread = models.ForeignKey(SupportThread, on_delete=models.CASCADE, related_name="messages")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    from_platform = models.BooleanField(default=False)
    body = models.TextField(max_length=4000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.thread}: {self.body[:40]}"


class DataRequest(SchoolOwned):
    """A parent asks for a copy of their family's data, a correction or a deletion (Act 843)."""

    class Kind(models.TextChoices):
        COPY = "COPY", "A copy of our data"
        CORRECTION = "CORRECTION", "A correction"
        DELETION = "DELETION", "Deletion"
        OTHER = "OTHER", "Something else"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        DONE = "DONE", "Done"
        REFUSED = "REFUSED", "Refused"

    parent = models.ForeignKey(
        "people.Parent", on_delete=models.CASCADE, related_name="data_requests"
    )
    kind = models.CharField(max_length=10, choices=Kind.choices)
    details = models.TextField(max_length=2000, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.OPEN)
    response = models.TextField(max_length=2000, blank=True)
    due_on = models.DateField()
    handled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_kind_display()} from {self.parent}"


class BreachRecord(SchoolOwned):
    """The breach procedure's record: what happened, who was affected, what was done."""

    occurred_on = models.DateField(null=True, blank=True)
    discovered_on = models.DateField()
    description = models.TextField(max_length=4000)
    data_affected = models.CharField(max_length=300)
    people_affected = models.PositiveIntegerField(default=0)
    actions_taken = models.TextField(max_length=4000, blank=True)
    reported_to_regulator = models.BooleanField(default=False)
    reported_on = models.DateField(null=True, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-discovered_on"]

    def __str__(self):
        return f"Breach found {self.discovered_on}"


class RetentionRule(SchoolOwned):
    """How long a school keeps the records of pupils who have left (SMS spec §30)."""

    left_pupil_years = models.PositiveSmallIntegerField(default=7)
    staff_years = models.PositiveSmallIntegerField(default=7)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["school"], name="support_one_retention_rule")
        ]

    def __str__(self):
        return f"Keep for {self.left_pupil_years} years"
