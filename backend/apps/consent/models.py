from datetime import date

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.school.models import SchoolOwned, same_school

FORMAT_HELP = (
    "Separate paragraphs with a blank line. Start a line with '## ' for a heading "
    "or '- ' for a list item."
)


class PrivacyNotice(models.Model):
    """A versioned privacy notice (Data Protection Act 2012, Act 843).

    Each school has its own; a notice with no school is the platform's own (amendment §6).
    """

    school = models.ForeignKey(
        "school.School",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="+",
        help_text="Empty for the platform's own notice.",
    )
    version = models.CharField(max_length=20)
    title = models.CharField(max_length=120, default="Privacy notice")
    body = models.TextField(help_text=FORMAT_HELP)
    effective_from = models.DateField()
    is_draft = models.BooleanField(
        default=True,
        help_text="Untick once the wording has been reviewed. Drafts keep the site in preview.",
    )

    class Meta:
        ordering = ["-effective_from", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["school", "version"], name="consent_notice_version")
        ]

    def __str__(self) -> str:
        return f"{self.title} v{self.version}"

    @classmethod
    def current(cls, school=None, today: date | None = None) -> PrivacyNotice | None:
        return cls.objects.filter(
            school=school, effective_from__lte=today or timezone.localdate()
        ).first()

    @classmethod
    def approved_current(cls, school=None) -> PrivacyNotice | None:
        """The notice people are asked to accept: the latest one in force that isn't a draft."""
        return cls.objects.filter(
            school=school, is_draft=False, effective_from__lte=timezone.localdate()
        ).first()


class NoticeAcceptance(models.Model):
    """A person accepted a version of the privacy notice before using the portal (Act 843).
    Never changed or deleted: a new version is accepted with a new row."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notice_acceptances"
    )
    notice = models.ForeignKey(PrivacyNotice, on_delete=models.PROTECT, related_name="+")
    accepted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "notice"], name="consent_one_acceptance")
        ]

    def __str__(self) -> str:
        return f"{self.user} accepted {self.notice}"


class Consent(SchoolOwned):
    """A pupil's or a parent's consent (Phase 1 spec §3.5). Its history is in the audit log.

    SMS_CONTACT covers non-essential messages only: safety, security and payment messages,
    sign-in codes among them, cannot be switched off.
    """

    class Type(models.TextChoices):
        PHOTO_USE = "PHOTO_USE", "Photos may be used"
        MEDICAL_SHARING = "MEDICAL_SHARING", "Medical details may be shared"
        SMS_CONTACT = "SMS_CONTACT", "Non-essential SMS messages"
        SCHOOL_TRIPS = "SCHOOL_TRIPS", "School trips"

    student = models.ForeignKey(
        "people.Student", null=True, blank=True, on_delete=models.CASCADE, related_name="consents"
    )
    parent = models.ForeignKey(
        "people.Parent", null=True, blank=True, on_delete=models.CASCADE, related_name="consents"
    )
    type = models.CharField(max_length=20, choices=Type.choices)
    given = models.BooleanField()
    given_at = models.DateTimeField(null=True, blank=True)
    withdrawn_at = models.DateTimeField(null=True, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    privacy_notice = models.ForeignKey(
        PrivacyNotice,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
        help_text="The notice in force when it was recorded",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(student__isnull=False, parent__isnull=True)
                | Q(student__isnull=True, parent__isnull=False),
                name="consent_one_subject",
            ),
            models.UniqueConstraint(
                fields=["student", "type"],
                condition=Q(student__isnull=False),
                name="consent_student_type",
            ),
            models.UniqueConstraint(
                fields=["parent", "type"],
                condition=Q(parent__isnull=False),
                name="consent_parent_type",
            ),
        ]

    def __str__(self):
        return f"{self.get_type_display()}: {'given' if self.given else 'not given'}"

    def save(self, *args, **kwargs):
        subjects = [subject for subject in (self.student, self.parent) if subject is not None]
        if subjects:
            self.school_id = same_school(*subjects)
        super().save(*args, **kwargs)
