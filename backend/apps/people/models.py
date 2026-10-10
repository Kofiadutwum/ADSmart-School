"""Pupils, parents and staff of one school (Phase 1 spec §3.2, amendment §3.2)."""

from django.db import models

from apps.school.models import SchoolOwned


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
