from django.core.management.base import BaseCommand

from apps.platform_content.articles import email_due_articles


class Command(BaseCommand):
    help = (
        "Email tip subscribers about articles that have gone live since the last run. Schedule "
        "it every few minutes (business tools spec §5.3)."
    )

    def handle(self, *args, **options):
        self.stdout.write(f"Sent {email_due_articles()} email(s).")
