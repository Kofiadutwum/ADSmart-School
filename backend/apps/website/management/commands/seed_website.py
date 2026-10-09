from django.core.management.base import BaseCommand

from apps.website.seeding import seed_website


class Command(BaseCommand):
    help = "Create the default website content. Existing rows are never changed."

    def handle(self, *args, **options):
        created = seed_website()
        self.stdout.write(self.style.SUCCESS(f"Website seed complete: {created} new item(s)."))
