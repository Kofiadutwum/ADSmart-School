"""Pupils, parents and staff of one school (Phase 1 spec §3.2, amendment §3.2).

Linked records always share a school: each save takes the school from what it links and
refuses to join two schools (apps.school.models.same_school).
"""

import uuid
from pathlib import Path

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.school.models import SchoolOwned, same_school


def photo_upload_to(instance, filename: str) -> str:
    """Filed by school under a random name, so a file name never carries a person's name."""
    folder = type(instance).__name__.lower()
    suffix = Path(filename).suffix.lower()
    return f"schools/{instance.school_id}/{folder}/{uuid.uuid4().hex}{suffix}"


class StudentIdCounter(SchoolOwned):
    """The last sequence number used for one admission year (Phase 1 spec §3.3)."""

    year = models.PositiveSmallIntegerField()
    last = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["school", "year"], name="people_one_counter")
        ]

    def __str__(self):
        return f"{self.year}: {self.last}"


class Gender(models.TextChoices):
    FEMALE = "F", "Female"
    MALE = "M", "Male"


class Student(SchoolOwned):
    """Never deleted: leaving is a status with a reason (services.change_student_status)."""

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        TRANSFERRED = "TRANSFERRED", "Transferred"
        COMPLETED = "COMPLETED", "Completed"
        WITHDRAWN = "WITHDRAWN", "Withdrawn"
        SUSPENDED = "SUSPENDED", "Suspended"

    student_id = models.CharField(max_length=7, editable=False)
    first_name = models.CharField(max_length=60)
    middle_name = models.CharField(max_length=60, blank=True)
    surname = models.CharField(max_length=60)
    date_of_birth = models.DateField()
    gender = models.CharField(max_length=1, choices=Gender.choices)
    photo = models.ImageField(upload_to=photo_upload_to, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
    admission_date = models.DateField()
    previous_school = models.CharField(max_length=120, blank=True)
    address = models.CharField(max_length=200, blank=True)
    pickup_point = models.CharField(max_length=120, blank=True, help_text="For the school bus")
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="student_profile",
        help_text="Pupils from Basic 4 sign in with their Student ID",
    )
    is_demo = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["surname", "first_name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "student_id"], name="people_student_id")
        ]

    def __str__(self):
        return self.full_name

    def save(self, *args, **kwargs):
        if self.user_id:
            same_school(self, self.user)
        super().save(*args, **kwargs)

    @property
    def full_name(self) -> str:
        return " ".join(part for part in (self.first_name, self.middle_name, self.surname) if part)


class EmergencyContact(SchoolOwned):
    """At least two are expected; fewer shows an Incomplete warning (Phase 1 spec §3.2)."""

    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="emergency_contacts"
    )
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=16)
    relationship = models.CharField(max_length=40)
    priority = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ["priority"]
        constraints = [
            models.UniqueConstraint(fields=["student", "priority"], name="people_contact_priority")
        ]

    def __str__(self):
        return f"{self.name} ({self.relationship})"

    def save(self, *args, **kwargs):
        self.school_id = same_school(self.student)
        super().save(*args, **kwargs)


