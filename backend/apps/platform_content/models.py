from django.core.exceptions import ValidationError
from django.db import models

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
