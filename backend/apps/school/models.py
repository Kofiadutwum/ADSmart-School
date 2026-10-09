from datetime import date

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.core.phones import normalise_gh_phone


class SchoolProfile(models.Model):
    """The school's identity and contact details. There is exactly one row (pk=1)."""

    name = models.CharField(max_length=120)
    motto = models.CharField(max_length=200, blank=True)
    founded_year = models.PositiveSmallIntegerField()
    address = models.CharField(max_length=200, blank=True)
    town = models.CharField(max_length=80)
    region = models.CharField(max_length=80)
    ghana_post_gps = models.CharField("GhanaPost GPS", max_length=20, blank=True)
    phone = models.CharField(max_length=16, help_text="Any Ghana number, stored as +233…")
    whatsapp = models.CharField(max_length=16, blank=True, help_text="A Ghana mobile number")
    email = models.EmailField()
    map_query = models.CharField(
        max_length=200, blank=True, help_text="What the map searches for, e.g. Kronom, Kumasi"
    )

    class Meta:
        verbose_name = "school profile"

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def clean(self):
        errors = {}
        for field, mobile_only in (("phone", False), ("whatsapp", True)):
            value = getattr(self, field)
            if not value:
                continue
            try:
                setattr(self, field, normalise_gh_phone(value, mobile_only=mobile_only))
            except ValueError as exc:
                errors[field] = str(exc)
        if errors:
            raise ValidationError(errors)

    @classmethod
    def load(cls) -> SchoolProfile | None:
        return cls.objects.filter(pk=1).first()

    def years_since_founding(self, today: date | None = None) -> int:
        return (today or timezone.localdate()).year - self.founded_year
