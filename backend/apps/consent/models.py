from datetime import date

from django.db import models
from django.utils import timezone

FORMAT_HELP = (
    "Separate paragraphs with a blank line. Start a line with '## ' for a heading "
    "or '- ' for a list item."
)


class PrivacyNotice(models.Model):
    """A versioned privacy notice (Data Protection Act 2012, Act 843)."""

    version = models.CharField(max_length=20, unique=True)
    title = models.CharField(max_length=120, default="Privacy notice")
    body = models.TextField(help_text=FORMAT_HELP)
    effective_from = models.DateField()
    is_draft = models.BooleanField(
        default=True,
        help_text="Untick once the wording has been reviewed. Drafts keep the site in preview.",
    )

    class Meta:
        ordering = ["-effective_from", "-id"]

    def __str__(self) -> str:
        return f"{self.title} v{self.version}"

    @classmethod
    def current(cls, today: date | None = None) -> PrivacyNotice | None:
        return cls.objects.filter(effective_from__lte=today or timezone.localdate()).first()
