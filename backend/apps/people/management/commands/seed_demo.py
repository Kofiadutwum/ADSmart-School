from django.core.management.base import BaseCommand, CommandError

from apps.people.seeding import seed_demo
from apps.school.models import School


class Command(BaseCommand):
    help = (
        "Fill a school with a realistic demo school (Phase 1 spec §9): a school year, classes, "
        "pupils, families and staff. Every person is marked DEMO and is never texted."
    )

    def add_arguments(self, parser):
        parser.add_argument("--school", required=True, help="The school's slug")
        parser.add_argument("--pupils", type=int, default=250)
        parser.add_argument("--seed", type=int, default=1, help="Change it for different names")

    def handle(self, *args, school, pupils, seed, **options):
        owner = School.objects.filter(slug=school).first()
        if owner is None:
            raise CommandError(f"No school has the slug {school}.")
        try:
            result = seed_demo(owner, pupils=pupils, seed=seed)
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        made = ", ".join(f"{count} {name}" for name, count in result.counts.items())
        self.stdout.write(self.style.SUCCESS(f"Demo records added to {owner.name}: {made}."))
        if result.logins:
            self.stdout.write(
                f"Demo sign-ins (development only). The password for each is {result.password}"
            )
            for role, login in result.logins:
                self.stdout.write(f"  {role}: {login}")
