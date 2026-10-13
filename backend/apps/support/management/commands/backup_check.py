"""Counts the records that matter and totals the money, so a restored backup can be compared with
the live database (see docs/guides/backup-and-restore.md).

    python manage.py backup_check > before.json
    python manage.py backup_check --compare before.json   # on the restored copy
"""

import json

from django.apps import apps
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Sum

MODELS = (
    "school.school",
    "accounts.user",
    "people.student",
    "people.parent",
    "people.staff",
    "people.guardianship",
    "people.enrolment",
    "finance.invoice",
    "finance.payment",
    "finance.ledgerentry",
    "learning.mark",
    "learning.studentattendance",
    "billing.platformbill",
    "billing.billpayment",
    "audit.auditlog",
)


def snapshot() -> dict:
    counts = {label: apps.get_model(label).objects.count() for label in MODELS}
    ledger = (
        apps.get_model("finance.ledgerentry").objects.aggregate(total=Sum("amount"))["total"] or 0
    )
    paid = apps.get_model("finance.payment").objects.aggregate(total=Sum("amount"))["total"] or 0
    return {"counts": counts, "ledger_sum": ledger, "payments_sum": paid}


class Command(BaseCommand):
    help = "Print record counts and money totals, or compare them with an earlier snapshot."

    def add_arguments(self, parser):
        parser.add_argument("--compare", help="A JSON file written by an earlier run")

    def handle(self, *args, **options):
        now = snapshot()
        if not options["compare"]:
            self.stdout.write(json.dumps(now, indent=2))
            return
        with open(options["compare"], encoding="utf-8") as saved:
            before = json.load(saved)
        differences = [
            f"{label}: {before['counts'].get(label)} then, {count} now"
            for label, count in now["counts"].items()
            if before["counts"].get(label) != count
        ]
        for key in ("ledger_sum", "payments_sum"):
            if before.get(key) != now[key]:
                differences.append(f"{key}: {before.get(key)} then, {now[key]} now")
        if differences:
            raise CommandError("The copies differ:\n" + "\n".join(differences))
        self.stdout.write(
            self.style.SUCCESS("The restored copy matches: same records and the same money totals.")
        )
