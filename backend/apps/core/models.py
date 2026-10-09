from django.db import models

from apps.core.images import build_renditions


class ImageRenditionsMixin(models.Model):
    """Keeps WebP renditions of one image field in step with that field.

    Renditions are rebuilt whenever the stored file changes and cleared when the
    file is removed. Set ``rendition_source_field`` to the image field's name.
    """

    rendition_source_field = "image"
    renditions = models.JSONField(default=list, blank=True, editable=False)

    class Meta:
        abstract = True

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._rendered_name = self._source_name()

    def save(self, *args, **kwargs):
        name_before_save = self._source_name()
        changed = bool(name_before_save) and (
            self._state.adding or name_before_save != self._rendered_name
        )
        cleared = not name_before_save and bool(self._rendered_name)
        super().save(*args, **kwargs)
        if changed or cleared:
            self.renditions = build_renditions(self._source_name()) if changed else []
            type(self).objects.filter(pk=self.pk).update(renditions=self.renditions)
        self._rendered_name = self._source_name()

    def _source_name(self) -> str | None:
        field_file = getattr(self, self.rendition_source_field)
        return field_file.name if field_file else None
