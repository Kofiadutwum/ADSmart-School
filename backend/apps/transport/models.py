"""School buses (SMS spec §15): buses, crew, routes with pick-up points, which pupils ride,
pick-up point changes confirmed by the parent, and the boarding log."""

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.school.models import SchoolOwned


class Crew(SchoolOwned):
    class Role(models.TextChoices):
        DRIVER = "DRIVER", "Driver"
        ATTENDANT = "ATTENDANT", "Bus attendant"

    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=16)
    role = models.CharField(max_length=9, choices=Role.choices)
    licence_number = models.CharField(max_length=40, blank=True)
    licence_expiry = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "crew"

    def __str__(self):
        return f"{self.name} ({self.get_role_display()})"


class Bus(SchoolOwned):
    name = models.CharField(max_length=60)
    plate = models.CharField(max_length=20)
    capacity = models.PositiveSmallIntegerField(default=30)
    insurance_expiry = models.DateField(null=True, blank=True)
    driver = models.ForeignKey(Crew, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    attendant = models.ForeignKey(Crew, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "buses"

    def __str__(self):
        return f"{self.name} ({self.plate})"


class Route(SchoolOwned):
    name = models.CharField(max_length=80)
    bus = models.ForeignKey(Bus, null=True, blank=True, on_delete=models.SET_NULL, related_name="routes")
    daily_fee = models.PositiveIntegerField(default=0, help_text="Pesewas a day, added to the daily list")

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Stop(SchoolOwned):
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name="stops")
    name = models.CharField(max_length=120)
    order = models.PositiveSmallIntegerField(default=0)
    pickup_time = models.TimeField(null=True, blank=True)

    class Meta:
        ordering = ["route", "order"]

    def __str__(self):
        return f"{self.name} ({self.route})"


class BusAssignment(SchoolOwned):
    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="bus_assignments")
    route = models.ForeignKey(Route, on_delete=models.PROTECT, related_name="riders")
    stop = models.ForeignKey(Stop, on_delete=models.PROTECT, related_name="riders")
    active = models.BooleanField(default=True)
    started_on = models.DateField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["student"], condition=Q(active=True), name="transport_one_active_route"
            )
        ]

    def __str__(self):
        return f"{self.student} on {self.route}"


class StopChangeRequest(SchoolOwned):
    """A new pick-up point only takes effect once the parent confirms it (SMS spec §15)."""

    class Status(models.TextChoices):
        WAITING = "WAITING", "Waiting for the parent"
        CONFIRMED = "CONFIRMED", "Confirmed"
        DECLINED = "DECLINED", "Declined"

    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="+")
    new_stop = models.ForeignKey(Stop, on_delete=models.CASCADE, related_name="+")
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    status = models.CharField(max_length=9, choices=Status.choices, default=Status.WAITING)
    decided_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.student} to {self.new_stop}"


class BoardingLog(SchoolOwned):
    class Kind(models.TextChoices):
        BOARDED = "BOARDED", "Boarded"
        DROPPED_OFF = "DROPPED_OFF", "Dropped off"

    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="+")
    route = models.ForeignKey(Route, on_delete=models.PROTECT, related_name="+")
    kind = models.CharField(max_length=11, choices=Kind.choices)
    at = models.DateTimeField(auto_now_add=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["-at"]

    def __str__(self):
        return f"{self.student} {self.get_kind_display().lower()}"
