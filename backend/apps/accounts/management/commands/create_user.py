from getpass import getpass

from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.db import transaction

from apps.accounts import roles
from apps.accounts.identifiers import normalise_identifier
from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.phones import normalise_gh_phone
from apps.school.models import School

DEFAULT_ROLE = {
    User.Kind.PARENT: roles.PARENT,
    User.Kind.STUDENT: roles.STUDENT,
    User.Kind.PLATFORM: roles.PLATFORM_OWNER,
}


class Command(BaseCommand):
    help = (
        "Create a user account: a school's first Administrator, or platform staff. Parents "
        "are left awaiting activation by SMS code unless a password is given."
    )

    def add_arguments(self, parser):
        parser.add_argument("--kind", required=True, choices=[kind.value for kind in User.Kind])
        parser.add_argument(
            "--school", default="", help="The school's slug (not for platform staff)"
        )
        parser.add_argument(
            "--username", required=True, help="Username, parent phone or Student ID"
        )
        parser.add_argument("--name", default="", help="Name shown on screens")
        parser.add_argument("--role", action="append", default=[], choices=roles.ALL_ROLES)
        parser.add_argument("--password", default=None, help="Omit to be asked for it")
        parser.add_argument("--phone", default="", help="Mobile for sign-in codes by SMS")
        parser.add_argument("--email", default="", help="Address for sign-in codes by email")

    @transaction.atomic
    def handle(self, *args, kind, school, username, name, role, password, phone, email, **options):
        owner = None
        allowed = roles.PLATFORM_ROLES if kind == User.Kind.PLATFORM else roles.SCHOOL_ROLES
        if not set(role) <= set(allowed):
            raise CommandError(
                "Platform staff take team roles (Platform Owner, Finance, Content or Support)."
                if kind == User.Kind.PLATFORM
                else "School accounts take school roles, not team roles."
            )
        if kind == User.Kind.PLATFORM:
            if school:
                raise CommandError("Platform staff belong to no school: leave out --school.")
        else:
            if not school:
                raise CommandError("Give the school's slug with --school.")
            owner = School.objects.filter(slug=school).first()
            if owner is None:
                raise CommandError(f"No school has the slug {school}.")
        try:
            identifier = normalise_identifier(kind, username)
            phone = normalise_gh_phone(phone) if phone else ""
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        if kind == User.Kind.PARENT:
            phone = identifier
        if email:
            try:
                validate_email(email)
            except ValidationError as exc:
                raise CommandError("Enter a valid email address.") from exc
        needs_code = kind == User.Kind.PLATFORM or bool(set(role) & roles.SECOND_FACTOR_ROLES)
        if needs_code and not (phone or email):
            raise CommandError(
                "This account confirms each sign-in with a code: give --phone or --email."
            )
        if User.objects.filter(school=owner, login=identifier).exists():
            raise CommandError(f"A user called {identifier} already exists there.")

        user = User(
            login=identifier, school=owner, kind=kind, display_name=name, phone=phone, email=email
        )
        user.must_change_password = kind == User.Kind.STUDENT
        if password is None and kind != User.Kind.PARENT:
            password = getpass("Password: ")
            if getpass("Password again: ") != password:
                raise CommandError("The passwords did not match.")
        if password is not None:
            try:
                validate_password(password, user)
            except ValidationError as exc:
                raise CommandError(" ".join(exc.messages)) from exc
        user.set_password(password)
        user.save()

        names = set(role)
        if kind in DEFAULT_ROLE and not (kind == User.Kind.PLATFORM and names):
            names.add(DEFAULT_ROLE[kind])  # a team member given a role gets only that role
        user.groups.set(Group.objects.filter(name__in=names))
        record(
            AuditLog.Action.USER_CREATED,
            entity=user,
            new={"kind": kind, "roles": sorted(names)},
            reason="Created with manage.py create_user",
        )
        where = owner.name if owner else "the platform"
        self.stdout.write(self.style.SUCCESS(f"Created {kind} {identifier} at {where}."))
