"""The school year, its calendar, classes, subjects and assignments, per school
(Phase 1 spec §3.1)."""

from django.db import models
from django.db.models import F, Q

from apps.academics.structure import BANDS, YEAR_GROUP_CHOICES, YEAR_GROUPS
from apps.school.models import SchoolOwned, same_school


class AcademicYear(SchoolOwned):
    name = models.CharField(max_length=9, help_text="For example 2026/2027")
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False)

    class Meta:
        ordering = ["-start_date"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="academics_year_name"),
            models.UniqueConstraint(
                fields=["school"], condition=Q(is_current=True), name="academics_one_current_year"
            ),
            models.CheckConstraint(
                condition=Q(start_date__lt=F("end_date")), name="academics_year_dates"
            ),
        ]

    def __str__(self):
        return self.name


class Term(SchoolOwned):
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name="terms")
    number = models.PositiveSmallIntegerField()
    start_date = models.DateField()
    end_date = models.DateField()

    class Meta:
        ordering = ["start_date"]
        constraints = [
            models.UniqueConstraint(
                fields=["academic_year", "number"], name="academics_term_number"
            ),
            models.CheckConstraint(
                condition=Q(number__gte=1, number__lte=3), name="academics_term_1_to_3"
            ),
            models.CheckConstraint(
                condition=Q(start_date__lt=F("end_date")), name="academics_term_dates"
            ),
        ]

    def __str__(self):
        return f"Term {self.number}, {self.academic_year}"

    def save(self, *args, **kwargs):
        self.school_id = same_school(self.academic_year)
        super().save(*args, **kwargs)


class CalendarDay(SchoolOwned):
    """One school day. Attendance (Phase 4) counts the OPEN ones."""

    class Type(models.TextChoices):
        OPEN = "OPEN", "School open"
        HOLIDAY = "HOLIDAY", "Holiday"
        CLOSING = "CLOSING", "Closing day"
        REOPENING = "REOPENING", "Reopening day"

    date = models.DateField()
    term = models.ForeignKey(Term, on_delete=models.CASCADE, related_name="days")
    type = models.CharField(max_length=10, choices=Type.choices, default=Type.OPEN)
    note = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ["date"]
        constraints = [models.UniqueConstraint(fields=["school", "date"], name="academics_one_day")]

    def __str__(self):
        return f"{self.date} {self.type}"

    def save(self, *args, **kwargs):
        self.school_id = same_school(self.term)
        super().save(*args, **kwargs)


class SchoolClass(SchoolOwned):
    academic_year = models.ForeignKey(
        AcademicYear, on_delete=models.PROTECT, related_name="classes"
    )
    year_group = models.CharField(max_length=12, choices=YEAR_GROUP_CHOICES)
    stream = models.CharField(
        max_length=2, blank=True, help_text="For example A, when a year group has several classes"
    )

    class Meta:
        verbose_name_plural = "school classes"
        constraints = [
            models.UniqueConstraint(
                fields=["academic_year", "year_group", "stream"], name="academics_one_class"
            )
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        self.school_id = same_school(self.academic_year)
        school = self.academic_year.school
        if self._state.adding and self.band not in school.levels_offered:
            raise ValueError(f"{school} does not teach {BANDS[self.band].name}.")
        super().save(*args, **kwargs)

    @property
    def name(self) -> str:
        """Basic 2A, JHS 1, Crèche B (Phase 1 spec §3.1)."""
        group = YEAR_GROUPS[self.year_group].name
        if not self.stream:
            return group
        return f"{group}{self.stream}" if group[-1].isdigit() else f"{group} {self.stream}"

    @property
    def band(self) -> str:
        return YEAR_GROUPS[self.year_group].band


class Subject(SchoolOwned):
    name = models.CharField(max_length=80)
    code = models.CharField(max_length=10)
    bands = models.JSONField(default=list, help_text="The bands that study it")
    is_learning_area = models.BooleanField(
        default=False, help_text="An early-years learning area, assessed by description"
    )

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "code"], name="academics_subject_code")
        ]

    def __str__(self):
        return self.name


def _same_year(term: Term, school_class: SchoolClass) -> None:
    if term.academic_year_id != school_class.academic_year_id:
        raise ValueError("The term is not in this class's school year.")


class ClassTeacherAssignment(SchoolOwned):
    """One class teacher per class per term. Substitutes arrive later (SMS spec §14)."""

    school_class = models.ForeignKey(
        SchoolClass, on_delete=models.CASCADE, related_name="class_teachers"
    )
    staff = models.ForeignKey(
        "people.Staff", on_delete=models.CASCADE, related_name="class_teacher_of"
    )
    term = models.ForeignKey(Term, on_delete=models.CASCADE, related_name="+")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["school_class", "term"], name="academics_one_class_teacher"
            )
        ]

    def __str__(self):
        return f"{self.staff}, class teacher of {self.school_class}"

    def save(self, *args, **kwargs):
        self.school_id = same_school(self.school_class, self.staff, self.term)
        _same_year(self.term, self.school_class)
        super().save(*args, **kwargs)


class TeachingAssignment(SchoolOwned):
    """Who teaches what to which class; it decides which classes a teacher may see (§4.2)."""

    staff = models.ForeignKey("people.Staff", on_delete=models.CASCADE, related_name="teaching")
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name="teaching")
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT, related_name="+")
    term = models.ForeignKey(Term, on_delete=models.CASCADE, related_name="+")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["staff", "school_class", "subject", "term"], name="academics_one_teaching"
            )
        ]

    def __str__(self):
        return f"{self.staff}: {self.subject}, {self.school_class}"

    def save(self, *args, **kwargs):
        self.school_id = same_school(self.staff, self.school_class, self.subject, self.term)
        _same_year(self.term, self.school_class)
        if self.school_class.band not in self.subject.bands:
            raise ValueError(f"{self.subject} is not taught in {self.school_class}.")
        super().save(*args, **kwargs)
