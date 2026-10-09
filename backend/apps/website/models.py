from django.db import models
from django.utils import timezone

from apps.consent.models import FORMAT_HELP
from apps.core.models import ImageRenditionsMixin


class SiteSettings(models.Model):
    """Whether the public website is live. There is exactly one row (pk=1)."""

    is_live = models.BooleanField(default=False)
    went_live_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = verbose_name_plural = "site settings"

    def __str__(self) -> str:
        return "Live" if self.is_live else "Preview"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> SiteSettings:
        settings_row, _ = cls.objects.get_or_create(pk=1)
        return settings_row


class ContentBlock(models.Model):
    """One editable piece of website text, looked up by key."""

    key = models.SlugField(max_length=60, unique=True)
    text = models.TextField(help_text=FORMAT_HELP)
    help_text = models.CharField(max_length=200, blank=True)
    needs_review = models.BooleanField(
        default=True,
        help_text="Ticked while the text is provisional. The site stays in preview until "
        "every block is reviewed.",
    )

    class Meta:
        ordering = ["key"]

    def __str__(self) -> str:
        return self.key


class PhotoSlot(ImageRenditionsMixin):
    key = models.SlugField(max_length=40, unique=True)
    image = models.ImageField(upload_to="site/photos/")
    alt_text = models.CharField(max_length=200)
    caption = models.CharField(max_length=120, blank=True)
    is_placeholder = models.BooleanField(
        default=True, help_text="Ticked while this is not a real AD Smart School photo."
    )
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "key"]

    def __str__(self) -> str:
        return self.key


class Fact(models.Model):
    YEARS_TOKEN = "{years}"

    label = models.CharField(max_length=80)
    value = models.CharField(max_length=40, help_text="Use {years} for years since founding.")
    order = models.PositiveSmallIntegerField(default=0)
    visible = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return f"{self.value} {self.label}"

    def display_value(self, years: int) -> str:
        return self.value.replace(self.YEARS_TOKEN, str(years))


class FeatureBlock(models.Model):
    """A "For parents" promise. Off by default: switch on only once the feature is live."""

    class Icon(models.TextChoices):
        MESSAGE = "message", "Message"
        PHONE = "phone", "Phone"
        CARE = "care", "Care"
        SHIELD = "shield", "Shield"

    key = models.SlugField(max_length=40, unique=True)
    title = models.CharField(max_length=80)
    text = models.CharField(max_length=240)
    icon = models.CharField(max_length=20, choices=Icon.choices)
    enabled = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "key"]

    def __str__(self) -> str:
        return self.title


class NewsPostQuerySet(models.QuerySet):
    def published(self):
        return self.filter(status=NewsPost.Status.PUBLISHED, published_at__lte=timezone.now())


class NewsPost(ImageRenditionsMixin):
    rendition_source_field = "cover"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"

    title = models.CharField(max_length=160)
    slug = models.SlugField(max_length=170, unique=True)
    summary = models.CharField(max_length=240)
    body = models.TextField(help_text=FORMAT_HELP)
    cover = models.ImageField(upload_to="site/news/", blank=True)
    cover_alt = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)

    objects = NewsPostQuerySet.as_manager()

    class Meta:
        ordering = ["-published_at", "-id"]

    def __str__(self) -> str:
        return self.title
