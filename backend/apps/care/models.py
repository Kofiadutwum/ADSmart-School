"""Care and safety (SMS spec §6, §11A, §15, §27, §37): early-years daily reports, pick-up control,
the gate and visitor log, medical records, the sickbay, incidents, discipline and special needs.
Medical, incident, discipline and special-needs records are restricted and every view is logged."""

from django.conf import settings
from django.db import models

from apps.school.models import SchoolOwned

USER = settings.AUTH_USER_MODEL


class DailyCare(SchoolOwned):
    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="daily_care")
    date = models.DateField()
    arrival = models.TimeField(null=True, blank=True)
    departure = models.TimeField(null=True, blank=True)
    meals = models.CharField(max_length=300, blank=True)
    ate_well = models.BooleanField(null=True)
    sleep = models.CharField(max_length=120, blank=True)
    toilet = models.CharField(max_length=120, blank=True)
    mood = models.CharField(max_length=60, blank=True)
    activities = models.CharField(max_length=500, blank=True)
    incident = models.CharField(max_length=500, blank=True)
    staff_signed = models.BooleanField(default=False)
    supplies_needed = models.CharField(max_length=200, blank=True)
    recorded_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-date"]
        constraints = [models.UniqueConstraint(fields=["student", "date"], name="care_one_report_a_day")]

    def __str__(self):
        return f"Daily care for {self.student}, {self.date}"


class CareNote(SchoolOwned):
    """The two-way note between parent and carers; the class teacher approves parents' notes."""

    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="+")
    author = models.ForeignKey(USER, on_delete=models.PROTECT, related_name="+")
    from_parent = models.BooleanField(default=False)
    text = models.CharField(max_length=500)
    approved = models.BooleanField(default=False)
    approved_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Note about {self.student}"


class OneTimeApproval(SchoolOwned):
    """A parent allows someone not on the list to collect their child on one day."""

    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="+")
    date = models.DateField()
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=16, blank=True)
    approved_by = models.ForeignKey(USER, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} may collect {self.student} on {self.date}"


class Release(SchoolOwned):
    class Status(models.TextChoices):
        RELEASED = "RELEASED", "Released"
        BLOCKED = "BLOCKED", "Blocked"

    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="releases")
    at = models.DateTimeField(auto_now_add=True)
    collector_name = models.CharField(max_length=120)
    pickup_person = models.ForeignKey("people.PickupPerson", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    approval = models.ForeignKey(OneTimeApproval, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    status = models.CharField(max_length=8, choices=Status.choices)
    released_by = models.ForeignKey(USER, on_delete=models.PROTECT, related_name="+")
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-at"]

    def __str__(self):
        return f"{self.student} {self.get_status_display().lower()} to {self.collector_name}"


class Visitor(SchoolOwned):
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=16, blank=True)
    purpose = models.CharField(max_length=200)
    host = models.CharField(max_length=120, blank=True)
    time_in = models.DateTimeField(auto_now_add=True)
    time_out = models.DateTimeField(null=True, blank=True)
    recorded_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-time_in"]

    def __str__(self):
        return f"{self.name} ({self.purpose})"


class GateEvent(SchoolOwned):
    class Kind(models.TextChoices):
        LATE_ARRIVAL = "LATE_ARRIVAL", "Late arrival"
        EARLY_DEPARTURE = "EARLY_DEPARTURE", "Early departure"

    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="+")
    kind = models.CharField(max_length=15, choices=Kind.choices)
    at = models.DateTimeField(auto_now_add=True)
    reason = models.CharField(max_length=200, blank=True)
    recorded_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-at"]

    def __str__(self):
        return f"{self.student}: {self.get_kind_display()}"


class MedicalRecord(SchoolOwned):
    student = models.OneToOneField("people.Student", on_delete=models.CASCADE, related_name="medical")
    allergies = models.CharField(max_length=300, blank=True)
    conditions = models.CharField(max_length=300, blank=True)
    medication = models.CharField(max_length=300, blank=True)
    clinic = models.CharField(max_length=120, blank=True)
    clinic_phone = models.CharField(max_length=16, blank=True)
    notes = models.TextField(max_length=2000, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Medical record for {self.student}"


class SickbayVisit(SchoolOwned):
    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="+")
    time_in = models.DateTimeField(auto_now_add=True)
    complaint = models.CharField(max_length=300)
    action = models.CharField(max_length=300, blank=True)
    time_out = models.DateTimeField(null=True, blank=True)
    parent_informed = models.BooleanField(default=False)
    recorded_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-time_in"]

    def __str__(self):
        return f"{self.student}: {self.complaint[:40]}"


class IncidentLog(SchoolOwned):
    class Kind(models.TextChoices):
        INCIDENT = "INCIDENT", "Incident or injury"
        DISCIPLINE = "DISCIPLINE", "Discipline"
        SAFEGUARDING = "SAFEGUARDING", "Safeguarding concern"

    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="+")
    date = models.DateField()
    kind = models.CharField(max_length=12, choices=Kind.choices)
    description = models.TextField(max_length=2000)
    action_taken = models.CharField(max_length=500, blank=True)
    parent_informed = models.BooleanField(default=False)
    recorded_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.get_kind_display()}: {self.student}"


class SpecialNeed(SchoolOwned):
    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="+")
    need = models.CharField(max_length=200)
    support_plan = models.TextField(max_length=2000, blank=True)
    recorded_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    def __str__(self):
        return f"{self.student}: {self.need}"
