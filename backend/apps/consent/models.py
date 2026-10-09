from datetime import date

from django.db import models
from django.utils import timezone

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
