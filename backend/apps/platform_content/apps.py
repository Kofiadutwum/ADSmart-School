from django.apps import AppConfig


class PlatformContentConfig(AppConfig):
    """The owner's own website: gallery, articles, comments, questions and tips (business tools
    spec §5)."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.platform_content"
    verbose_name = "Platform website content"
