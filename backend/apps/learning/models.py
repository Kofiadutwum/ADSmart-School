"""Teaching and learning records (SMS spec §7–§12, §22–§23, §28): attendance, assessment set-up,
marks and results with their approval, report cards, lesson notes, the timetable, learning
resources and quizzes."""

from django.conf import settings
from django.db import models

from apps.school.models import SchoolOwned

USER = settings.AUTH_USER_MODEL


class StudentAttendance(SchoolOwned):
    class Status(models.TextChoices):
        PRESENT = "PRESENT", "Present"
        ABSENT = "ABSENT", "Absent"
        LATE = "LATE", "Late"
        EXCUSED = "EXCUSED", "Excused"

    student = models.ForeignKey(
        "people.Student", on_delete=models.CASCADE, related_name="attendance"
    )
    date = models.DateField()
    status = models.CharField(max_length=7, choices=Status.choices)
    arrival_time = models.TimeField(null=True, blank=True)
    departure_time = models.TimeField(null=True, blank=True)
    collected_by = models.CharField(max_length=120, blank=True)
    note = models.CharField(max_length=200, blank=True)
    marked_by = models.ForeignKey(
        USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    absence_texted = models.BooleanField(default=False)

    class Meta:
        ordering = ["-date"]
        constraints = [
            models.UniqueConstraint(fields=["student", "date"], name="learning_one_mark_a_day")
        ]

    def __str__(self):
        return f"{self.student} {self.date} {self.status}"


class StaffAttendance(SchoolOwned):
    class Status(models.TextChoices):
        PRESENT = "PRESENT", "Present"
        LATE = "LATE", "Late"
        ABSENT = "ABSENT", "Absent"
        ON_LEAVE = "ON_LEAVE", "On leave"

    staff = models.ForeignKey("people.Staff", on_delete=models.CASCADE, related_name="attendance")
    date = models.DateField()
    status = models.CharField(max_length=8, choices=Status.choices)
    time_in = models.TimeField(null=True, blank=True)
    note = models.CharField(max_length=200, blank=True)
    marked_by = models.ForeignKey(
        USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-date"]
        constraints = [
            models.UniqueConstraint(fields=["staff", "date"], name="learning_one_staff_mark")
        ]

    def __str__(self):
        return f"{self.staff} {self.date} {self.status}"


class LeaveRequest(SchoolOwned):
    class Kind(models.TextChoices):
        ANNUAL = "ANNUAL", "Annual leave"
        SICK = "SICK", "Sick leave"
        MATERNITY = "MATERNITY", "Maternity or paternity"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Waiting for approval"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    staff = models.ForeignKey(
        "people.Staff", on_delete=models.CASCADE, related_name="leave_requests"
    )
    kind = models.CharField(max_length=9, choices=Kind.choices)
    start = models.DateField()
    end = models.DateField()
    reason = models.CharField(max_length=300, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    decided_by = models.ForeignKey(
        USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-start"]

    def __str__(self):
        return f"{self.staff}: {self.get_kind_display()} {self.start} to {self.end}"


class GradingScale(SchoolOwned):
    """Rows of {min, max, grade, remark}, per level and year (configurable, not coded)."""

    band = models.CharField(max_length=20)
    academic_year = models.ForeignKey(
        "academics.AcademicYear", on_delete=models.CASCADE, related_name="+"
    )
    rows = models.JSONField(default=list)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["school", "band", "academic_year"], name="learning_one_scale"
            )
        ]

    def __str__(self):
        return f"Grades for {self.band}, {self.academic_year}"


class AssessmentComponent(SchoolOwned):
    band = models.CharField(max_length=20)
    academic_year = models.ForeignKey(
        "academics.AcademicYear", on_delete=models.CASCADE, related_name="+"
    )
    name = models.CharField(max_length=60)
    weight = models.PositiveSmallIntegerField(help_text="Percent of the total")
    max_score = models.PositiveSmallIntegerField(default=100)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["band", "order"]

    def __str__(self):
        return f"{self.name} ({self.weight}%)"


class ResultRules(SchoolOwned):
    class TieRule(models.TextChoices):
        SHARED = "SHARED", "Tied pupils share the position, the next is skipped (1, 1, 3)"
        DENSE = "DENSE", "Tied pupils share the position, the next follows (1, 1, 2)"

    band = models.CharField(max_length=20)
    academic_year = models.ForeignKey(
        "academics.AcademicYear", on_delete=models.CASCADE, related_name="+"
    )
    pass_mark = models.PositiveSmallIntegerField(default=50)
    positions_enabled = models.BooleanField(default=False)
    tie_rule = models.CharField(max_length=6, choices=TieRule.choices, default=TieRule.SHARED)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["school", "band", "academic_year"], name="learning_one_rules"
            )
        ]

    def __str__(self):
        return f"Rules for {self.band}, {self.academic_year}"


