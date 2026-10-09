from django.db import models
from django.utils import timezone

from apps.consent.models import FORMAT_HELP
from apps.core.models import ImageRenditionsMixin
from apps.school.models import SchoolOwned, SchoolOwnedQuerySet


def photo_upload_to(instance, filename: str) -> str:
    return f"schools/{instance.school_id}/photos/{filename}"


def news_upload_to(instance, filename: str) -> str:
    return f"schools/{instance.school_id}/news/{filename}"


def _unique_per_school(model: str, field: str) -> models.UniqueConstraint:
    return models.UniqueConstraint(fields=["school", field], name=f"website_{model}_{field}")


class ContentBlock(SchoolOwned):
    """One editable piece of website text, looked up by key."""

    key = models.SlugField(max_length=60)
    text = models.TextField(help_text=FORMAT_HELP)
    help_text = models.CharField(max_length=200, blank=True)
    needs_review = models.BooleanField(
        default=True,
        help_text="Ticked while the text is provisional. The site stays in preview until "
        "every block is reviewed.",
    )

    class Meta:
        ordering = ["key"]
        constraints = [_unique_per_school("contentblock", "key")]

    def __str__(self) -> str:
        return self.key


class PhotoSlot(ImageRenditionsMixin, SchoolOwned):
    key = models.SlugField(max_length=40)
    image = models.ImageField(upload_to=photo_upload_to)
    alt_text = models.CharField(max_length=200)
    caption = models.CharField(max_length=120, blank=True)
    is_placeholder = models.BooleanField(
        default=True, help_text="Ticked while this is not a real photo of the school."
    )
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "key"]
        constraints = [_unique_per_school("photoslot", "key")]

    def __str__(self) -> str:
        return self.key


class Fact(SchoolOwned):
    YEARS_TOKEN = "{years}"

    label = models.CharField(max_length=80)
    value = models.CharField(max_length=40, help_text="Use {years} for years since founding.")
    order = models.PositiveSmallIntegerField(default=0)
    visible = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return f"{self.value} {self.label}"

    def display_value(self, years: int | None) -> str | None:
        """The value to show, or None when it needs a founding year the school hasn't given."""
        if self.YEARS_TOKEN not in self.value:
            return self.value
        return None if years is None else self.value.replace(self.YEARS_TOKEN, str(years))


class FeatureBlock(SchoolOwned):
    """A "For parents" promise. Off by default: switch on only once the feature is live."""

    class Icon(models.TextChoices):
        MESSAGE = "message", "Message"
        PHONE = "phone", "Phone"
        CARE = "care", "Care"
        SHIELD = "shield", "Shield"

    key = models.SlugField(max_length=40)
    title = models.CharField(max_length=80)
    text = models.CharField(max_length=240)
    icon = models.CharField(max_length=20, choices=Icon.choices)
    enabled = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "key"]
        constraints = [_unique_per_school("featureblock", "key")]

    def __str__(self) -> str:
        return self.title


class NewsPostQuerySet(SchoolOwnedQuerySet):
    def published(self):
        return self.filter(status=NewsPost.Status.PUBLISHED, published_at__lte=timezone.now())


class NewsPost(ImageRenditionsMixin, SchoolOwned):
    rendition_source_field = "cover"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"

    title = models.CharField(max_length=160)
    slug = models.SlugField(max_length=170)
    summary = models.CharField(max_length=240)
    body = models.TextField(help_text=FORMAT_HELP)
    cover = models.ImageField(upload_to=news_upload_to, blank=True)
    cover_alt = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)

    objects = NewsPostQuerySet.as_manager()

    class Meta:
        ordering = ["-published_at", "-id"]
        constraints = [_unique_per_school("newspost", "slug")]

    def __str__(self) -> str:
        return self.title


class Enquiry(SchoolOwned):
    """An admissions enquiry from a school's website (Phase 1 spec §6.4)."""

    class Level(models.TextChoices):
        CRECHE = "creche", "Crèche"
        NURSERY = "nursery", "Nursery"
        KG = "kg", "Kindergarten (KG)"
        LOWER_PRIMARY = "lower_primary", "Lower Primary (Basic 1–3)"
        UPPER_PRIMARY = "upper_primary", "Upper Primary (Basic 4–6)"
        JHS = "jhs", "Junior High School (JHS)"

    class Status(models.TextChoices):
        NEW = "new", "New"
        CONTACTED = "contacted", "Contacted"
        VISITED = "visited", "Visited"
        ENROLLED = "enrolled", "Enrolled"
        CLOSED = "closed", "Closed"

    parent_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=16)
    email = models.EmailField(blank=True)
    child_name = models.CharField(max_length=120)
    child_date_of_birth = models.DateField()
    level_wanted = models.CharField(max_length=20, choices=Level.choices)
    preferred_visit_date = models.DateField(null=True, blank=True)
    message = models.TextField(max_length=1000, blank=True)
    data_consent = models.BooleanField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.NEW)
    staff_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "enquiries"

    def __str__(self) -> str:
        return f"{self.child_name} ({self.get_level_wanted_display()})"


class Lead(models.Model):
    """A "Get your school online" request from the platform site (amendment §6)."""

    class Status(models.TextChoices):
        NEW = "new", "New"
        CONTACTED = "contacted", "Contacted"
        ONBOARDED = "onboarded", "Onboarded"
        CLOSED = "closed", "Closed"

    school_name = models.CharField(max_length=120)
    contact_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=16)
    email = models.EmailField(blank=True)
    town = models.CharField(max_length=80)
    message = models.TextField(max_length=1000, blank=True)
    data_consent = models.BooleanField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.NEW)
    staff_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.school_name} ({self.town})"
