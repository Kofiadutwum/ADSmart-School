from django.db import models


class SmsMessage(models.Model):
    """Every SMS the system tried to send (Phase 1 spec §3.7), with the school it was for."""

    class Status(models.TextChoices):
        SENT = "SENT", "Sent"
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