class Parent(SchoolOwned):
    """Made at admission; the account waits for the parent to activate it (Phase 1 spec §5.2)."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="parent_profile"
    )
    title = models.CharField(max_length=10, blank=True)
    first_name = models.CharField(max_length=60)
    surname = models.CharField(max_length=60)
    phone = models.CharField(max_length=16, help_text="Also the parent's sign-in")
    alt_phone = models.CharField(max_length=16, blank=True)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=200, blank=True)
    is_demo = models.BooleanField(default=False)

    class Meta:
        ordering = ["surname", "first_name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "phone"], name="people_parent_phone")
        ]

    def __str__(self):
        return f"{self.first_name} {self.surname}"

    def save(self, *args, **kwargs):
        self.school_id = same_school(self.user)
        super().save(*args, **kwargs)


class Guardianship(SchoolOwned):
    """Siblings are pupils who share a parent."""

    class Relationship(models.TextChoices):
        MOTHER = "MOTHER", "Mother"
        FATHER = "FATHER", "Father"
        GUARDIAN = "GUARDIAN", "Guardian"
        OTHER = "OTHER", "Other"

    parent = models.ForeignKey(Parent, on_delete=models.CASCADE, related_name="guardianships")
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="guardianships")
    relationship = models.CharField(max_length=10, choices=Relationship.choices)
    is_payer = models.BooleanField(default=False)
    is_primary_contact = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["parent", "student"], name="people_one_guardianship")
        ]

    def __str__(self):
        return f"{self.parent} → {self.student}"

    def save(self, *args, **kwargs):
        self.school_id = same_school(self.parent, self.student)
        super().save(*args, **kwargs)


class PickupPerson(SchoolOwned):
    """Someone allowed to collect a pupil. Gate checks arrive in Phase 5."""

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="pickup_people")
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=16)
    photo = models.ImageField(upload_to=photo_upload_to, blank=True)
    relationship = models.CharField(max_length=40)
    valid_from = models.DateField()
    valid_to = models.DateField(null=True, blank=True)
    is_demo = models.BooleanField(default=False)

    class Meta:
        verbose_name_plural = "pick-up people"

    def __str__(self):
        return f"{self.name} for {self.student}"

    def save(self, *args, **kwargs):
        self.school_id = same_school(self.student)
        super().save(*args, **kwargs)


class Staff(SchoolOwned):
    """Roles live on the user (Phase 1 spec §4)."""

    class EmploymentStatus(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        ON_LEAVE = "ON_LEAVE", "On leave"
        LEFT = "LEFT", "Left the school"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="staff_profile"
    )
    staff_number = models.CharField(max_length=20, blank=True)
    first_name = models.CharField(max_length=60)
    surname = models.CharField(max_length=60)
    phone = models.CharField(max_length=16, blank=True)
    email = models.EmailField(blank=True)
    qualifications = models.TextField(blank=True)
    licence_number = models.CharField(max_length=40, blank=True, help_text="Teaching licence")
    emergency_contact = models.CharField(max_length=120, blank=True, help_text="Name and phone")
    employment_status = models.CharField(
        max_length=10, choices=EmploymentStatus.choices, default=EmploymentStatus.ACTIVE
    )
    is_demo = models.BooleanField(default=False)

    class Meta:
        verbose_name_plural = "staff"
        ordering = ["surname", "first_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["school", "staff_number"],
                condition=~Q(staff_number=""),
                name="people_staff_number",
            )
        ]

    def __str__(self):
        return f"{self.first_name} {self.surname}"

    def save(self, *args, **kwargs):
        self.school_id = same_school(self.user)
        super().save(*args, **kwargs)


class Enrolment(SchoolOwned):
    """A pupil's place in a class for one school year. History is never overwritten."""

    class Outcome(models.TextChoices):
        PROMOTED = "PROMOTED", "Promoted"
        REPEATED = "REPEATED", "Repeated the year"
        LEFT = "LEFT", "Left the school"

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="enrolments")
    school_class = models.ForeignKey(
        "academics.SchoolClass", on_delete=models.PROTECT, related_name="enrolments"
    )
    academic_year = models.ForeignKey(
        "academics.AcademicYear", on_delete=models.PROTECT, related_name="+"
    )
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    outcome = models.CharField(max_length=10, choices=Outcome.choices, blank=True)

    class Meta:
        ordering = ["-start_date"]
        constraints = [
            models.UniqueConstraint(
                fields=["student", "academic_year"],
                condition=Q(end_date__isnull=True),
                name="people_one_open_enrolment",
            )
        ]

    def __str__(self):
        return f"{self.student} in {self.school_class}"

    def save(self, *args, **kwargs):
        self.school_id = same_school(self.student, self.school_class)
        self.academic_year_id = self.school_class.academic_year_id
        super().save(*args, **kwargs)