class Mark(SchoolOwned):
    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="marks")
    subject = models.ForeignKey("academics.Subject", on_delete=models.PROTECT, related_name="+")
    term = models.ForeignKey("academics.Term", on_delete=models.CASCADE, related_name="+")
    component = models.ForeignKey(
        AssessmentComponent, on_delete=models.PROTECT, related_name="marks"
    )
    score = models.DecimalField(max_digits=6, decimal_places=2)
    entered_by = models.ForeignKey(
        USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["student", "subject", "term", "component"], name="learning_one_mark"
            )
        ]

    def __str__(self):
        return f"{self.student} {self.subject} {self.score}"


class DescriptiveResult(SchoolOwned):
    """Early years and lower primary: a level and a comment per learning area."""

    class Level(models.TextChoices):
        EMERGING = "EMERGING", "Emerging"
        DEVELOPING = "DEVELOPING", "Developing"
        SECURE = "SECURE", "Secure"
        EXCEEDING = "EXCEEDING", "Exceeding"

    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="+")
    subject = models.ForeignKey("academics.Subject", on_delete=models.PROTECT, related_name="+")
    term = models.ForeignKey("academics.Term", on_delete=models.CASCADE, related_name="+")
    level = models.CharField(max_length=10, choices=Level.choices)
    comment = models.CharField(max_length=300, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["student", "subject", "term"], name="learning_one_description"
            )
        ]

    def __str__(self):
        return f"{self.student} {self.subject}: {self.level}"


