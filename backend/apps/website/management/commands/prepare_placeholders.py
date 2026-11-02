import logging

from django.core.management.base import BaseCommand

from apps.website.provisioning import prepare_placeholders

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Upload the shared placeholder photos once, so adding a school is quick."

    def handle(self, *args, **options):
        try:
            prepare_placeholders()
        except Exception:  # never stop the server starting; adding a school retries the upload
            logger.exception("Could not prepare the placeholder photos")
