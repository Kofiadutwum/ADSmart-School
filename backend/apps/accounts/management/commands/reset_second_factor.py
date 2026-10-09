from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import User
from apps.accounts.second_factor import reset_second_factor


class Command(BaseCommand):
    help = (
        "Remove a user's authenticator app and backup codes; they set up a new one at their "
        "next sign-in. Use it when a school's only Administrator, or platform staff, lose "
        "their phone (Phase 1 spec §5.3)."
    )

    def add_arguments(self, parser):
        parser.add_argument("login")
        parser.add_argument(
            "--school", default="", help="The school's slug; omit for platform staff"
        )

    def handle(self, *args, login, school, **options):
        users = User.objects.filter(login__iexact=login.strip())
        users = users.filter(school__slug=school) if school else users.filter(school__isnull=True)
        user = users.first()
        if user is None:
            raise CommandError(f"No user called {login} there.")
        reset_second_factor(user, reason="Reset with manage.py reset_second_factor")
        self.stdout.write(self.style.SUCCESS(f"Second factor reset for {user.login}."))