class ResultSheet(SchoolOwned):
    """One class's results in one subject for a term, and where they are in approval."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted"
        REVIEWED = "REVIEWED", "Reviewed"
        APPROVED = "APPROVED", "Approved"
        PUBLISHED = "PUBLISHED", "Published"

    school_class = models.ForeignKey(
        "academics.SchoolClass", on_delete=models.CASCADE, related_name="+"
    )
    subject = models.ForeignKey("academics.Subject", on_delete=models.PROTECT, related_name="+")
    term = models.ForeignKey("academics.Term", on_delete=models.CASCADE, related_name="+")
    status = models.CharField(max_length=9, choices=Status.choices, default=Status.DRAFT)
    submitted_by = models.ForeignKey(
        USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    reviewed_by = models.ForeignKey(
        USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    approved_by = models.ForeignKey(
        USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["school_class", "subject", "term"], name="learning_one_sheet"
            )
        ]

    def __str__(self):
        return f"{self.school_class} {self.subject} {self.term}"


class ResultChange(SchoolOwned):
    """A mark changed after publication, with a reason (SMS spec §10)."""

    sheet = models.ForeignKey(ResultSheet, on_delete=models.CASCADE, related_name="changes")
    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="+")
    component = models.ForeignKey(AssessmentComponent, on_delete=models.PROTECT, related_name="+")
    old_score = models.DecimalField(max_digits=6, decimal_places=2, null=True)
    new_score = models.DecimalField(max_digits=6, decimal_places=2)
    reason = models.CharField(max_length=300)
    changed_by = models.ForeignKey(USER, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.student}: {self.old_score} to {self.new_score}"


class ReportCardEntry(SchoolOwned):
    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="+")
    term = models.ForeignKey("academics.Term", on_delete=models.CASCADE, related_name="+")
    conduct = models.CharField(max_length=120, blank=True)
    interest = models.CharField(max_length=120, blank=True)
    class_teacher_remark = models.CharField(max_length=300, blank=True)
    head_teacher_remark = models.CharField(max_length=300, blank=True)
    promotion = models.CharField(max_length=120, blank=True)
    reopening_date = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["student", "term"], name="learning_one_report_entry")
        ]

    def __str__(self):
        return f"Report for {self.student}, {self.term}"


class ReportSettings(SchoolOwned):
    withhold_for_arrears = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["school"], name="learning_one_report_settings")
        ]

    def __str__(self):
        return "Report card settings"


class ReportRelease(SchoolOwned):
    """The Head Teacher releases a report withheld for arrears (SMS spec §11)."""

    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="+")
    term = models.ForeignKey("academics.Term", on_delete=models.CASCADE, related_name="+")
    released_by = models.ForeignKey(USER, on_delete=models.PROTECT, related_name="+")
    reason = models.CharField(max_length=300)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Report released for {self.student}"


class LessonNoteTemplate(SchoolOwned):
    name = models.CharField(max_length=80)
    bands = models.JSONField(default=list, blank=True)
    sections = models.JSONField(default=list, help_text="Section headings, in order")

    def __str__(self):
        return self.name


class LessonNote(SchoolOwned):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted"
        RETURNED = "RETURNED", "Returned for changes"
        REVIEWED = "REVIEWED", "Reviewed"
        APPROVED = "APPROVED", "Approved"

    staff = models.ForeignKey("people.Staff", on_delete=models.CASCADE, related_name="lesson_notes")
    school_class = models.ForeignKey(
        "academics.SchoolClass", on_delete=models.CASCADE, related_name="+"
    )
    subject = models.ForeignKey("academics.Subject", on_delete=models.PROTECT, related_name="+")
    week_start = models.DateField()
    template = models.ForeignKey(
        LessonNoteTemplate, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    content = models.JSONField(default=dict)
    status = models.CharField(max_length=9, choices=Status.choices, default=Status.DRAFT)
    review_comment = models.CharField(max_length=500, blank=True)
    reviewed_by = models.ForeignKey(
        USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-week_start"]

    def __str__(self):
        return f"{self.subject}, {self.school_class}, week of {self.week_start}"


class Period(SchoolOwned):
    name = models.CharField(max_length=40)
    start_time = models.TimeField()
    end_time = models.TimeField()
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "start_time"]

    def __str__(self):
        return f"{self.name} ({self.start_time:%H:%M})"


class TimetableSlot(SchoolOwned):
    class Day(models.IntegerChoices):
        MONDAY = 1, "Monday"
        TUESDAY = 2, "Tuesday"
        WEDNESDAY = 3, "Wednesday"
        THURSDAY = 4, "Thursday"
        FRIDAY = 5, "Friday"

    term = models.ForeignKey("academics.Term", on_delete=models.CASCADE, related_name="+")
    school_class = models.ForeignKey(
        "academics.SchoolClass", on_delete=models.CASCADE, related_name="+"
    )
    day = models.PositiveSmallIntegerField(choices=Day.choices)
    period = models.ForeignKey(Period, on_delete=models.CASCADE, related_name="slots")
    subject = models.ForeignKey("academics.Subject", on_delete=models.PROTECT, related_name="+")
    staff = models.ForeignKey(
        "people.Staff", null=True, blank=True, on_delete=models.SET_NULL, related_name="timetable"
    )

    class Meta:
        ordering = ["day", "period__order"]
        constraints = [
            models.UniqueConstraint(
                fields=["term", "school_class", "day", "period"], name="learning_one_slot"
            )
        ]

    def __str__(self):
        return f"{self.school_class} {self.get_day_display()} {self.period}: {self.subject}"


class Cover(SchoolOwned):
    slot = models.ForeignKey(TimetableSlot, on_delete=models.CASCADE, related_name="covers")
    date = models.DateField()
    substitute = models.ForeignKey("people.Staff", on_delete=models.PROTECT, related_name="+")
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["slot", "date"], name="learning_one_cover")]

    def __str__(self):
        return f"{self.substitute} covers {self.slot} on {self.date}"


class LearningResource(SchoolOwned):
    class Kind(models.TextChoices):
        FILE = "FILE", "File"
        LINK = "LINK", "Link"

    title = models.CharField(max_length=160)
    subject = models.ForeignKey(
        "academics.Subject", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    band = models.CharField(max_length=20, blank=True)
    school_class = models.ForeignKey(
        "academics.SchoolClass", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    kind = models.CharField(max_length=4, choices=Kind.choices, default=Kind.LINK)
    file = models.FileField(upload_to="resources/", blank=True)
    url = models.URLField(blank=True)
    description = models.CharField(max_length=300, blank=True)
    uploaded_by = models.ForeignKey(
        USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class Quiz(SchoolOwned):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Open to pupils"
        CLOSED = "CLOSED", "Closed"

    teacher = models.ForeignKey("people.Staff", on_delete=models.CASCADE, related_name="quizzes")
    school_class = models.ForeignKey(
        "academics.SchoolClass", on_delete=models.CASCADE, related_name="+"
    )
    subject = models.ForeignKey("academics.Subject", on_delete=models.PROTECT, related_name="+")
    title = models.CharField(max_length=160)
    topic = models.CharField(max_length=160)
    status = models.CharField(max_length=9, choices=Status.choices, default=Status.DRAFT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "quizzes"

    def __str__(self):
        return self.title


class QuizQuestion(SchoolOwned):
    class Kind(models.TextChoices):
        CHOICE = "CHOICE", "Multiple choice"
        SHORT = "SHORT", "Short answer"

    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="questions")
    kind = models.CharField(max_length=6, choices=Kind.choices, default=Kind.CHOICE)
    text = models.TextField(max_length=1000)
    options = models.JSONField(default=list, blank=True)
    answer = models.CharField(max_length=300, blank=True)
    marks = models.PositiveSmallIntegerField(default=1)
    approved = models.BooleanField(default=False)
    from_ai = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.text[:60]


class QuizAttempt(SchoolOwned):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="attempts")
    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="+")
    submitted_at = models.DateTimeField(null=True, blank=True)
    score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["quiz", "student"], name="learning_one_attempt")
        ]

    def __str__(self):
        return f"{self.student} on {self.quiz}"


class QuizAnswer(SchoolOwned):
    attempt = models.ForeignKey(QuizAttempt, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(QuizQuestion, on_delete=models.CASCADE, related_name="+")
    answer = models.CharField(max_length=1000, blank=True)
    correct = models.BooleanField(null=True)
    marks_awarded = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["attempt", "question"], name="learning_one_answer")
        ]

    def __str__(self):
        return f"Answer to {self.question}"
