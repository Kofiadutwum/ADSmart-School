"""Schools on the platform (multi-school amendment §3). Every school-owned record points here."""

from datetime import date

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.core.models import ImageRenditionsMixin
from apps.core.phones import normalise_gh_phone
from apps.school import branding
from apps.school.slugs import validate_slug

LEVEL_CODES = ("creche", "nursery", "kg", "lower_primary", "upper_primary", "jhs")


def all_levels() -> list[str]:
    return list(LEVEL_CODES)


def logo_upload_to(instance, filename: str) -> str:
    return f"schools/{instance.pk}/logo/{filename}"  # the school is saved before its logo


class School(ImageRenditionsMixin):
    """One school: identity, contact details, web address, levels and brand."""

    rendition_source_field = "logo"

    class Status(models.TextChoices):
        TRIAL = "trial", "Trial"
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"

    slug = models.CharField(
        max_length=30,
        unique=True,
        validators=[validate_slug],
        help_text="The school's web address: <slug>.<platform domain>. Fixed once created.",
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.TRIAL)
    name = models.CharField(max_length=120)
    motto = models.CharField(max_length=200, blank=True)
    founded_year = models.PositiveSmallIntegerField(null=True, blank=True)
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
    levels_offered = models.JSONField(
        default=all_levels, help_text="Codes of the levels the school teaches."
    )
    brand_primary = models.CharField(max_length=7, default=branding.DEFAULT_PRIMARY)
    brand_accent = models.CharField(max_length=7, default=branding.DEFAULT_ACCENT)
    logo = models.ImageField(upload_to=logo_upload_to, blank=True)
    is_live = models.BooleanField(
        default=False,
        help_text="Marked live by the school. The site stays in preview until every check passes.",
    )
    went_live_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

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
        levels = self.levels_offered or []
        if not levels or any(code not in LEVEL_CODES for code in levels):
            errors["levels_offered"] = "Choose at least one of the school's levels."
        else:
            self.levels_offered = [code for code in LEVEL_CODES if code in levels]
        for field, check in (
            ("brand_primary", branding.check_primary),
            ("brand_accent", branding.check_accent),
        ):
            try:
                setattr(self, field, check(getattr(self, field)))
            except branding.ColourError as exc:
                errors[field] = str(exc)
        if errors:
            raise ValidationError(errors)

    @property
    def is_suspended(self) -> bool:
        return self.status == self.Status.SUSPENDED

    def years_since_founding(self, today: date | None = None) -> int | None:
        if self.founded_year is None:
            return None
        return (today or timezone.localdate()).year - self.founded_year

    def primary_host(self) -> str:
        domain = self.domains.filter(is_primary=True, verified_at__isnull=False).first()
        return domain.domain if domain else f"{self.slug}.{settings.PLATFORM_DOMAIN}"

    def base_url(self) -> str:
        return settings.SITE_URL_TEMPLATE.format(host=self.primary_host())


class SchoolDomain(models.Model):
    """A school's own web address, e.g. adsmartschool.edu.gh (amendment §2.3)."""

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="domains")
    domain = models.CharField(max_length=253, unique=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    is_primary = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["school"], condition=Q(is_primary=True), name="school_one_primary_domain"
            )
        ]

    def __str__(self) -> str:
        return self.domain

    def save(self, *args, **kwargs):
        self.domain = self.domain.strip().lower().rstrip(".")
        super().save(*args, **kwargs)


class SchoolOwnedQuerySet(models.QuerySet):
    def for_school(self, school: School):
        return self.filter(school=school)


class SchoolOwned(models.Model):
    """Base for every record that belongs to one school (amendment §3.2)."""

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="+")

    objects = SchoolOwnedQuerySet.as_manager()

    class Meta:
        abstract = True
