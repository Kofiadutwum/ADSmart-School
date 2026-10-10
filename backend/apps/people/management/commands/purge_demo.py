from django.core.management.base import BaseCommand, CommandError

from apps.people.purge import DemoReferencesError, demo_counts, purge_demo
from apps.school.models import School


class Command(BaseCommand):
    help = (
        "Delete a school's demo records and demo accounts (Phase 1 spec §9). Real records stay, "
        "and nothing is deleted while a real record still points at a demo one."
    )

    def add_arguments(self, parser):
        parser.add_argument("--school", required=True, help="The school's slug")
        parser.add_argument(
            "--yes", action="store_true", help="Delete them. Without it, only report what would go."
        )

    def handle(self, *args, school, yes, **options):
        owner = School.objects.filter(slug=school).first()
        if owner is None:
            raise CommandError(f"No school has the slug {school}.")
        summary = ", ".join(f"{count} {name}" for name, count in demo_counts(owner).items())
        if not yes:
            self.stdout.write(f"Would delete {summary}. Run again with --yes to delete them.")
            return
        try:
            purge_demo(owner)
        except DemoReferencesError as exc:
            problems = "\n".join(f"- {problem}" for problem in exc.problems)
            raise CommandError(f"Real records still point at demo ones:\n{problems}") from exc
        self.stdout.write(self.style.SUCCESS(f"Deleted {summary}."))
