from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.core.models import ImageRenditionsMixin

PEOPLE_PERMISSION = (
    "Tick that you have permission to publish everyone in this photo before showing it."
)


class GalleryPhotoQuerySet(models.QuerySet):
    def public(self):
        return self.filter(visible=True).exclude(shows_people=True, people_permission=False)


class GalleryPhoto(ImageRenditionsMixin):
    """A photo in the gallery on the owner's website (business tools spec §5.2)."""

    image = models.ImageField(upload_to="platform/gallery/")
    alt_text = models.CharField(max_length=200, help_text="Describes the photo for blind visitors.")
    caption = models.CharField(max_length=160, blank=True)
    shows_people = models.BooleanField(default=False)
    people_permission = models.BooleanField(
        default=False,
        help_text="Everyone shown, and the parents of any children, agreed to publication.",
    )
    visible = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = GalleryPhotoQuerySet.as_manager()

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.alt_text

    def clean(self):
        if self.visible and self.shows_people and not self.people_permission:
            raise ValidationError({"people_permission": PEOPLE_PERMISSION})


ARTICLE_FORMAT_HELP = (
    "Separate paragraphs with a blank line. Start a line with '## ' for a heading, '- ' for a "
    "list item or '> ' for a quote. Write **bold**, [link text](https://…) and "
    "![photo description](/media/…)."
)


class ArticleQuerySet(models.QuerySet):
    def public(self):
        return self.filter(
            status=Article.Status.PUBLISHED, publish_at__lte=timezone.now()
        ).order_by("-publish_at", "-id")


class Article(ImageRenditionsMixin):
    """News about the platform, or a tip for running and growing a school (business tools
    spec §5.3). A published article with a future ``publish_at`` is scheduled."""

    class Kind(models.TextChoices):
        NEWS = "news", "News"
        TIP = "tip", "Tips for schools"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"

    rendition_source_field = "cover"

    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.TIP)
    title = models.CharField(max_length=160)
    slug = models.SlugField(max_length=170, unique=True)
    summary = models.CharField(max_length=240, blank=True)
    body = models.TextField(blank=True, help_text=ARTICLE_FORMAT_HELP)
    cover = models.ImageField(upload_to="platform/articles/", blank=True)
    cover_alt = models.CharField(max_length=200, blank=True)
    author_name = models.CharField(max_length=80, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    publish_at = models.DateTimeField(
        null=True, blank=True, help_text="Empty until first published; the address is then fixed."
    )
    email_subscribers = models.BooleanField(default=False)
    emailed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = ArticleQuerySet.as_manager()

    class Meta:
        ordering = ["-updated_at", "-id"]

    def __str__(self):
        return self.title

    @property
    def state(self) -> str:
        if self.status == self.Status.DRAFT:
            return "draft"
        return "scheduled" if self.publish_at and self.publish_at > timezone.now() else "published"


class ArticleImage(ImageRenditionsMixin):
    """A photo placed inside an article's text."""

    image = models.ImageField(upload_to="platform/articles/photos/")
    alt_text = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)


class TipSubscriberQuerySet(models.QuerySet):
    def subscribed(self):
        return self.filter(confirmed_at__isnull=False, unsubscribed_at__isnull=True)


class TipSubscriber(models.Model):
    """Someone who asked for new tips by email (business tools spec §5.6): confirmed by a link
    before any tips are sent, and able to leave with one click."""

    email = models.EmailField(unique=True)
    consent_at = models.DateTimeField()
    confirmed_at = models.DateTimeField(null=True, blank=True)
    unsubscribed_at = models.DateTimeField(null=True, blank=True)
    last_emailed_at = models.DateTimeField(
        null=True, blank=True, help_text="The last confirmation email: at most one an hour."
    )
    created_at = models.DateTimeField(auto_now_add=True)

    objects = TipSubscriberQuerySet.as_manager()

    def __str__(self):
        return self.email


WORDS_PERMISSION = (
    "Tick that this person agreed to have their words and name published before showing it."
)


class TestimonialQuerySet(models.QuerySet):
    def public(self):
        return self.filter(visible=True, permission=True)


class Testimonial(ImageRenditionsMixin):
    """What a school says about the platform (business tools spec §5.5)."""

    rendition_source_field = "photo"

    quote = models.CharField(max_length=600)
    person_name = models.CharField(max_length=80)
    person_role = models.CharField(max_length=80, blank=True)
    school_name = models.CharField(max_length=120, blank=True)
    school = models.ForeignKey(
        "school.School",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        help_text="Links the comment to the school's website while that site is public.",
    )
    photo = models.ImageField(upload_to="platform/testimonials/", blank=True)
    permission = models.BooleanField(
        default=False, help_text="The person agreed to have their words and name published."
    )
    visible = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = TestimonialQuerySet.as_manager()

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.person_name

    def clean(self):
        if self.visible and not self.permission:
            raise ValidationError({"permission": WORDS_PERMISSION})


class FaqItem(models.Model):
    """A question and answer on the owner's website (business tools spec §5.5)."""

    question = models.CharField(max_length=200)
    answer = models.TextField(help_text=ARTICLE_FORMAT_HELP)
    visible = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.question


class PlatformSettings(models.Model):
    """Settings for the owner's website. One row (pk 1)."""

    whatsapp_channel_url = models.URLField(
        blank=True, help_text="Your WhatsApp Channel's link, e.g. https://whatsapp.com/channel/…"
    )

    class Meta:
        verbose_name_plural = "platform settings"

    def __str__(self):
        return "Platform settings"

    @classmethod
    def load(cls) -> PlatformSettings:
        return cls.objects.get_or_create(pk=1)[0]


class PageVisit(models.Model):
    """How many times a page of the owner's website was opened on a day (business tools spec
    §4). Only the page and the day: no cookies, addresses or browser details."""

    day = models.DateField()
    path = models.CharField(max_length=200)
    count = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["day", "path"], name="one_count_per_page_per_day")
        ]

    def __str__(self):
        return f"{self.day} {self.path}: {self.count}"
