from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from apps.school.models import LEVEL_CODES
from apps.website.provisioning import create_school


class Command(BaseCommand):
    help = "Create a school with its placeholder website, in preview (amendment §5)."

    def add_arguments(self, parser):
        parser.add_argument("--slug", required=True, help="Web address: <slug>.<platform domain>")
        parser.add_argument("--name", required=True)
        parser.add_argument("--town", required=True)
        parser.add_argument("--region", required=True)
        parser.add_argument("--phone", required=True)
        parser.add_argument("--email", required=True)
        parser.add_argument("--founded", type=int, default=None, help="Year the school opened")
        parser.add_argument(
            "--levels",
            default=",".join(LEVEL_CODES),
            help=f"Comma-separated, from: {', '.join(LEVEL_CODES)}",
        )

    def handle(self, *args, slug, name, town, region, phone, email, founded, levels, **options):
        try:
            school = create_school(
                slug=slug,
                name=name,
                town=town,
                region=region,
                phone=phone,
                email=email,
                founded_year=founded,
                levels_offered=[code.strip() for code in levels.split(",") if code.strip()],
            )
        except ValidationError as exc:
            problems = "; ".join(
                f"{field}: {' '.join(messages)}" for field, messages in exc.message_dict.items()
            )
            raise CommandError(problems) from exc
        self.stdout.write(
            self.style.SUCCESS(f"Created {school.name} at {school.base_url()} (in preview).")
        )
