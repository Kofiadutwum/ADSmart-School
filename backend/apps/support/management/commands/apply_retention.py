"""Removes the personal details of pupils who left longer ago than their school keeps records
(SMS spec §30). Without --apply it only reports what it would do.

Money and audit records stay (the ledger can't be changed), so a pupil is anonymised, not
deleted: their name becomes "Former pupil" and their contacts, pick-up people, photo, medical and
special-needs records are removed.

Ruling: staff records are not yet included, because no leaving date is recorded for staff.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.care.models import MedicalRecord, SpecialNeed
from apps.people.models import EmergencyContact, PickupPerson, Student
from apps.school.models import School
from apps.support.models import RetentionRule

LEFT = (Student.Status.TRANSFERRED, Student.Status.COMPLETED, Student.Status.WITHDRAWN)


def due_for_removal(school: School):
    rule = RetentionRule.objects.filter(school=school).first()
    years = rule.left_pupil_years if rule else 7
    cutoff = timezone.localdate() - timedelta(days=365 * years)
    return (
        Student.objects.for_school(school)
        .filter(status__in=LEFT)
        .exclude(first_name="Former", surname="pupil")
        .annotate(left_on=Max("enrolments__end_date"))
        .filter(left_on__lt=cutoff)
    )


@transaction.atomic
def anonymise(pupil: Student) -> None:
    if pupil.photo:
        pupil.photo.delete(save=False)
    EmergencyContact.objects.filter(student=pupil).delete()
    PickupPerson.objects.filter(student=pupil).delete()
    MedicalRecord.objects.filter(student=pupil).delete()
    SpecialNeed.objects.filter(student=pupil).delete()
    pupil.first_name, pupil.middle_name, pupil.surname = "Former", "", "pupil"
    pupil.address, pupil.previous_school, pupil.pickup_point = "", "", ""
    pupil.save()
    record(
        AuditLog.Action.UPDATED,
        actor=None,
        entity=pupil,
        new={"retention": "anonymised"},
        school=pupil.school,
    )


class Command(BaseCommand):
    help = (
        "Report (or with --apply, anonymise) pupils kept longer than their school's retention rule."
    )

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Make the changes")

    def handle(self, *args, **options):
        total = 0
        for school in School.objects.order_by("name"):
            pupils = list(due_for_removal(school))
            if not pupils:
                continue
            total += len(pupils)
            self.stdout.write(
                f"{school.name}: {len(pupils)} former pupils past the retention period"
            )
            if options["apply"]:
                for pupil in pupils:
                    anonymise(pupil)
        verb = "Anonymised" if options["apply"] else "Would anonymise"
        self.stdout.write(self.style.SUCCESS(f"{verb} {total} former pupils."))
