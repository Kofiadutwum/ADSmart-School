# Plan 4: School Records and Demo Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each school gets its own records. These cover the school year and calendar, classes and subjects, and pupils with checked Student IDs. They also cover parents and guardians, emergency contacts and pick-up people, staff with their class and teaching assignments, and consents. A `seed_demo` command fills a school with a realistic, clearly flagged demo school, and `purge_demo` removes it again.

**Architecture:** There are two new Django apps, and the existing `consent` app gains a model:
- `academics`: school years, terms, calendar days, classes, subjects and assignments.
- `people`: pupils, parents, staff, enrolments, Student IDs, demo rules and the demo commands.
- `consent`: gains `Consent`.

How the records fit the platform:
- **School ownership:** every table is school-owned (`SchoolOwned`, Plan 2). A new helper, `same_school`, makes each linked record take its school from what it links, and refuses links between two schools.
- **Fixed lists in code:** Ghana's programme bands and year groups are fixed by the curriculum, so they live in code (`academics/structure.py`), keyed by the band codes Plan 2 already uses in `School.levels_offered`.
- **Services and audit:** services hold the audited changes. The demo seed writes records directly and adds one summary audit entry, so the append-only log is not flooded.
- **No screens yet:** this plan adds no API routes; the portal screens come in Plan 5.

**Tech Stack:** Django 6.1.2, DRF 3.18.3, PostgreSQL 18 (embedded), pytest.

**Spec:** `docs/superpowers/specs/2026-10-09-multi-school-platform-design.md` (§3.2) amending `docs/superpowers/specs/2026-10-09-ad-smart-school-website-phase1-design.md` (§3.1–3.5, §9, §11.3)

## Global Constraints

- **School ownership:**
  - Every new table has a non-null `school`, and its unique rules apply within the school.
  - Records linked to each other always share a school (amendment §3.2).
- **Student ID** (Phase 1 §3.3, amendment §3.2):
  - 7 digits: `YY` + `NNNN` + Damm check digit, shown as `26-0147-1` and typed as `2601471`.
  - One counter per school per admission year, locked with `SELECT … FOR UPDATE`. IDs are never reused, and each year allows 9,999.
  - The spec's example `26-0147-3` fails the Damm check, so examples in copy use `26-0147-1`.
- **Phones** are stored as E.164 and validated with `apps.core.phones.normalise_gh_phone` (§3.4).
- **Pupils:**
  - They are never deleted; `purge_demo` of demo rows is the only exception.
  - A status change needs a reason and is audited.
  - A pupil has at most one open enrolment per school year, enforced by a database constraint.
- **School years:** only one current school year per school (database constraint).
- **Consent:**
  - Its subject is a pupil or a parent, never both (check constraint).
  - `SMS_CONTACT` is recorded for parents; the other types are recorded for pupils.
- **Demo records** (§9):
  - Every demo person has `is_demo = true`.
  - Numbers linked only to demo records are never texted.
  - Demo sign-ins exist only when `DEMO_LOGINS_ENABLED=true`, which settings refuse while `DJANGO_DEBUG` is off.
  - `purge_demo` refuses while real records point at demo ones.
- **Audited** (§11.3): admissions, status changes, enrolments, pick-up people, guardians, new accounts, terms, consents given or withdrawn, demo conversions and the demo purge.
- **Files** are stored under `schools/<school id>/…`, with random names that never carry a person's name.
- **No invented facts:**
  - The calendar marks only the rule-based national holidays: New Year's Day, Independence Day, Good Friday, Easter Monday, May Day, Farmers' Day (first Friday of December), Christmas Day and Boxing Day. The Administrator adds Eid and newly gazetted days.
  - Demo licence numbers read `DEMO-00001`.
- **Copy:** UK English and plain language.

## Review Focus

1. **Links across schools.** A guardianship, enrolment, class, term or assignment joining two schools must be refused. Tasks 1, 3 and 4 pin this.
2. **Student ID clashes.** Two admissions in the same school and year must never share an ID; the database refuses a duplicate even if the counter were bypassed. Task 2 and Task 3 pin this.
3. **A number on both a demo and a real record.** It belongs to a real person, so it is texted. A number on no record at all is texted too. Task 6 pins this.
4. **Purge with mixed links.** A real parent who guards a demo pupil blocks the purge, which lists the link and deletes nothing. Task 8 pins this.
5. **Schools that teach only some levels.** A class for a level the school does not teach is refused, and `seed_demo` builds only the taught levels and subjects. Tasks 1 and 7 pin this.

---

### Task 1: Academics: bands, year groups, the school year, its calendar, classes and subjects

**Files:**
- Modify: `backend/apps/school/models.py` (adds `same_school`), `backend/config/settings.py` (INSTALLED_APPS)
- Create: `backend/apps/academics/__init__.py`, `apps.py`, `structure.py`, `models.py`, `calendar.py`, `migrations/__init__.py`, `migrations/0001_initial.py` (generated)
- Test: `backend/tests/records.py`, `backend/tests/academics/__init__.py`, `backend/tests/academics/test_calendar_and_classes.py`

**Interfaces:**
- Consumes: `School`, `SchoolOwned`, `LEVEL_CODES` (Plan 2); `record` (Plan 3).
- Produces:
  - **`apps.school.models.same_school(*records) -> int`**: the shared `school_id`. It raises `ValueError("Records from different schools cannot be linked.")`.
  - **`structure`:** `Band`, `YearGroup`, `BANDS` (keyed by the six `LEVEL_CODES`), `YEAR_GROUPS` (14, `creche` … `basic_9`), `YEAR_GROUP_CHOICES`, `year_groups_for(bands) -> list[YearGroup]`.
  - **Models:**
    - `AcademicYear(name, start_date, end_date, is_current)`.
    - `Term(academic_year, number, start_date, end_date)`.
    - `CalendarDay(date, term, type OPEN|HOLIDAY|CLOSING|REOPENING, note)`.
    - `SchoolClass(academic_year, year_group, stream)`, with `.name` and `.band`.
    - `Subject(name, code, bands, is_learning_area)`.
  - **`calendar`:** `easter_sunday(year)`, `ghana_public_holidays(year) -> dict[date, str]`, `create_term(academic_year, number, start, end, *, by=None) -> Term`.
  - **Test factories:** `tests.records.make_year(school, name="2026/2027", current=True)`, `make_term(year, number=1)`, `make_class(year, year_group, stream="")`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/records.py`:
```python
"""Factories for school records in tests."""

from datetime import date, timedelta

from apps.academics.models import AcademicYear, SchoolClass, Term


def make_year(school, name="2026/2027", current=True):
    start = int(name[:4])
    return AcademicYear.objects.create(
        school=school,
        name=name,
        start_date=date(start, 9, 1),
        end_date=date(start + 1, 7, 31),
        is_current=current,
    )


def make_term(year, number=1):
    start = year.start_date + timedelta(days=7)
    return Term.objects.create(
        academic_year=year, number=number, start_date=start, end_date=start + timedelta(days=90)
    )


def make_class(year, year_group, stream=""):
    return SchoolClass.objects.create(academic_year=year, year_group=year_group, stream=stream)
```

`backend/tests/academics/__init__.py`:
```python

```

`backend/tests/academics/test_calendar_and_classes.py`:
```python
from datetime import date, timedelta

import pytest
from django.db import IntegrityError, transaction

from apps.academics.calendar import create_term, easter_sunday, ghana_public_holidays
from apps.academics.models import AcademicYear, CalendarDay, SchoolClass
from apps.academics.structure import BANDS, YEAR_GROUPS, year_groups_for
from apps.audit.models import AuditLog
from apps.school.models import LEVEL_CODES, same_school
from tests.records import make_year

pytestmark = pytest.mark.django_db


def test_bands_are_the_levels_a_school_can_offer():
    assert tuple(BANDS) == LEVEL_CODES
    assert len(YEAR_GROUPS) == 14
    assert YEAR_GROUPS["basic_7"].name == "JHS 1" and YEAR_GROUPS["basic_7"].band == "jhs"
    assert YEAR_GROUPS["basic_1"].age_from == 6
    assert BANDS["upper_primary"].student_login and not BANDS["lower_primary"].student_login


def test_year_groups_follow_the_bands_offered():
    codes = [group.code for group in year_groups_for(["kg", "lower_primary"])]
    assert codes == ["kg_1", "kg_2", "basic_1", "basic_2", "basic_3"]


def test_each_school_has_at_most_one_current_year(school, other_school):
    make_year(school)
    make_year(other_school)
    with pytest.raises(IntegrityError), transaction.atomic():
        make_year(school, "2027/2028")


def test_easter_and_the_public_holidays():
    assert easter_sunday(2026) == date(2026, 4, 5)
    assert easter_sunday(2027) == date(2027, 3, 28)
    holidays = ghana_public_holidays(2026)
    assert holidays[date(2026, 4, 3)] == "Good Friday"
    assert holidays[date(2026, 12, 4)] == "Farmers' Day"  # the first Friday of December
    assert holidays[date(2026, 3, 6)] == "Independence Day"


def test_a_new_term_opens_every_weekday_and_marks_holidays(school):
    year = make_year(school)
    term = create_term(year, 1, date(2026, 9, 8), date(2026, 12, 18))
    days = list(CalendarDay.objects.filter(term=term))
    every_day = [date(2026, 9, 8) + timedelta(days=n) for n in range(102)]
    assert [day.date for day in days] == [day for day in every_day if day.weekday() < 5]
    farmers = next(day for day in days if day.date == date(2026, 12, 4))
    assert farmers.type == CalendarDay.Type.HOLIDAY and farmers.note == "Farmers' Day"
    assert {day.school_id for day in days} == {school.pk}
    entry = AuditLog.objects.get(action="CREATED")
    assert entry.entity_type == "academics.term" and entry.school == school


def test_terms_must_fall_inside_their_school_year(school):
    year = make_year(school)
    with pytest.raises(ValueError, match="inside"):
        create_term(year, 1, date(2026, 8, 1), date(2026, 12, 18))


def test_class_names(school):
    year = make_year(school)
    made = SchoolClass.objects.create(academic_year=year, year_group="basic_2", stream="A")
    assert made.name == "Basic 2A" and made.band == "lower_primary"
    assert SchoolClass.objects.create(academic_year=year, year_group="basic_7").name == "JHS 1"
    creche = SchoolClass.objects.create(academic_year=year, year_group="creche", stream="B")
    assert creche.name == "Crèche B"


def test_classes_belong_to_their_year_and_only_teach_offered_levels(other_school):
    year = make_year(other_school)
    assert SchoolClass.objects.create(academic_year=year, year_group="kg_1").school == other_school
    with pytest.raises(ValueError, match="does not teach"):
        SchoolClass.objects.create(academic_year=year, year_group="basic_7")


def test_records_of_two_schools_cannot_be_linked(school, other_school):
    assert same_school(make_year(school)) == school.pk
    last_year = make_year(school, "2025/2026", current=False)
    with pytest.raises(ValueError, match="different schools"):
        same_school(last_year, make_year(other_school))
    assert AcademicYear.objects.filter(school=school).count() == 2
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/academics -q`
Expected: ERROR, `ModuleNotFoundError: No module named 'apps.academics'`

- [ ] **Step 3: Add `same_school` and the academics app**

In `backend/apps/school/models.py`, after the `SchoolOwned` class, add:
```python


def same_school(*records) -> int:
    """The one school these records belong to. Records of two schools are never linked."""
    ids = {record.school_id for record in records}
    if len(ids) != 1 or None in ids:
        raise ValueError("Records from different schools cannot be linked.")
    return ids.pop()
```

`backend/apps/academics/__init__.py`:
```python

```

`backend/apps/academics/migrations/__init__.py`:
```python

```

`backend/apps/academics/apps.py`:
```python
from django.apps import AppConfig


class AcademicsConfig(AppConfig):
    name = "apps.academics"
    label = "academics"
    default_auto_field = "django.db.models.BigAutoField"
```

`backend/apps/academics/structure.py`:
```python
"""Ghana's programme bands and year groups (Phase 1 spec §3.1).

The national curriculum fixes them, so they live in code rather than in per-school tables. A
school picks the bands it teaches with School.levels_offered (amendment §3.1), whose codes are
the band codes here.
"""

from dataclasses import dataclass

EARLY_YEARS, PRIMARY, JHS = "EARLY_YEARS", "PRIMARY", "JHS"
CARE, DESCRIPTIVE, SCORED = "CARE", "DESCRIPTIVE", "SCORED"


@dataclass(frozen=True)
class Band:
    code: str
    name: str
    category: str
    assessment_style: str
    student_login: bool
    positions_allowed: bool


@dataclass(frozen=True)
class YearGroup:
    code: str
    band: str
    name: str
    short_name: str
    age_from: int  # age at the start of the school year
    age_to: int


BANDS = {
    band.code: band
    for band in (
        Band("creche", "Crèche", EARLY_YEARS, CARE, False, False),
        Band("nursery", "Nursery", EARLY_YEARS, CARE, False, False),
        Band("kg", "Kindergarten", EARLY_YEARS, DESCRIPTIVE, False, False),
        Band("lower_primary", "Basic 1–3", PRIMARY, DESCRIPTIVE, False, False),
        Band("upper_primary", "Basic 4–6", PRIMARY, SCORED, True, True),
        Band("jhs", "Junior High School", JHS, SCORED, True, True),
    )
}


def _basic(number: int) -> YearGroup:
    band = "lower_primary" if number <= 3 else "upper_primary" if number <= 6 else "jhs"
    if number <= 6:
        return YearGroup(f"basic_{number}", band, f"Basic {number}", f"B{number}", number + 5, number + 6)
    # Basic 7–9 are shown as JHS 1–3.
    jhs = number - 6
    return YearGroup(f"basic_{number}", band, f"JHS {jhs}", f"JHS{jhs}", number + 5, number + 6)


_ORDER = (
    YearGroup("creche", "creche", "Crèche", "CR", 1, 2),
    YearGroup("nursery_1", "nursery", "Nursery 1", "N1", 2, 3),
    YearGroup("nursery_2", "nursery", "Nursery 2", "N2", 3, 4),
    YearGroup("kg_1", "kg", "KG 1", "KG1", 4, 5),
    YearGroup("kg_2", "kg", "KG 2", "KG2", 5, 6),
    *(_basic(number) for number in range(1, 10)),
)
YEAR_GROUPS = {group.code: group for group in _ORDER}
YEAR_GROUP_CHOICES = [(group.code, group.name) for group in _ORDER]


def year_groups_for(bands) -> list[YearGroup]:
    """The year groups of these bands, youngest first."""
    return [group for group in _ORDER if group.band in bands]
```

`backend/apps/academics/models.py`:
```python
"""The school year, its calendar, classes and subjects (Phase 1 spec §3.1), per school."""

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
    academic_year = models.ForeignKey(
        AcademicYear, on_delete=models.CASCADE, related_name="terms"
    )
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
```

`backend/apps/academics/calendar.py`:
```python
"""Terms and their school days (Phase 1 spec §3.1)."""

from datetime import date, timedelta

from django.db import transaction

from apps.academics.models import AcademicYear, CalendarDay, Term
from apps.audit.models import AuditLog
from apps.audit.services import record


def easter_sunday(year: int) -> date:
    """Gregorian Easter, by the anonymous algorithm."""
    golden = year % 19
    century, rest = divmod(year, 100)
    leap_centuries, century_rest = divmod(century, 4)
    correction = (century + 8) // 25
    moon = (century - correction + 1) // 3
    epact = (19 * golden + century - leap_centuries - moon + 15) % 30
    leap_years, year_rest = divmod(rest, 4)
    weekday = (32 + 2 * century_rest + 2 * leap_years - epact - year_rest) % 7
    shift = (golden + 11 * epact + 22 * weekday) // 451
    month, day = divmod(epact + weekday - 7 * shift + 114, 31)
    return date(year, month, day + 1)


def ghana_public_holidays(year: int) -> dict[date, str]:
    """The national holidays with fixed rules.

    shortcut: Eid al-Fitr, Eid al-Adha and newly gazetted days are announced each year; the
    Administrator marks those by hand (Phase 1 spec §3.1).
    """
    easter = easter_sunday(year)
    first_of_december = date(year, 12, 1)
    farmers_day = first_of_december + timedelta(days=(4 - first_of_december.weekday()) % 7)
    return {
        date(year, 1, 1): "New Year's Day",
        date(year, 3, 6): "Independence Day",
        easter - timedelta(days=2): "Good Friday",
        easter + timedelta(days=1): "Easter Monday",
        date(year, 5, 1): "May Day",
        farmers_day: "Farmers' Day",
        date(year, 12, 25): "Christmas Day",
        date(year, 12, 26): "Boxing Day",
    }


@transaction.atomic
def create_term(academic_year: AcademicYear, number: int, start: date, end: date, *, by=None) -> Term:
    """A term with every weekday OPEN and public holidays marked; the admin edits from there."""
    if not academic_year.start_date <= start < end <= academic_year.end_date:
        raise ValueError("A term must fall inside its school year.")
    term = Term.objects.create(
        academic_year=academic_year, number=number, start_date=start, end_date=end
    )
    holidays = {**ghana_public_holidays(start.year), **ghana_public_holidays(end.year)}
    days = []
    day = start
    while day <= end:
        if day.weekday() < 5:
            holiday = holidays.get(day, "")
            kind = CalendarDay.Type.HOLIDAY if holiday else CalendarDay.Type.OPEN
            days.append(
                CalendarDay(school_id=term.school_id, term=term, date=day, type=kind, note=holiday)
            )
        day += timedelta(days=1)
    CalendarDay.objects.bulk_create(days)
    record(
        AuditLog.Action.CREATED,
        actor=by,
        entity=term,
        new={"start": start.isoformat(), "end": end.isoformat()},
    )
    return term
```

In `backend/config/settings.py`, add `"apps.academics",` to INSTALLED_APPS after `"apps.website",`. Then run `.venv/Scripts/python manage.py makemigrations academics --name initial`.

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/academics -q`
Expected: all pass.

- [ ] **Step 5: Migrate, check and commit**

Run: `.venv/Scripts/python manage.py migrate -v0 && .venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff format . && .venv/Scripts/python -m ruff check .`

```bash
git add backend/apps/academics backend/apps/school/models.py backend/config/settings.py backend/tests/records.py backend/tests/academics
git commit -m "Add school years, terms with their calendar days, classes and subjects per school"
```

---

### Task 2: Student IDs with a Damm check digit, counted per school and year

**Files:**
- Create: `backend/apps/people/__init__.py`, `apps.py`, `models.py`, `student_ids.py`, `migrations/__init__.py`, `migrations/0001_initial.py` (generated)
- Modify: `backend/config/settings.py` (INSTALLED_APPS), `backend/apps/accounts/identifiers.py` (example), `frontend/src/components/auth/sign-in-form.tsx` (example)
- Test: `backend/tests/people/__init__.py`, `backend/tests/people/test_student_ids.py`

**Interfaces:**
- Consumes: `SchoolOwned` (Plan 2).
- Produces:
  - **`StudentIdCounter(school, year, last)`**.
  - **`student_ids`:** `damm_digit(digits) -> int`, `is_valid_student_id(value) -> bool`, `format_student_id(value) -> str`, `allocate_student_id(school, year) -> str`, `MAX_PER_YEAR = 9999`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/people/__init__.py`:
```python

```

`backend/tests/people/test_student_ids.py`:
```python
import pytest
from django.db import IntegrityError, transaction

from apps.people.models import StudentIdCounter
from apps.people.student_ids import (
    allocate_student_id,
    damm_digit,
    format_student_id,
    is_valid_student_id,
)

pytestmark = pytest.mark.django_db


def test_the_damm_check_digit():
    assert damm_digit("572") == 4 and damm_digit("5724") == 0
    assert damm_digit("260147") == 1
    assert is_valid_student_id("2601471") and not is_valid_student_id("2601473")
    assert not is_valid_student_id("260147") and not is_valid_student_id("26014711")
    assert not is_valid_student_id("٢٦٠١٤٧١")


def test_every_single_digit_error_and_adjacent_swap_is_caught():
    for body in ("260001", "260147", "259999", "270420"):
        valid = body + str(damm_digit(body))
        assert is_valid_student_id(valid)
        for position in range(7):
            for digit in "0123456789":
                if digit != valid[position]:
                    typo = valid[:position] + digit + valid[position + 1 :]
                    assert not is_valid_student_id(typo)
        for position in range(6):
            first, second = valid[position], valid[position + 1]
            if first != second:
                swapped = valid[:position] + second + first + valid[position + 2 :]
                assert not is_valid_student_id(swapped)


def test_allocation_counts_per_school_and_year(school, other_school):
    first = allocate_student_id(school, 2026)
    second = allocate_student_id(school, 2026)
    assert first[:6] == "260001" and second[:6] == "260002"
    assert is_valid_student_id(first) and is_valid_student_id(second)
    assert allocate_student_id(other_school, 2026)[:6] == "260001"
    assert allocate_student_id(school, 2025)[:6] == "250001"
    assert format_student_id(first) == f"26-0001-{first[6]}"


def test_ids_run_out_after_9999_in_a_year(school):
    StudentIdCounter.objects.create(school=school, year=2026, last=9999)
    with pytest.raises(ValueError, match="No Student IDs left"):
        allocate_student_id(school, 2026)


def test_one_counter_per_school_and_year(school):
    StudentIdCounter.objects.create(school=school, year=2026)
    with pytest.raises(IntegrityError), transaction.atomic():
        StudentIdCounter.objects.create(school=school, year=2026)
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/people -q`
Expected: ERROR, `ModuleNotFoundError: No module named 'apps.people'`

- [ ] **Step 3: Write the people app and Student IDs**

`backend/apps/people/__init__.py`:
```python

```

`backend/apps/people/migrations/__init__.py`:
```python

```

`backend/apps/people/apps.py`:
```python
from django.apps import AppConfig


class PeopleConfig(AppConfig):
    name = "apps.people"
    label = "people"
    default_auto_field = "django.db.models.BigAutoField"
```

`backend/apps/people/models.py`:
```python
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
```

`backend/apps/people/student_ids.py`:
```python
"""Student IDs (Phase 1 spec §3.3, amendment §3.2): YY + NNNN + a Damm check digit, counted per
school and admission year. The Damm digit catches every single-digit error and every swap of
two neighbouring digits, which matters when IDs are typed on keypads."""

from django.db import transaction

DAMM = (
    (0, 3, 1, 7, 5, 9, 8, 6, 4, 2),
    (7, 0, 9, 2, 1, 5, 4, 8, 6, 3),
    (4, 2, 0, 6, 8, 7, 1, 3, 5, 9),
    (1, 7, 5, 0, 9, 8, 3, 4, 2, 6),
    (6, 1, 2, 3, 0, 4, 5, 9, 7, 8),
    (3, 6, 7, 4, 2, 0, 9, 5, 8, 1),
    (5, 8, 6, 9, 7, 2, 0, 1, 3, 4),
    (8, 9, 4, 5, 3, 6, 2, 0, 1, 7),
    (9, 4, 3, 8, 6, 1, 7, 2, 0, 5),
    (2, 5, 8, 1, 4, 3, 6, 7, 9, 0),
)
MAX_PER_YEAR = 9999


def damm_digit(digits: str) -> int:
    interim = 0
    for digit in digits:
        interim = DAMM[interim][int(digit)]
    return interim


def is_valid_student_id(value: str) -> bool:
    return len(value) == 7 and value.isascii() and value.isdigit() and damm_digit(value) == 0


def format_student_id(value: str) -> str:
    """2601471 → 26-0147-1."""
    return f"{value[:2]}-{value[2:6]}-{value[6:]}"


@transaction.atomic
def allocate_student_id(school, year: int) -> str:
    """The next ID for this school and admission year. The counter row is locked, so admissions
    at the same moment never share an ID, and IDs are never reused."""
    from apps.people.models import StudentIdCounter

    counter, _ = StudentIdCounter.objects.select_for_update().get_or_create(
        school=school, year=year
    )
    if counter.last >= MAX_PER_YEAR:
        raise ValueError(f"No Student IDs left for {year}.")
    counter.last += 1
    counter.save(update_fields=["last"])
    body = f"{year % 100:02d}{counter.last:04d}"
    return body + str(damm_digit(body))
```

In `backend/config/settings.py`, add `"apps.people",` to INSTALLED_APPS after `"apps.academics",`. Then run `.venv/Scripts/python manage.py makemigrations people --name initial`.

Make the examples valid IDs:
- In `backend/apps/accounts/identifiers.py`, change `e.g. 26-0147-3.` to `e.g. 26-0147-1.`.
- In `frontend/src/components/auth/sign-in-form.tsx`, change `e.g. 26-0147-3.` to `e.g. 26-0147-1.`.

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/people -q`
Expected: 5 passed.

- [ ] **Step 5: Migrate, check and commit**

Run: `.venv/Scripts/python manage.py migrate -v0 && .venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff format . && .venv/Scripts/python -m ruff check . && cd ../frontend && npm test`

```bash
git add backend/apps/people backend/apps/accounts/identifiers.py backend/config/settings.py backend/tests/people frontend/src/components/auth/sign-in-form.tsx
git commit -m "Add Student IDs with a Damm check digit, counted per school and year"
```

---

### Task 3: People: pupils, families, staff and enrolments

**Files:**
- Rewrite: `backend/apps/people/models.py`, `backend/tests/records.py`
- Create: `backend/apps/people/services.py`, `backend/apps/people/migrations/0002_people.py` (generated)
- Test: `backend/tests/people/test_people.py`

**Interfaces:**
- Consumes:
  - From Task 1: `same_school`, `SchoolClass`, `AcademicYear`, `BANDS`.
  - From Task 2: `allocate_student_id`.
  - From Plan 3: `User`, `roles`, `normalise_identifier`, `record`.
- Produces:
  - **Models:**
    - `Gender` (`F`/`M`).
    - `Student`, with `Status`, `full_name`, an optional `user`, `is_demo`, and a `student_id` set at admission.
    - `EmergencyContact`.
    - `Parent`, with a required `user` (kind parent), `phone` unique within the school, and `is_demo`.
    - `Guardianship`, with `Relationship` MOTHER|FATHER|GUARDIAN|OTHER.
    - `PickupPerson`, with `is_demo`.
    - `Staff`, with a required `user` (kind staff), `EmploymentStatus` and `is_demo`.
    - `Enrolment`, with `Outcome`. Its `academic_year` is taken from the class.
  - **Related names:** `student.emergency_contacts`, `.guardianships`, `.pickup_people`, `.enrolments`, `.consents` (Task 5); `parent.guardianships`; `user.parent_profile`, `.staff_profile`, `.student_profile`.
  - **`photo_upload_to(instance, filename)`** gives `schools/<school id>/<model>/<random hex><ext>`.
  - **`services`:** `STAFF_ROLES`, `admit_student`, `change_student_status`, `create_parent`, `link_guardian`, `create_staff`, `enrol`, `add_emergency_contact`, `add_pickup_person`, `give_student_login`.
  - **Test factories:** `tests.records.make_student`, `make_parent`, `make_staff`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/records.py`:
```python
"""Factories for school records in tests."""

from datetime import date, timedelta

from apps.academics.models import AcademicYear, SchoolClass, Term
from apps.people import services


def make_year(school, name="2026/2027", current=True):
    start = int(name[:4])
    return AcademicYear.objects.create(
        school=school,
        name=name,
        start_date=date(start, 9, 1),
        end_date=date(start + 1, 7, 31),
        is_current=current,
    )


def make_term(year, number=1):
    start = year.start_date + timedelta(days=7)
    return Term.objects.create(
        academic_year=year, number=number, start_date=start, end_date=start + timedelta(days=90)
    )


def make_class(year, year_group, stream=""):
    return SchoolClass.objects.create(academic_year=year, year_group=year_group, stream=stream)


def make_student(school, first_name="Ama", surname="Mensah", **fields):
    defaults = {
        "date_of_birth": date(2019, 3, 14),
        "gender": "F",
        "admission_date": date(2026, 9, 8),
    }
    return services.admit_student(
        school, first_name=first_name, surname=surname, **{**defaults, **fields}
    )


def make_parent(school, phone="024 123 4567", first_name="Akua", surname="Mensah", **fields):
    return services.create_parent(
        school, phone=phone, first_name=first_name, surname=surname, **fields
    )


def make_staff(
    school, username="k.mensah", roles_held=("Teacher",), first_name="Kofi", surname="Mensah", **fields
):
    return services.create_staff(
        school,
        username=username,
        first_name=first_name,
        surname=surname,
        roles_held=list(roles_held),
        **fields,
    )
```

`backend/tests/people/test_people.py`:
```python
from datetime import date

import pytest
from django.db import IntegrityError, transaction

from apps.audit.models import AuditLog
from apps.people import services
from apps.people.models import Student
from apps.people.student_ids import is_valid_student_id
from tests.helpers import jpeg_upload, sign_in
from tests.records import make_class, make_parent, make_staff, make_student, make_year

pytestmark = pytest.mark.django_db
START = date(2026, 9, 8)


def test_admitting_a_pupil_gives_a_checked_student_id(school):
    student = make_student(school)
    assert student.school == school and student.student_id.startswith("26")
    assert is_valid_student_id(student.student_id) and student.status == "ACTIVE"
    assert AuditLog.objects.get(action="CREATED").entity_id == str(student.pk)


def test_student_ids_are_unique_within_a_school(school):
    student = make_student(school)
    with pytest.raises(IntegrityError), transaction.atomic():
        Student.objects.create(
            school=school,
            student_id=student.student_id,
            first_name="Kofi",
            surname="Boateng",
            date_of_birth=date(2018, 1, 1),
            gender="M",
            admission_date=START,
        )


def test_status_changes_need_a_reason_and_are_audited(school):
    student = make_student(school)
    with pytest.raises(ValueError, match="reason"):
        services.change_student_status(student, Student.Status.TRANSFERRED, reason=" ")
    services.change_student_status(student, Student.Status.TRANSFERRED, reason="Moved to Accra")
    entry = AuditLog.objects.get(action="STATUS_CHANGED")
    assert entry.old_value == {"status": "ACTIVE"} and entry.new_value == {"status": "TRANSFERRED"}
    assert entry.reason == "Moved to Accra"


def test_parents_get_an_account_awaiting_activation(school, other_school):
    parent = make_parent(school, title="Mrs")
    user = parent.user
    assert parent.phone == "+233241234567" and user.login == "+233241234567"
    assert user.kind == "parent" and user.school == school and not user.has_usable_password()
    assert user.groups.filter(name="Parent").exists()
    assert make_parent(other_school).school == other_school  # the same number at another school
    with pytest.raises(IntegrityError), transaction.atomic():
        make_parent(school)


def test_siblings_share_a_parent_but_never_across_schools(school, other_school):
    parent = make_parent(school)
    for first_name in ("Ama", "Kojo"):
        child = make_student(school, first_name=first_name)
        services.link_guardian(parent, child, "MOTHER", is_primary_contact=True)
    assert parent.guardianships.count() == 2
    with pytest.raises(ValueError, match="different schools"):
        services.link_guardian(parent, make_student(other_school), "MOTHER")


def test_one_open_enrolment_per_pupil_per_year(school, other_school):
    year = make_year(school)
    student = make_student(school)
    enrolment = services.enrol(student, make_class(year, "basic_2", "A"), start_date=START)
    assert enrolment.academic_year == year and enrolment.school == school
    with pytest.raises(IntegrityError), transaction.atomic():
        services.enrol(student, make_class(year, "basic_2", "B"), start_date=date(2026, 10, 1))
    with pytest.raises(ValueError, match="different schools"):
        services.enrol(make_student(other_school), make_class(year, "basic_3"), start_date=START)


def test_staff_accounts_hold_staff_roles_only(school):
    staff = make_staff(school, roles_held=["Teacher", "Head Teacher"], phone="020 123 4567")
    assert staff.user.kind == "staff" and staff.user.login == "k.mensah"
    assert sorted(staff.user.groups.values_list("name", flat=True)) == ["Head Teacher", "Teacher"]
    assert staff.phone == staff.user.phone == "+233201234567"
    for number, role in enumerate(("Parent", "Platform Admin")):
        with pytest.raises(ValueError, match="staff role"):
            make_staff(school, username=f"someone{number}", roles_held=[role])


def test_contacts_and_pickup_people(school):
    student = make_student(school)
    mother = services.add_emergency_contact(
        student, name="Akua Mensah", phone="024 123 4567", relationship="Mother"
    )
    uncle = services.add_emergency_contact(
        student, name="Yaw Mensah", phone="055 987 6543", relationship="Uncle"
    )
    assert (mother.priority, uncle.priority) == (1, 2) and uncle.phone == "+233559876543"
    person = services.add_pickup_person(
        student, name="Kwame Asante", phone="055 111 2222", relationship="Driver", valid_from=START
    )
    assert person.school == school
    assert AuditLog.objects.filter(entity_type="people.pickupperson").count() == 1


def test_photos_are_filed_by_school_under_a_random_name(school):
    student = make_student(school, photo=jpeg_upload("ama-mensah.jpg"))
    assert student.photo.name.startswith(f"schools/{school.pk}/student/")
    assert "ama" not in student.photo.name and student.photo.name.endswith(".jpg")


def test_pupils_from_basic_4_can_be_given_a_sign_in(api, school):
    year = make_year(school)
    younger = make_student(school)
    services.enrol(younger, make_class(year, "basic_3"), start_date=START)
    with pytest.raises(ValueError, match="Basic 4"):
        services.give_student_login(younger, "first password 1")
    older = make_student(school, first_name="Kojo")
    services.enrol(older, make_class(year, "basic_5"), start_date=START)
    user = services.give_student_login(older, "first password 1")
    assert user.kind == "student" and user.must_change_password and older.user == user
    response = sign_in(api, older.student_id, "first password 1", kind="student")
    assert response.json()["status"] == "signed_in"
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/people -q`
Expected: ERROR, `ModuleNotFoundError: No module named 'apps.people.services'`

- [ ] **Step 3: Write the models**

`backend/apps/people/models.py`:
```python
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
            models.UniqueConstraint(
                fields=["student", "priority"], name="people_contact_priority"
            )
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
```

Run `.venv/Scripts/python manage.py makemigrations people --name people`.

- [ ] **Step 4: Write the services**

`backend/apps/people/services.py`:
```python
"""Admitting pupils and recording their families and staff (Phase 1 spec §3.2).

The changes the spec asks to audit (§11.3) are recorded here: admissions, status changes,
enrolments, pick-up people, guardians and new accounts.
"""

from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.db import transaction

from apps.academics.structure import BANDS
from apps.accounts import roles
from apps.accounts.identifiers import normalise_identifier
from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.phones import normalise_gh_phone
from apps.people.models import (
    EmergencyContact,
    Enrolment,
    Guardianship,
    Parent,
    PickupPerson,
    Staff,
    Student,
)
from apps.people.student_ids import allocate_student_id

STAFF_ROLES = frozenset(roles.SCHOOL_ROLES) - {roles.PARENT, roles.STUDENT}


@transaction.atomic
def admit_student(
    school, *, first_name, surname, date_of_birth, gender, admission_date, by=None, **fields
) -> Student:
    student = Student.objects.create(
        school=school,
        student_id=allocate_student_id(school, admission_date.year),
        first_name=first_name,
        surname=surname,
        date_of_birth=date_of_birth,
        gender=gender,
        admission_date=admission_date,
        **fields,
    )
    record(AuditLog.Action.CREATED, actor=by, entity=student, new={"student_id": student.student_id})
    return student


def change_student_status(student, status: str, *, reason: str, by=None) -> Student:
    """Pupils are never deleted; leaving, transfer or suspension is a status with a reason."""
    if not reason.strip():
        raise ValueError("Give a reason for the status change.")
    old = student.status
    student.status = status
    student.save(update_fields=["status"])
    record(
        AuditLog.Action.STATUS_CHANGED,
        actor=by,
        entity=student,
        old={"status": old},
        new={"status": status},
        reason=reason,
    )
    return student


@transaction.atomic
def create_parent(school, *, phone, first_name, surname, by=None, **fields) -> Parent:
    """The account is made at admission and waits for the parent to activate it (§5.2)."""
    phone = normalise_gh_phone(phone)
    user = User.objects.create_user(
        phone,
        kind=User.Kind.PARENT,
        school=school,
        display_name=f"{first_name} {surname}",
        phone=phone,
    )
    user.groups.add(Group.objects.get(name=roles.PARENT))
    parent = Parent.objects.create(
        school=school, user=user, phone=phone, first_name=first_name, surname=surname, **fields
    )
    record(
        AuditLog.Action.USER_CREATED,
        actor=by,
        entity=user,
        new={"kind": "parent", "roles": [roles.PARENT]},
    )
    return parent


def link_guardian(
    parent, student, relationship: str, *, is_payer=False, is_primary_contact=False, by=None
) -> Guardianship:
    link = Guardianship.objects.create(
        parent=parent,
        student=student,
        relationship=relationship,
        is_payer=is_payer,
        is_primary_contact=is_primary_contact,
    )
    record(
        AuditLog.Action.CREATED,
        actor=by,
        entity=link,
        new={"parent": parent.pk, "student": student.pk, "relationship": relationship},
    )
    return link


@transaction.atomic
def create_staff(
    school, *, username, first_name, surname, roles_held, by=None, phone="", **fields
) -> Staff:
    unknown = set(roles_held) - STAFF_ROLES
    if unknown:
        raise ValueError(f"Not a staff role: {', '.join(sorted(unknown))}.")
    login = normalise_identifier(User.Kind.STAFF, username)
    phone = normalise_gh_phone(phone) if phone else ""
    user = User.objects.create_user(
        login,
        kind=User.Kind.STAFF,
        school=school,
        display_name=f"{first_name} {surname}",
        phone=phone,
    )
    user.groups.set(Group.objects.filter(name__in=roles_held))
    staff = Staff.objects.create(
        school=school, user=user, first_name=first_name, surname=surname, phone=phone, **fields
    )
    record(
        AuditLog.Action.USER_CREATED,
        actor=by,
        entity=user,
        new={"kind": "staff", "roles": sorted(roles_held)},
    )
    return staff


def enrol(student, school_class, *, start_date, by=None) -> Enrolment:
    enrolment = Enrolment.objects.create(
        student=student, school_class=school_class, start_date=start_date
    )
    record(
        AuditLog.Action.CREATED,
        actor=by,
        entity=enrolment,
        new={"student": student.student_id, "class": school_class.name},
    )
    return enrolment


def add_emergency_contact(student, *, name, phone, relationship) -> EmergencyContact:
    """Any Ghana number will do: a contact may only have a landline."""
    return EmergencyContact.objects.create(
        student=student,
        name=name,
        phone=normalise_gh_phone(phone, mobile_only=False),
        relationship=relationship,
        priority=student.emergency_contacts.count() + 1,
    )


def add_pickup_person(
    student, *, name, phone, relationship, valid_from, valid_to=None, by=None, **fields
) -> PickupPerson:
    person = PickupPerson.objects.create(
        student=student,
        name=name,
        phone=normalise_gh_phone(phone),
        relationship=relationship,
        valid_from=valid_from,
        valid_to=valid_to,
        **fields,
    )
    record(
        AuditLog.Action.CREATED,
        actor=by,
        entity=person,
        new={"student": student.student_id, "name": name},
    )
    return person


@transaction.atomic
def give_student_login(student, password: str, *, by=None) -> User:
    """Pupils from Basic 4 sign in with their Student ID and choose their own password first."""
    enrolment = (
        student.enrolments.filter(end_date__isnull=True).select_related("school_class").first()
    )
    if enrolment is None or not BANDS[enrolment.school_class.band].student_login:
        raise ValueError("Only pupils from Basic 4 up sign in.")
    user = User(
        login=student.student_id,
        kind=User.Kind.STUDENT,
        school=student.school,
        display_name=f"{student.first_name} {student.surname}",
        must_change_password=True,
    )
    validate_password(password, user)
    user.set_password(password)
    user.save()
    user.groups.add(Group.objects.get(name=roles.STUDENT))
    student.user = user
    student.save(update_fields=["user"])
    record(
        AuditLog.Action.USER_CREATED,
        actor=by,
        entity=user,
        new={"kind": "student", "roles": [roles.STUDENT]},
    )
    return user
```

- [ ] **Step 5: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/people tests/academics -q`
Expected: all pass.

- [ ] **Step 6: Migrate, check and commit**

Run: `.venv/Scripts/python manage.py migrate -v0 && .venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff format . && .venv/Scripts/python -m ruff check .`

```bash
git add backend/apps/people backend/tests/records.py backend/tests/people
git commit -m "Add pupils, parents, guardians, contacts, pick-up people, staff and enrolments"
```

---

### Task 4: Class teachers and teaching assignments per term

**Files:**
- Modify: `backend/apps/academics/models.py` (appends the two assignment models)
- Create: `backend/apps/academics/migrations/0002_assignments.py` (generated)
- Test: `backend/tests/academics/test_assignments.py`

**Interfaces:**
- Consumes: `Staff` (Task 3); `SchoolClass`, `Term`, `Subject`, `same_school` (Task 1).
- Produces:
  - **`ClassTeacherAssignment(school_class, staff, term)`**: one per class per term.
  - **`TeachingAssignment(staff, school_class, subject, term)`**: the subject must be taught in the class's band, and the term must be in the class's school year.
  - **Related names:** `school_class.class_teachers`, `school_class.teaching`, `staff.class_teacher_of`, `staff.teaching`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/academics/test_assignments.py`:
```python
import pytest
from django.db import IntegrityError, transaction

from apps.academics.models import ClassTeacherAssignment, Subject, TeachingAssignment
from tests.records import make_class, make_staff, make_term, make_year

pytestmark = pytest.mark.django_db


def test_one_class_teacher_per_class_per_term(school):
    year = make_year(school)
    term = make_term(year)
    school_class = make_class(year, "basic_2", "A")
    made = ClassTeacherAssignment.objects.create(
        school_class=school_class, staff=make_staff(school), term=term
    )
    assert made.school == school
    with pytest.raises(IntegrityError), transaction.atomic():
        ClassTeacherAssignment.objects.create(
            school_class=school_class, staff=make_staff(school, username="ama.owusu"), term=term
        )


def test_assignments_stay_within_one_school_and_year(school, other_school):
    year = make_year(school)
    term = make_term(year)
    school_class = make_class(year, "basic_2")
    with pytest.raises(ValueError, match="different schools"):
        ClassTeacherAssignment.objects.create(
            school_class=school_class, staff=make_staff(other_school), term=term
        )
    old_term = make_term(make_year(school, "2025/2026", current=False))
    with pytest.raises(ValueError, match="school year"):
        ClassTeacherAssignment.objects.create(
            school_class=school_class, staff=make_staff(school), term=old_term
        )


def test_subjects_are_taught_only_in_their_bands(school):
    year = make_year(school)
    term = make_term(year)
    maths = Subject.objects.create(
        school=school, name="Mathematics", code="MATH", bands=["lower_primary", "jhs"]
    )
    literacy = Subject.objects.create(
        school=school, name="Language and Literacy", code="LL", bands=["kg"], is_learning_area=True
    )
    teacher = make_staff(school)
    school_class = make_class(year, "basic_2")
    assignment = TeachingAssignment.objects.create(
        staff=teacher, school_class=school_class, subject=maths, term=term
    )
    assert assignment.school == school
    with pytest.raises(ValueError, match="not taught"):
        TeachingAssignment.objects.create(
            staff=teacher, school_class=school_class, subject=literacy, term=term
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/academics/test_assignments.py -q`
Expected: ERROR, `ImportError: cannot import name 'ClassTeacherAssignment'`

- [ ] **Step 3: Add the assignment models**

Append to `backend/apps/academics/models.py`:
```python


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
    school_class = models.ForeignKey(
        SchoolClass, on_delete=models.CASCADE, related_name="teaching"
    )
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
```

In the module docstring, change `classes and subjects (Phase 1 spec §3.1), per school.` to `classes, subjects and assignments (Phase 1 spec §3.1), per school.`.

Run `.venv/Scripts/python manage.py makemigrations academics --name assignments`.

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/academics -q`
Expected: all pass.

- [ ] **Step 5: Migrate, check and commit**

Run: `.venv/Scripts/python manage.py migrate -v0 && .venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff format . && .venv/Scripts/python -m ruff check .`

```bash
git add backend/apps/academics backend/tests/academics
git commit -m "Add class teacher and teaching assignments per term"
```

---

### Task 5: Consents for pupils and parents

**Files:**
- Rewrite: `backend/apps/consent/models.py` (adds `Consent`)
- Create: `backend/apps/consent/services.py`, `backend/apps/consent/migrations/0002_consent.py` (generated)
- Modify: `backend/apps/audit/models.py` (two actions)
- Test: `backend/tests/consent/test_consents.py`

**Interfaces:**
- Consumes: `Student`, `Parent` (Task 3); `PrivacyNotice` (Plan 2); `SchoolOwned`, `same_school`.
- Produces:
  - **`Consent`:** `school`, `student` or `parent`, `type` (`Type.PHOTO_USE|MEDICAL_SHARING|SMS_CONTACT|SCHOOL_TRIPS`), `given`, `given_at`, `withdrawn_at`, `recorded_by`, `privacy_notice`. There is one row per subject and type.
  - **`services`:** `set_consent(subject, consent_type, given, *, by=None) -> Consent`, `has_consent(subject, consent_type) -> bool`, `photo_allowed(student) -> bool`.
  - **Audit actions:** `AuditLog.Action.CONSENT_GIVEN` and `CONSENT_WITHDRAWN`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/consent/test_consents.py`:
```python
from datetime import date

import pytest
from django.db import IntegrityError, transaction

from apps.audit.models import AuditLog
from apps.consent.models import Consent, PrivacyNotice
from apps.consent.services import photo_allowed, set_consent
from tests.records import make_parent, make_student

pytestmark = pytest.mark.django_db


def test_a_consent_is_about_a_pupil_or_a_parent_never_both(school):
    student = make_student(school)
    parent = make_parent(school)
    for subject in ({"student": student, "parent": parent}, {}):
        with pytest.raises(IntegrityError), transaction.atomic():
            Consent.objects.create(school=school, type="PHOTO_USE", given=True, **subject)


def test_given_withdrawn_and_given_again_is_one_row_with_its_history_audited(school):
    PrivacyNotice.objects.create(
        school=school, version="1.0", body="How we use data.", effective_from=date(2026, 1, 1)
    )
    student = make_student(school)
    consent = set_consent(student, Consent.Type.PHOTO_USE, True)
    assert consent.given and consent.given_at and consent.privacy_notice.version == "1.0"
    assert consent.school == school and photo_allowed(student)
    set_consent(student, Consent.Type.PHOTO_USE, False)
    consent.refresh_from_db()
    assert not consent.given and consent.withdrawn_at and not photo_allowed(student)
    set_consent(student, Consent.Type.PHOTO_USE, True)
    assert Consent.objects.count() == 1
    actions = AuditLog.objects.filter(entity_type="consent.consent").order_by("id")
    assert list(actions.values_list("action", flat=True)) == [
        "CONSENT_GIVEN",
        "CONSENT_WITHDRAWN",
        "CONSENT_GIVEN",
    ]


def test_sms_consent_is_for_parents_and_the_rest_for_pupils(school):
    with pytest.raises(ValueError, match="not recorded"):
        set_consent(make_student(school), Consent.Type.SMS_CONTACT, True)
    parent = make_parent(school)
    with pytest.raises(ValueError, match="not recorded"):
        set_consent(parent, Consent.Type.PHOTO_USE, True)
    assert set_consent(parent, Consent.Type.SMS_CONTACT, True).parent == parent


def test_without_a_recorded_consent_there_is_no_photo(school):
    assert not photo_allowed(make_student(school))
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/consent/test_consents.py -q`
Expected: ERROR, `ImportError: cannot import name 'Consent'`

- [ ] **Step 3: Write the model, services and audit actions**

`backend/apps/consent/models.py`:
```python
from datetime import date

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.school.models import SchoolOwned, same_school

FORMAT_HELP = (
    "Separate paragraphs with a blank line. Start a line with '## ' for a heading "
    "or '- ' for a list item."
)


class PrivacyNotice(models.Model):
    """A versioned privacy notice (Data Protection Act 2012, Act 843).

    Each school has its own; a notice with no school is the platform's own (amendment §6).
    """

    school = models.ForeignKey(
        "school.School",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="+",
        help_text="Empty for the platform's own notice.",
    )
    version = models.CharField(max_length=20)
    title = models.CharField(max_length=120, default="Privacy notice")
    body = models.TextField(help_text=FORMAT_HELP)
    effective_from = models.DateField()
    is_draft = models.BooleanField(
        default=True,
        help_text="Untick once the wording has been reviewed. Drafts keep the site in preview.",
    )

    class Meta:
        ordering = ["-effective_from", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["school", "version"], name="consent_notice_version")
        ]

    def __str__(self) -> str:
        return f"{self.title} v{self.version}"

    @classmethod
    def current(cls, school=None, today: date | None = None) -> PrivacyNotice | None:
        return cls.objects.filter(
            school=school, effective_from__lte=today or timezone.localdate()
        ).first()


class Consent(SchoolOwned):
    """A pupil's or a parent's consent (Phase 1 spec §3.5). Its history is in the audit log.

    SMS_CONTACT covers non-essential messages only: safety, security and payment messages,
    sign-in codes among them, cannot be switched off.
    """

    class Type(models.TextChoices):
        PHOTO_USE = "PHOTO_USE", "Photos may be used"
        MEDICAL_SHARING = "MEDICAL_SHARING", "Medical details may be shared"
        SMS_CONTACT = "SMS_CONTACT", "Non-essential SMS messages"
        SCHOOL_TRIPS = "SCHOOL_TRIPS", "School trips"

    student = models.ForeignKey(
        "people.Student", null=True, blank=True, on_delete=models.CASCADE, related_name="consents"
    )
    parent = models.ForeignKey(
        "people.Parent", null=True, blank=True, on_delete=models.CASCADE, related_name="consents"
    )
    type = models.CharField(max_length=20, choices=Type.choices)
    given = models.BooleanField()
    given_at = models.DateTimeField(null=True, blank=True)
    withdrawn_at = models.DateTimeField(null=True, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    privacy_notice = models.ForeignKey(
        PrivacyNotice,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
        help_text="The notice in force when it was recorded",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(student__isnull=False, parent__isnull=True)
                | Q(student__isnull=True, parent__isnull=False),
                name="consent_one_subject",
            ),
            models.UniqueConstraint(
                fields=["student", "type"],
                condition=Q(student__isnull=False),
                name="consent_student_type",
            ),
            models.UniqueConstraint(
                fields=["parent", "type"],
                condition=Q(parent__isnull=False),
                name="consent_parent_type",
            ),
        ]

    def __str__(self):
        return f"{self.get_type_display()}: {'given' if self.given else 'not given'}"

    def save(self, *args, **kwargs):
        subjects = [subject for subject in (self.student, self.parent) if subject is not None]
        if subjects:
            self.school_id = same_school(*subjects)
        super().save(*args, **kwargs)
```

`backend/apps/consent/services.py`:
```python
"""Recording consent given or withdrawn (Phase 1 spec §3.5, §11.3)."""

from django.utils import timezone

from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.consent.models import Consent, PrivacyNotice
from apps.people.models import Parent, Student

PARENT_TYPES = {Consent.Type.SMS_CONTACT}


def _field(subject, consent_type: str) -> str:
    if isinstance(subject, Student) and consent_type not in PARENT_TYPES:
        return "student"
    if isinstance(subject, Parent) and consent_type in PARENT_TYPES:
        return "parent"
    raise ValueError(f"{Consent.Type(consent_type).label} is not recorded for this person.")


def set_consent(subject, consent_type: str, given: bool, *, by=None) -> Consent:
    """Give or withdraw one consent. The row keeps the latest answer; the audit log keeps all."""
    field = _field(subject, consent_type)
    consent = Consent.objects.filter(**{field: subject, "type": consent_type}).first()
    consent = consent or Consent(**{field: subject, "type": consent_type})
    now = timezone.now()
    consent.given = given
    if given:
        consent.given_at, consent.withdrawn_at = now, None
    else:
        consent.withdrawn_at = now
    consent.recorded_by = by
    consent.privacy_notice = PrivacyNotice.current(subject.school)
    consent.save()
    action = AuditLog.Action.CONSENT_GIVEN if given else AuditLog.Action.CONSENT_WITHDRAWN
    record(action, actor=by, entity=consent, new={"type": consent_type, field: subject.pk})
    return consent


def has_consent(subject, consent_type: str) -> bool:
    field = "student" if isinstance(subject, Student) else "parent"
    return Consent.objects.filter(**{field: subject, "type": consent_type, "given": True}).exists()


def photo_allowed(student) -> bool:
    """Without photo consent, screens show the pupil's initials instead (§3.5)."""
    return has_consent(student, Consent.Type.PHOTO_USE)
```

In `backend/apps/audit/models.py`, after `VIEWED_RESTRICTED = …`, add:
```python
        CONSENT_GIVEN = "CONSENT_GIVEN", "Consent given"
        CONSENT_WITHDRAWN = "CONSENT_WITHDRAWN", "Consent withdrawn"
```

Run `.venv/Scripts/python manage.py makemigrations consent --name consent`, then `.venv/Scripts/python manage.py makemigrations --check --dry-run`. The audit change needs no migration, because `action` has no choices.

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/consent -q`
Expected: all pass.

- [ ] **Step 5: Migrate, check and commit**

Run: `.venv/Scripts/python manage.py migrate -v0 && .venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff format . && .venv/Scripts/python -m ruff check .`

```bash
git add backend/apps/consent backend/apps/audit/models.py backend/tests/consent
git commit -m "Record pupils' and parents' consents, with their history in the audit log"
```

---

### Task 6: Demo rules: no SMS to demo numbers, converting a record, demo sign-ins in development only

**Files:**
- Create: `backend/apps/people/demo.py`
- Modify: `backend/apps/notifications/sms.py`, `backend/apps/audit/models.py`, `backend/config/settings.py`, `backend/config/settings_test.py`, `backend/.env.example`
- Test: `backend/tests/people/test_demo_rules.py`

**Interfaces:**
- Consumes: the Task 3 models; `send_sms` (Plan 3).
- Produces:
  - **`demo.is_demo_only_phone(phone) -> bool`**.
  - **`demo.mark_real(item, *, by=None)`**, for any model with `is_demo`. It is audited as `DEMO_CONVERTED`.
  - **`send_sms`** refuses demo-only numbers, with `error="demo_recipient"`.
  - **Setting `DEMO_LOGINS_ENABLED`** (default off). Importing settings with it on and `DJANGO_DEBUG` off raises `ImproperlyConfigured`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/people/test_demo_rules.py`:
```python
import os
import subprocess
import sys
from pathlib import Path

import pytest

from apps.audit.models import AuditLog
from apps.notifications.backends import MemoryBackend
from apps.notifications.models import SmsMessage
from apps.notifications.sms import Purpose, send_sms
from apps.people import services
from apps.people.demo import is_demo_only_phone, mark_real
from tests.records import make_parent, make_staff, make_student

pytestmark = pytest.mark.django_db
PHONE = "+233241234567"
BACKEND = Path(__file__).resolve().parents[2]


def text(to=PHONE):
    return send_sms(to, "Hello", purpose=Purpose.SIGN_IN_CODE)


def test_numbers_linked_only_to_demo_records_are_never_texted(school):
    make_parent(school, is_demo=True)
    message = text()
    assert message.status == SmsMessage.Status.REFUSED and message.error == "demo_recipient"
    assert MemoryBackend.outbox == []


def test_a_real_person_with_the_same_number_is_texted(school, other_school):
    make_parent(school, is_demo=True)
    make_staff(other_school, phone=PHONE)
    assert text().status == SmsMessage.Status.SENT


def test_demo_pupils_emergency_contacts_are_not_texted(school):
    student = make_student(school, is_demo=True)
    services.add_emergency_contact(
        student, name="Yaw Mensah", phone="055 987 6543", relationship="Uncle"
    )
    assert is_demo_only_phone("+233559876543")
    assert not is_demo_only_phone("+233201112222")  # on no record at all


def test_demo_parents_get_the_usual_reply_and_no_code(api, school):
    make_parent(school, is_demo=True)
    response = api.post("/api/auth/parent/request-code", {"phone": "024 123 4567"}, format="json")
    assert response.json() == {"message": "If this number is registered, a code has been sent."}
    assert MemoryBackend.outbox == []


def test_converting_a_demo_record_is_audited_and_lifts_the_sms_ban(school):
    parent = make_parent(school, is_demo=True)
    mark_real(parent)
    parent.refresh_from_db()
    assert not parent.is_demo
    assert AuditLog.objects.get(action="DEMO_CONVERTED").entity_id == str(parent.pk)
    assert text().status == SmsMessage.Status.SENT


def import_settings(debug: str):
    env = {
        **os.environ,
        "DJANGO_SECRET_KEY": "settings-check-only-0123456789abcdefghijklmnopqrstuvwxyz",
        "DJANGO_DEBUG": debug,
        "DEMO_LOGINS_ENABLED": "true",
        "DATABASE_URL": "sqlite:///unused.sqlite3",
    }
    return subprocess.run(
        [sys.executable, "-c", "import config.settings"],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
    )


def test_demo_sign_ins_are_refused_outside_development():
    refused = import_settings("false")
    assert refused.returncode != 0 and "DEMO_LOGINS_ENABLED" in refused.stderr
    assert import_settings("true").returncode == 0
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/people/test_demo_rules.py -q`
Expected: ERROR, `ModuleNotFoundError: No module named 'apps.people.demo'`

- [ ] **Step 3: Write the demo rules**

`backend/apps/people/demo.py`:
```python
"""Demo records (Phase 1 spec §9): flagged everywhere, never texted, convertible to real ones."""

from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.people.models import EmergencyContact, Parent, PickupPerson, Staff


def is_demo_only_phone(phone: str) -> bool:
    """True when the number is on demo records and on no real one. Demo numbers are made up and
    may belong to real people, so they are never texted."""
    on_demo = (
        Parent.objects.filter(phone=phone, is_demo=True).exists()
        or Staff.objects.filter(phone=phone, is_demo=True).exists()
        or EmergencyContact.objects.filter(phone=phone, student__is_demo=True).exists()
        or PickupPerson.objects.filter(phone=phone, is_demo=True).exists()
    )
    return on_demo and not (
        Parent.objects.filter(phone=phone, is_demo=False).exists()
        or Staff.objects.filter(phone=phone, is_demo=False).exists()
        or EmergencyContact.objects.filter(phone=phone, student__is_demo=False).exists()
        or PickupPerson.objects.filter(phone=phone, is_demo=False).exists()
        or User.objects.filter(
            phone=phone, parent_profile__isnull=True, staff_profile__isnull=True
        ).exists()
    )


def mark_real(item, *, by=None):
    """The Administrator ticked "This is now a real record" (§9)."""
    if item.is_demo:
        item.is_demo = False
        item.save(update_fields=["is_demo"])
        record(AuditLog.Action.DEMO_CONVERTED, actor=by, entity=item)
    return item
```

In `backend/apps/notifications/sms.py`:
- Add `from apps.people.demo import is_demo_only_phone` after the `SmsMessage` import.
- Replace `    if limit and _sent_recently(to, purpose, limit[1]) >= limit[0]:` with:
```python
    if is_demo_only_phone(to):
        # Demo numbers are made up and may belong to real people (Phase 1 spec §9).
        message.status, message.error = SmsMessage.Status.REFUSED, "demo_recipient"
    elif limit and _sent_recently(to, purpose, limit[1]) >= limit[0]:
```

In `backend/apps/audit/models.py`, after `CONSENT_WITHDRAWN = …`, add:
```python
        DEMO_CONVERTED = "DEMO_CONVERTED", "Demo record made real"
```

In `backend/config/settings.py`:
- Add `from django.core.exceptions import ImproperlyConfigured` after `import environ`.
- After the `SMS_FILE_PATH` line, add:
```python

# Phase 1 spec §9: seed_demo adds one sign-in per role for trying the system. Development only.
DEMO_LOGINS_ENABLED = env.bool("DEMO_LOGINS_ENABLED", default=False)
if DEMO_LOGINS_ENABLED and not DEBUG:
    raise ImproperlyConfigured("DEMO_LOGINS_ENABLED is for development only (Phase 1 spec §9).")
```

In `backend/config/settings_test.py`, append `DEMO_LOGINS_ENABLED = False`, so a developer's `.env` never changes test results.

In `backend/.env.example`, append:
```
# Development only: seed_demo also makes one demo sign-in per role and prints the password.
# DEMO_LOGINS_ENABLED=true
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/people tests/notifications tests/accounts -q`
Expected: all pass.

- [ ] **Step 5: Check and commit**

Run: `.venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff format . && .venv/Scripts/python -m ruff check .`

```bash
git add backend/apps/people/demo.py backend/apps/notifications/sms.py backend/apps/audit/models.py backend/config backend/.env.example backend/tests/people
git commit -m "Never text demo numbers, audit demo-to-real conversions and keep demo sign-ins to development"
```

---

### Task 7: `seed_demo`: a realistic demo school

**Files:**
- Create: `backend/apps/people/demo_data.py`, `backend/apps/people/seeding.py`, `backend/apps/people/management/__init__.py`, `backend/apps/people/management/commands/__init__.py`, `backend/apps/people/management/commands/seed_demo.py`
- Test: `backend/tests/people/test_seed_demo.py`

**Interfaces:**
- Consumes: everything in Tasks 1–6.
- Produces:
  - **`seeding.seed_demo(school, *, pupils=250, seed=1, today=None) -> DemoResult`**:
    - `DemoResult(counts: dict[str, int], password: str, logins: list[tuple[role, login]])`.
    - It raises `ValueError` when the school already has pupils.
    - It reuses an existing school year, its terms, classes and subjects.
  - **`manage.py seed_demo --school SLUG [--pupils N] [--seed N]`**.
  - **What it makes:**
    - The current school year with three terms and their calendar.
    - One class per year group the school teaches, plus a second stream for two of `basic_1`, `kg_1`, `basic_4`, `nursery_1`, `basic_7` (the first two the school teaches).
    - Curriculum subjects for the taught bands.
    - Staff for every role the school needs, with class-teacher and teaching assignments for the current term.
    - Families of one to three children, with parents (70% two parents), emergency contacts (about 3% incomplete) and pick-up people for Crèche to Basic 3.
    - A realistic mix of consents.

- [ ] **Step 1: Write the failing tests**

`backend/tests/people/test_seed_demo.py`:
```python
from datetime import date
from io import StringIO

import pytest
from django.contrib.auth.models import Group
from django.core.management import CommandError, call_command

from apps.academics.models import (
    AcademicYear,
    CalendarDay,
    ClassTeacherAssignment,
    SchoolClass,
    Subject,
    TeachingAssignment,
    Term,
)
from apps.academics.structure import YEAR_GROUPS
from apps.accounts import roles
from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.consent.models import Consent
from apps.people.models import Parent, PickupPerson, Staff, Student
from apps.people.seeding import seed_demo
from apps.people.services import STAFF_ROLES
from apps.people.student_ids import is_valid_student_id
from tests.helpers import sign_in

pytestmark = pytest.mark.django_db
TODAY = date(2026, 10, 10)


@pytest.fixture
def seeded(school, settings):
    settings.DEMO_LOGINS_ENABLED = False
    return seed_demo(school, pupils=40, today=TODAY)


def test_a_demo_school_has_a_current_year_three_terms_and_a_calendar(school, seeded):
    year = AcademicYear.objects.get(school=school)
    assert year.name == "2026/2027" and year.is_current and year.terms.count() == 3
    assert CalendarDay.objects.filter(school=school, type="HOLIDAY").exists()


def test_one_class_per_year_group_and_two_with_a_second_stream(school, seeded):
    names = {school_class.name for school_class in SchoolClass.objects.filter(school=school)}
    assert len(names) == 16 and {"Basic 1A", "Basic 1B", "KG 1A", "KG 1B", "JHS 3"} <= names
    assert seeded.counts["classes"] == 16


def test_only_the_levels_a_school_teaches(other_school, settings):
    settings.DEMO_LOGINS_ENABLED = False
    seed_demo(other_school, pupils=20, today=TODAY)
    codes = set(SchoolClass.objects.filter(school=other_school).values_list("year_group", flat=True))
    assert codes == {"kg_1", "kg_2", "basic_1", "basic_2", "basic_3"}
    subjects = Subject.objects.filter(school=other_school)
    assert all(set(subject.bands) <= {"kg", "lower_primary"} for subject in subjects)
    assert not subjects.filter(code__in=["SOC", "COMP"]).exists()


def test_pupils_are_demo_records_with_checked_ids_and_fitting_ages(school, seeded):
    students = Student.objects.filter(school=school)
    assert students.count() == 40 and all(student.is_demo for student in students)
    for student in students:
        assert is_valid_student_id(student.student_id)
        enrolment = student.enrolments.get(end_date__isnull=True)
        start, born = enrolment.academic_year.start_date, student.date_of_birth
        age = start.year - born.year - ((start.month, start.day) < (born.month, born.day))
        assert age == YEAR_GROUPS[enrolment.school_class.year_group].age_from


def test_families_contacts_pickups_and_consents(school, seeded):
    parents = Parent.objects.filter(school=school)
    assert all(parent.is_demo and not parent.user.has_usable_password() for parent in parents)
    assert any(parent.guardianships.count() > 1 for parent in parents)  # brothers and sisters
    students = Student.objects.filter(school=school)
    assert all(student.emergency_contacts.exists() for student in students)
    complete = sum(student.emergency_contacts.count() >= 2 for student in students)
    assert complete >= 0.85 * students.count()
    assert PickupPerson.objects.filter(school=school, is_demo=True).exists()
    photos = Consent.objects.filter(school=school, type="PHOTO_USE")
    assert photos.count() == 40 and photos.filter(given=False).exists()
    assert Consent.objects.filter(school=school, type="SMS_CONTACT").count() == parents.count()


def test_staff_cover_every_role_with_classes_and_subjects(school, seeded):
    staff = Staff.objects.filter(school=school)
    held = set(Group.objects.filter(user__staff_profile__in=staff).values_list("name", flat=True))
    assert held == STAFF_ROLES and all(person.is_demo for person in staff)
    term = Term.objects.get(school=school, number=1)  # 10 October falls in the first term
    for school_class in SchoolClass.objects.filter(school=school):
        assert ClassTeacherAssignment.objects.filter(school_class=school_class, term=term).count() == 1
    teaching = TeachingAssignment.objects.filter(school=school).select_related("subject", "school_class")
    assert teaching.exists()
    assert all(item.school_class.band in item.subject.bands for item in teaching)


def test_demo_records_make_one_summary_audit_entry(school, seeded):
    entries = list(AuditLog.objects.filter(school=school).values_list("action", "entity_type"))
    assert entries.count(("CREATED", "academics.term")) == 3
    assert entries.count(("CREATED", "demo")) == 1 and len(entries) == 4


def test_seed_demo_refuses_a_school_with_pupils(school, seeded):
    with pytest.raises(CommandError, match="already has pupils"):
        call_command("seed_demo", school="adsmart", pupils=5)


def test_no_demo_sign_ins_unless_enabled(school, seeded):
    assert seeded.logins == [] and seeded.password == ""
    assert not User.objects.filter(school=school).exclude(password__startswith="!").exists()


def test_demo_sign_ins_when_enabled(api, school, settings):
    settings.DEMO_LOGINS_ENABLED = True
    result = seed_demo(school, pupils=40, today=TODAY)
    logins = dict(result.logins)
    assert set(logins) == STAFF_ROLES | {roles.PARENT, roles.STUDENT}
    assert sign_in(api, logins[roles.TEACHER], result.password).json()["status"] == "signed_in"
    pupil = sign_in(api, logins[roles.STUDENT], result.password, kind="student")
    assert pupil.json()["status"] == "signed_in"


def test_the_command_reports_what_it_made(school, settings):
    settings.DEMO_LOGINS_ENABLED = False
    out = StringIO()
    call_command("seed_demo", school="adsmart", pupils=10, stdout=out)
    assert "10 pupils" in out.getvalue()
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/people/test_seed_demo.py -q`
Expected: ERROR, `ModuleNotFoundError: No module named 'apps.people.seeding'`

- [ ] **Step 3: Write the demo data and the seed**

`backend/apps/people/demo_data.py`:
```python
"""Names and wording for demo records (Phase 1 spec §9). Every person made from these is_demo."""

GIRLS = tuple(
    "Ama Akua Abena Afua Yaa Efua Akosua Adwoa Esi Araba Adjoa Naa Dede Ayeley Elikplim Dzifa "
    "Enyonam Selasi Grace Mercy Priscilla Comfort Gifty Abigail Esther Ruth Belinda Eunice "
    "Fatima Zainab Mariam Rahinatu".split()
)
BOYS = tuple(
    "Kofi Kwame Kwabena Kwaku Yaw Kwasi Kojo Ekow Fiifi Kweku Nii Kpakpo Elikem Selorm Delali "
    "Senyo Emmanuel Daniel Samuel Isaac Prince Michael Joseph Richard Eric Felix Bernard "
    "Ebenezer Godfred Abdul Ibrahim Yakubu".split()
)
SURNAMES = tuple(
    "Mensah Boateng Owusu Asante Osei Agyeman Appiah Acheampong Amoah Adjei Ofori Darko "
    "Frimpong Antwi Sarpong Bonsu Opoku Gyamfi Asamoah Yeboah Danso Quaye Lamptey Tetteh Addo "
    "Annan Quartey Ansah Amponsah Baah Kyei Ampofo Agyei Dogbe Agbeko Kpodo Mahama Abubakar "
    "Issah Alhassan Seidu Fosu Nyarko Badu Afriyie".split()
)
LANDMARKS = (
    "the Methodist church",
    "the market",
    "the clinic",
    "the lorry station",
    "the mosque",
    "the community centre",
    "the police station",
    "the filling station",
)
PICKUP_POINTS = (
    "Main road junction",
    "Lorry station",
    "Market square",
    "Church car park",
    "Filling station",
)
RELATIVES = (("Aunt", "F"), ("Uncle", "M"), ("Grandmother", "F"), ("Grandfather", "M"))
PICKUP_RELATIONSHIPS = (("Aunt", "F"), ("Uncle", "M"), ("Driver", "M"), ("Grandmother", "F"))
MOBILE_PREFIXES = ("20", "23", "24", "26", "27", "28", "50", "53", "54", "55", "57", "59")
PUPIL_CONSENTS = (("PHOTO_USE", 0.8), ("MEDICAL_SHARING", 0.9), ("SCHOOL_TRIPS", 0.75))
PARENT_CONSENTS = (("SMS_CONTACT", 0.85),)
SECOND_STREAMS = ("basic_1", "kg_1", "basic_4", "nursery_1", "basic_7")

# (name, code, bands, is_learning_area): subjects of Ghana's standards-based curriculum.
SUBJECTS = (
    ("Language and Literacy", "LL", ["nursery", "kg"], True),
    ("Numeracy", "NUM", ["nursery", "kg"], True),
    ("Our World Our People", "OWOP", ["nursery", "kg", "lower_primary", "upper_primary"], False),
    ("Creative Arts", "CA", ["nursery", "kg", "lower_primary", "upper_primary"], False),
    ("English Language", "ENG", ["lower_primary", "upper_primary", "jhs"], False),
    ("Ghanaian Language", "GHL", ["lower_primary", "upper_primary", "jhs"], False),
    ("Mathematics", "MATH", ["lower_primary", "upper_primary", "jhs"], False),
    ("Science", "SCI", ["lower_primary", "upper_primary", "jhs"], False),
    ("Religious and Moral Education", "RME", ["lower_primary", "upper_primary", "jhs"], False),
    ("Physical Education", "PE", ["lower_primary", "upper_primary", "jhs"], False),
    ("Computing", "COMP", ["upper_primary", "jhs"], False),
    ("History", "HIST", ["upper_primary"], False),
    ("Social Studies", "SOC", ["jhs"], False),
    ("Career Technology", "CT", ["jhs"], False),
    ("Creative Arts and Design", "CAD", ["jhs"], False),
)

# One of each, whatever the school teaches: (role, qualification).
SUPPORT_ROLES = (
    ("Administrator", "BSc Administration"),
    ("Proprietor", "MBA"),
    ("Head Teacher", "M.Ed. Educational Leadership"),
    ("Accountant", "HND Accountancy"),
    ("Front Desk Officer", "Diploma in Secretaryship"),
    ("School Nurse", "Diploma in Nursing"),
    ("Bookshop Keeper", "WASSCE"),
    ("Canteen Officer", "Certificate in Catering"),
    ("Transport Officer", "Certificate in Fleet Management"),
)
TEACHER_QUALIFICATIONS = (
    "Diploma in Basic Education",
    "B.Ed. Basic Education",
    "B.Ed. Mathematics",
    "B.Ed. Science",
)
CAREGIVER_QUALIFICATION = "Certificate in Early Childhood Care"
```

`backend/apps/people/seeding.py`:
```python
"""seed_demo: a realistic demo school (Phase 1 spec §9).

Every person it makes is flagged is_demo and shows a DEMO badge, and numbers linked only to
demo records are never texted. Records are written directly rather than through the services,
so the append-only audit log gets one summary entry instead of hundreds.
"""

import random
import secrets
from dataclasses import dataclass, field
from datetime import date, timedelta

from django.conf import settings
from django.contrib.auth.models import Group
from django.db import transaction
from django.utils import timezone

from apps.academics.calendar import create_term
from apps.academics.models import (
    AcademicYear,
    ClassTeacherAssignment,
    SchoolClass,
    Subject,
    TeachingAssignment,
)
from apps.academics.structure import BANDS, YEAR_GROUPS, year_groups_for
from apps.accounts import roles
from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.consent.models import Consent, PrivacyNotice
from apps.core.phones import format_gh_local
from apps.people import demo_data
from apps.people.models import (
    EmergencyContact,
    Enrolment,
    Guardianship,
    Parent,
    PickupPerson,
    Staff,
    Student,
)
from apps.people.student_ids import allocate_student_id, format_student_id

CARE_BANDS = {"creche", "nursery"}  # their classes have caregivers rather than teachers
PICKUP_BANDS = {"creche", "nursery", "kg", "lower_primary"}
MOTHER, FATHER = Guardianship.Relationship.MOTHER, Guardianship.Relationship.FATHER


@dataclass
class DemoResult:
    counts: dict[str, int]
    password: str = ""
    logins: list[tuple[str, str]] = field(default_factory=list)


class _Maker:
    """One run's random source, plus every phone number and login already taken."""

    def __init__(self, school, seed: int):
        self.school = school
        self.rng = random.Random(f"{school.slug}:{seed}")
        self.phones = set(Parent.objects.for_school(school).values_list("phone", flat=True))
        self.logins = set(User.objects.filter(school=school).values_list("login", flat=True))
        self.groups = {
            group.name: group for group in Group.objects.filter(name__in=roles.SCHOOL_ROLES)
        }
        self.offered = [group.code for group in year_groups_for(school.levels_offered)]
        self.notice = PrivacyNotice.current(school)
        self.now = timezone.now()

    def phone(self) -> str:
        while True:
            prefix = self.rng.choice(demo_data.MOBILE_PREFIXES)
            number = f"+233{prefix}{self.rng.randrange(10**7):07d}"
            if number not in self.phones:
                self.phones.add(number)
                return number

    def name(self, gender: str) -> tuple[str, str]:
        first = self.rng.choice(demo_data.GIRLS if gender == "F" else demo_data.BOYS)
        return first, self.rng.choice(demo_data.SURNAMES)

    def username(self, first: str, surname: str) -> str:
        base = f"{first}.{surname}".lower()
        login, number = base, 1
        while login in self.logins:
            number += 1
            login = f"{base}{number}"
        self.logins.add(login)
        return login

    def consent(self, kind: str, chance: float, **subject) -> Consent:
        given = self.rng.random() < chance
        return Consent(
            school=self.school,
            type=kind,
            given=given,
            given_at=self.now if given else None,
            privacy_notice=self.notice,
            **subject,
        )


@transaction.atomic
def seed_demo(school, *, pupils: int = 250, seed: int = 1, today: date | None = None) -> DemoResult:
    if Student.objects.for_school(school).exists():
        raise ValueError(
            f"{school.name} already has pupils. Demo records only go into a school without any; "
            "if they are demo records, remove them with purge_demo first."
        )
    maker = _Maker(school, seed)
    year, term = _school_year(school, today or timezone.localdate())
    classes = _classes(year)
    subjects = _subjects(school)
    staff = _staff(maker, classes, subjects, term)
    enrolled, parents = _pupils(maker, year, classes, pupils)
    counts = {
        "classes": len(classes),
        "pupils": len(enrolled),
        "parents": len(parents),
        "staff": len(staff),
    }
    record(
        AuditLog.Action.CREATED,
        school=school,
        entity_type="demo",
        new=counts,
        reason="Demo records made with manage.py seed_demo",
    )
    result = DemoResult(counts)
    if settings.DEMO_LOGINS_ENABLED:
        result.password, result.logins = _demo_logins(maker, staff, enrolled, parents)
    return result


def _school_year(school, today: date):
    """The school year containing today, September to July, with three terms (demo dates)."""
    start = today.year if today.month >= 8 else today.year - 1
    year, _ = AcademicYear.objects.get_or_create(
        school=school,
        name=f"{start}/{start + 1}",
        defaults={
            "start_date": date(start, 9, 1),
            "end_date": date(start + 1, 7, 31),
            "is_current": not AcademicYear.objects.for_school(school)
            .filter(is_current=True)
            .exists(),
        },
    )
    if not year.terms.exists():
        create_term(year, 1, date(start, 9, 8), date(start, 12, 18))
        create_term(year, 2, date(start + 1, 1, 12), date(start + 1, 4, 9))
        create_term(year, 3, date(start + 1, 5, 4), date(start + 1, 7, 30))
    terms = list(year.terms.all())
    current = next((term for term in terms if term.start_date <= today <= term.end_date), None)
    upcoming = next((term for term in terms if term.start_date > today), terms[-1])
    return year, current or upcoming


def _classes(year) -> list[SchoolClass]:
    groups = year_groups_for(year.school.levels_offered)
    offered = [group.code for group in groups]
    doubled = [code for code in demo_data.SECOND_STREAMS if code in offered][:2]
    classes = []
    for group in groups:
        for stream in ("A", "B") if group.code in doubled else ("",):
            school_class, _ = SchoolClass.objects.get_or_create(
                academic_year=year, year_group=group.code, stream=stream
            )
            classes.append(school_class)
    return classes


def _subjects(school) -> list[Subject]:
    made = []
    for name, code, bands, learning_area in demo_data.SUBJECTS:
        taught = [band for band in bands if band in school.levels_offered]
        if taught:
            subject, _ = Subject.objects.get_or_create(
                school=school,
                code=code,
                defaults={"name": name, "bands": taught, "is_learning_area": learning_area},
            )
            made.append(subject)
    return made


def _hire(maker, role: str, qualification: str, number: int, *, licensed: bool) -> Staff:
    first, surname = maker.name(maker.rng.choice("FM"))
    login = maker.username(first, surname)
    phone = maker.phone()
    user = User.objects.create_user(
        login,
        kind=User.Kind.STAFF,
        school=maker.school,
        display_name=f"{first} {surname}",
        phone=phone,
    )
    user.groups.add(maker.groups[role])
    contact = " ".join(maker.name(maker.rng.choice("FM")))
    return Staff.objects.create(
        school=maker.school,
        user=user,
        staff_number=f"ST{number:03d}",
        first_name=first,
        surname=surname,
        phone=phone,
        email=f"{login}@example.com",
        qualifications=qualification,
        licence_number=f"DEMO-{number:05d}" if licensed else "",
        emergency_contact=f"{contact}, {format_gh_local(maker.phone())}",
        is_demo=True,
    )


def _staff(maker, classes, subjects, term) -> list[tuple[Staff, str]]:
    """Every role the school needs, a class teacher per class and teachers for each subject."""
    hired: list[tuple[Staff, str]] = []

    def hire(role: str, qualification: str, licensed: bool = False) -> Staff:
        person = _hire(maker, role, qualification, len(hired) + 1, licensed=licensed)
        hired.append((person, role))
        return person

    def teacher() -> Staff:
        qualification = maker.rng.choice(demo_data.TEACHER_QUALIFICATIONS)
        return hire(roles.TEACHER, qualification, licensed=True)

    for role, qualification in demo_data.SUPPORT_ROLES:
        hire(role, qualification)
    has_jhs = any(school_class.band == "jhs" for school_class in classes)
    specialists = {subject.pk: teacher() for subject in subjects if has_jhs and "jhs" in subject.bands}
    jhs_teachers = list(specialists.values())
    for index, school_class in enumerate(classes):
        if school_class.band == "jhs":
            class_teacher = jhs_teachers[index % len(jhs_teachers)]
        elif school_class.band in CARE_BANDS:
            class_teacher = hire(roles.CAREGIVER, demo_data.CAREGIVER_QUALIFICATION)
        else:
            class_teacher = teacher()
        ClassTeacherAssignment.objects.create(
            school_class=school_class, staff=class_teacher, term=term
        )
        for subject in subjects:
            if school_class.band in subject.bands:
                # In JHS each subject has its own teacher; below JHS the class teacher teaches all.
                taught_by = specialists[subject.pk] if school_class.band == "jhs" else class_teacher
                TeachingAssignment.objects.create(
                    staff=taught_by, school_class=school_class, subject=subject, term=term
                )
    return hired


def _pupils(maker, year, classes, pupils):
    """Families of one to three children, so brothers and sisters share parents."""
    places = [classes[number % len(classes)] for number in range(pupils)]
    maker.rng.shuffle(places)
    enrolled: list[tuple[Student, SchoolClass]] = []
    parents: list[Parent] = []
    while places:
        size = maker.rng.choices((1, 2, 3), weights=(60, 30, 10))[0]
        family, places = places[:size], places[size:]
        children, family_parents = _family(maker, year, family)
        enrolled += children
        parents += family_parents
    return enrolled, parents


def _parent(maker, gender: str, surname: str, address: str) -> Parent:
    first, _ = maker.name(gender)
    phone = maker.phone()
    user = User.objects.create_user(
        phone,
        kind=User.Kind.PARENT,
        school=maker.school,
        display_name=f"{first} {surname}",
        phone=phone,
    )
    user.groups.add(maker.groups[roles.PARENT])
    with_email = maker.rng.random() < 0.3
    parent = Parent.objects.create(
        school=maker.school,
        user=user,
        title="Mr" if gender == "M" else maker.rng.choice(("Mrs", "Ms")),
        first_name=first,
        surname=surname,
        phone=phone,
        email=f"{first}.{surname}{maker.rng.randint(1, 99)}@example.com".lower()
        if with_email
        else "",
        address=address,
        is_demo=True,
    )
    Consent.objects.bulk_create(
        maker.consent(kind, chance, parent=parent) for kind, chance in demo_data.PARENT_CONSENTS
    )
    return parent


def _family(maker, year, places):
    rng = maker.rng
    surname = rng.choice(demo_data.SURNAMES)
    landmark = rng.choice(demo_data.LANDMARKS)
    address = f"House {rng.randint(1, 120)}, near {landmark}, {maker.school.town}"
    shape = rng.random()  # 70% both parents, 22% the mother alone, 8% the father alone
    parents = []
    if shape < 0.92:
        mother_surname = rng.choice(demo_data.SURNAMES) if rng.random() < 0.4 else surname
        parents.append((_parent(maker, "F", mother_surname, address), MOTHER))
    if shape >= 0.22:
        parents.append((_parent(maker, "M", surname, address), FATHER))
    father = next((parent for parent, relationship in parents if relationship == FATHER), None)
    payer = father or parents[0][0]
    contacts = [(str(parent), parent.phone, relationship.label) for parent, relationship in parents]
    if len(contacts) < 2 and rng.random() < 0.9:  # the rest show the Incomplete warning
        relationship, gender = rng.choice(demo_data.RELATIVES)
        contacts.append((" ".join(maker.name(gender)), maker.phone(), relationship))

    children = []
    start = year.start_date
    for school_class in places:
        group = YEAR_GROUPS[school_class.year_group]
        gender = rng.choice("FM")
        first, _ = maker.name(gender)
        middle = maker.name(gender)[0] if rng.random() < 0.4 else ""
        born = date(start.year - group.age_from, start.month, start.day) - timedelta(
            days=rng.randint(1, 360)
        )
        joined = start.year - rng.randint(0, min(maker.offered.index(group.code), 4))
        admitted = date(joined, 9, rng.randint(8, 20))
        student = Student.objects.create(
            school=maker.school,
            student_id=allocate_student_id(maker.school, joined),
            first_name=first,
            middle_name="" if middle == first else middle,
            surname=(father or parents[0][0]).surname,
            date_of_birth=born,
            gender=gender,
            admission_date=admitted,
            address=address,
            pickup_point=rng.choice(demo_data.PICKUP_POINTS) if rng.random() < 0.3 else "",
            is_demo=True,
        )
        Enrolment.objects.create(
            student=student, school_class=school_class, start_date=max(admitted, start)
        )
        EmergencyContact.objects.bulk_create(
            EmergencyContact(
                school=maker.school,
                student=student,
                name=name,
                phone=phone,
                relationship=relation,
                priority=priority,
            )
            for priority, (name, phone, relation) in enumerate(contacts, start=1)
        )
        for parent, relationship in parents:
            Guardianship.objects.create(
                parent=parent,
                student=student,
                relationship=relationship,
                is_payer=parent == payer,
                is_primary_contact=parent == parents[0][0],
            )
        if group.band in PICKUP_BANDS:
            for _ in range(rng.randint(1, 2)):
                relation, pickup_gender = rng.choice(demo_data.PICKUP_RELATIONSHIPS)
                PickupPerson.objects.create(
                    student=student,
                    name=" ".join(maker.name(pickup_gender)),
                    phone=maker.phone(),
                    relationship=relation,
                    valid_from=start,
                    is_demo=True,
                )
        Consent.objects.bulk_create(
            maker.consent(kind, chance, student=student)
            for kind, chance in demo_data.PUPIL_CONSENTS
        )
        children.append((student, school_class))
    return children, [parent for parent, _ in parents]


def _demo_logins(maker, staff, enrolled, parents) -> tuple[str, list[tuple[str, str]]]:
    """One sign-in per role for trying the system (§9). Development only: settings refuse
    DEMO_LOGINS_ENABLED unless DJANGO_DEBUG is on."""
    password = secrets.token_urlsafe(12)
    logins: list[tuple[str, str]] = []
    seen = set()
    for person, role in staff:
        if role not in seen:
            seen.add(role)
            person.user.set_password(password)
            person.user.save(update_fields=["password"])
            logins.append((role, person.user.login))
    if parents:
        parent = parents[0]
        parent.user.set_password(password)
        parent.user.activated_at = maker.now
        parent.user.save(update_fields=["password", "activated_at"])
        logins.append((roles.PARENT, format_gh_local(parent.phone)))
    pupil = next(
        (student for student, school_class in enrolled if BANDS[school_class.band].student_login),
        None,
    )
    if pupil is not None:
        user = User.objects.create_user(
            pupil.student_id,
            kind=User.Kind.STUDENT,
            school=maker.school,
            password=password,
            display_name=f"{pupil.first_name} {pupil.surname}",
        )
        user.groups.add(maker.groups[roles.STUDENT])
        pupil.user = user
        pupil.save(update_fields=["user"])
        logins.append((roles.STUDENT, format_student_id(pupil.student_id)))
    return password, logins
```

`backend/apps/people/management/__init__.py`:
```python

```

`backend/apps/people/management/commands/__init__.py`:
```python

```

`backend/apps/people/management/commands/seed_demo.py`:
```python
from django.core.management.base import BaseCommand, CommandError

from apps.people.seeding import seed_demo
from apps.school.models import School


class Command(BaseCommand):
    help = (
        "Fill a school with a realistic demo school (Phase 1 spec §9): a school year, classes, "
        "pupils, families and staff. Every person is marked DEMO and is never texted."
    )

    def add_arguments(self, parser):
        parser.add_argument("--school", required=True, help="The school's slug")
        parser.add_argument("--pupils", type=int, default=250)
        parser.add_argument("--seed", type=int, default=1, help="Change it for different names")

    def handle(self, *args, school, pupils, seed, **options):
        owner = School.objects.filter(slug=school).first()
        if owner is None:
            raise CommandError(f"No school has the slug {school}.")
        try:
            result = seed_demo(owner, pupils=pupils, seed=seed)
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        made = ", ".join(f"{count} {name}" for name, count in result.counts.items())
        self.stdout.write(self.style.SUCCESS(f"Demo records added to {owner.name}: {made}."))
        if result.logins:
            self.stdout.write(
                f"Demo sign-ins (development only). The password for each is {result.password}"
            )
            for role, login in result.logins:
                self.stdout.write(f"  {role}: {login}")
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/people -q`
Expected: all pass.

- [ ] **Step 5: Check and commit**

Run: `.venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff format . && .venv/Scripts/python -m ruff check .`

```bash
git add backend/apps/people backend/tests/people
git commit -m "Add seed_demo: a realistic, clearly flagged demo school for any school"
```

---

### Task 8: `purge_demo`: remove the demo records, never a real one

**Files:**
- Create: `backend/apps/people/purge.py`, `backend/apps/people/management/commands/purge_demo.py`
- Modify: `backend/apps/audit/models.py`
- Test: `backend/tests/people/test_purge_demo.py`

**Interfaces:**
- Consumes: the Task 3 and Task 5 models; `seed_demo` (Task 7) in tests.
- Produces:
  - **`purge.demo_references(school) -> list[str]`**.
  - **`purge.demo_counts(school) -> dict[str, int]`**, with keys pupils, parents, staff and pick-up people.
  - **`purge.purge_demo(school, *, by=None) -> dict[str, int]`**. It raises `DemoReferencesError(problems)`.
  - **`manage.py purge_demo --school SLUG [--yes]`**. Without `--yes` it only reports what would go.
  - **`AuditLog.Action.DEMO_PURGED`**.

- [ ] **Step 1: Write the failing tests**

`backend/tests/people/test_purge_demo.py`:
```python
from datetime import date
from io import StringIO

import pytest
from django.core.management import call_command

from apps.academics.models import SchoolClass
from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.people import services
from apps.people.models import Parent, Staff, Student
from apps.people.purge import DemoReferencesError, purge_demo
from apps.people.seeding import seed_demo
from tests.records import make_parent, make_student

pytestmark = pytest.mark.django_db
TODAY = date(2026, 10, 10)


@pytest.fixture(autouse=True)
def _no_demo_sign_ins(settings):
    settings.DEMO_LOGINS_ENABLED = False


def test_purge_removes_demo_people_and_their_accounts(school):
    seed_demo(school, pupils=20, today=TODAY)
    real_pupil = make_student(school, first_name="Real")
    real_parent = make_parent(school, phone="020 765 4321")
    counts = purge_demo(school)
    assert counts["pupils"] == 20 and counts["staff"] > 0
    assert list(Student.objects.filter(school=school)) == [real_pupil]
    assert list(Parent.objects.filter(school=school)) == [real_parent]
    assert not Staff.objects.filter(school=school).exists()
    assert set(User.objects.filter(school=school)) == {real_parent.user}
    assert SchoolClass.objects.filter(school=school).count() == 16  # the school's structure stays
    assert AuditLog.objects.filter(action="DEMO_PURGED", school=school).count() == 1


def test_purge_refuses_while_real_records_point_at_demo_ones(school):
    seed_demo(school, pupils=10, today=TODAY)
    demo_pupil = Student.objects.filter(school=school).first()
    services.link_guardian(make_parent(school, phone="020 765 4321"), demo_pupil, "GUARDIAN")
    with pytest.raises(DemoReferencesError) as refused:
        purge_demo(school)
    assert "guardian" in refused.value.problems[0]
    assert Student.objects.filter(school=school).count() == 10


def test_the_command_only_deletes_with_yes(school):
    seed_demo(school, pupils=5, today=TODAY)
    out = StringIO()
    call_command("purge_demo", school="adsmart", stdout=out)
    assert "Would delete 5 pupils" in out.getvalue() and Student.objects.count() == 5
    call_command("purge_demo", school="adsmart", yes=True, stdout=out)
    assert not Student.objects.exists()


def test_a_purged_school_can_be_seeded_again(school):
    seed_demo(school, pupils=5, today=TODAY)
    purge_demo(school)
    assert seed_demo(school, pupils=5, today=TODAY).counts["pupils"] == 5
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/people/test_purge_demo.py -q`
Expected: ERROR, `ModuleNotFoundError: No module named 'apps.people.purge'`

- [ ] **Step 3: Write the purge**

`backend/apps/people/purge.py`:
```python
"""purge_demo (Phase 1 spec §9): delete the remaining demo records, never a real one."""

from django.db import transaction
from django.db.models import Q

from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.consent.models import Consent
from apps.people.models import Guardianship, Parent, PickupPerson, Staff, Student


class DemoReferencesError(Exception):
    def __init__(self, problems: list[str]):
        super().__init__("Real records still point at demo ones.")
        self.problems = problems


def demo_references(school) -> list[str]:
    """Real records that still point at demo ones; deleting would break them."""
    mixed = (
        Guardianship.objects.for_school(school)
        .filter(
            Q(parent__is_demo=True, student__is_demo=False)
            | Q(parent__is_demo=False, student__is_demo=True)
        )
        .select_related("parent", "student")
    )
    problems = [
        f"{link.parent} is a guardian of {link.student}, but only one of them is a demo record."
        for link in mixed
    ]
    pickups = PickupPerson.objects.for_school(school).filter(is_demo=False, student__is_demo=True)
    problems += [
        f"{person.name} (a real pick-up person) is linked to the demo pupil {person.student}."
        for person in pickups.select_related("student")
    ]
    by_demo_account = Q(recorded_by__parent_profile__is_demo=True) | Q(
        recorded_by__staff_profile__is_demo=True
    )
    for_real_person = Q(student__is_demo=False) | Q(parent__is_demo=False)
    consents = Consent.objects.for_school(school).filter(by_demo_account).filter(for_real_person)
    problems += [
        f"A consent for a real record was recorded by the demo account {consent.recorded_by}."
        for consent in consents.select_related("recorded_by")
    ]
    return problems


def _demo_rows(school) -> dict:
    return {
        "pupils": Student.objects.for_school(school).filter(is_demo=True),
        "parents": Parent.objects.for_school(school).filter(is_demo=True),
        "staff": Staff.objects.for_school(school).filter(is_demo=True),
        "pick-up people": PickupPerson.objects.for_school(school).filter(is_demo=True),
    }


def demo_counts(school) -> dict[str, int]:
    return {name: rows.count() for name, rows in _demo_rows(school).items()}


@transaction.atomic
def purge_demo(school, *, by=None) -> dict[str, int]:
    problems = demo_references(school)
    if problems:
        raise DemoReferencesError(problems)
    counts = demo_counts(school)
    rows = _demo_rows(school)
    accounts = [
        *rows["pupils"].exclude(user=None).values_list("user_id", flat=True),
        *rows["parents"].values_list("user_id", flat=True),
        *rows["staff"].values_list("user_id", flat=True),
    ]
    rows["pick-up people"].delete()
    rows["pupils"].delete()  # with their contacts, enrolments, guardianships and consents
    rows["parents"].delete()
    rows["staff"].delete()  # with their class and teaching assignments
    User.objects.filter(pk__in=accounts).delete()
    record(AuditLog.Action.DEMO_PURGED, actor=by, school=school, entity_type="demo", new=counts)
    return counts
```

`backend/apps/people/management/commands/purge_demo.py`:
```python
from django.core.management.base import BaseCommand, CommandError

from apps.people.purge import DemoReferencesError, demo_counts, purge_demo
from apps.school.models import School


class Command(BaseCommand):
    help = (
        "Delete a school's demo records and demo accounts (Phase 1 spec §9). Real records stay, "
        "and nothing is deleted while a real record still points at a demo one."
    )

    def add_arguments(self, parser):
        parser.add_argument("--school", required=True, help="The school's slug")
        parser.add_argument(
            "--yes", action="store_true", help="Delete them. Without it, only report what would go."
        )

    def handle(self, *args, school, yes, **options):
        owner = School.objects.filter(slug=school).first()
        if owner is None:
            raise CommandError(f"No school has the slug {school}.")
        summary = ", ".join(f"{count} {name}" for name, count in demo_counts(owner).items())
        if not yes:
            self.stdout.write(f"Would delete {summary}. Run again with --yes to delete them.")
            return
        try:
            purge_demo(owner)
        except DemoReferencesError as exc:
            problems = "\n".join(f"- {problem}" for problem in exc.problems)
            raise CommandError(f"Real records still point at demo ones:\n{problems}") from exc
        self.stdout.write(self.style.SUCCESS(f"Deleted {summary}."))
```

In `backend/apps/audit/models.py`, after `DEMO_CONVERTED = …`, add:
```python
        DEMO_PURGED = "DEMO_PURGED", "Demo records deleted"
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/people -q`
Expected: all pass.

- [ ] **Step 5: Check and commit**

Run: `.venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff format . && .venv/Scripts/python -m ruff check .`

```bash
git add backend/apps/people backend/apps/audit/models.py backend/tests/people
git commit -m "Add purge_demo, which refuses while real records point at demo ones"
```

---

### Task 9: Django admin views, docs and the demo school in development

**Files:**
- Create: `backend/apps/academics/admin.py`, `backend/apps/people/admin.py`
- Modify: `backend/apps/consent/admin.py`, `README.md`

**Interfaces:**
- Consumes: every model above.
- Produces: development-only admin pages for every new model (`/django-admin/`, served only while `DJANGO_DEBUG` is on), and the README section "Demo school".

- [ ] **Step 1: Register the models**

`backend/apps/academics/admin.py`:
```python
from django.contrib import admin

from apps.academics.models import (
    AcademicYear,
    CalendarDay,
    ClassTeacherAssignment,
    SchoolClass,
    Subject,
    TeachingAssignment,
    Term,
)


@admin.register(AcademicYear)
class AcademicYearAdmin(admin.ModelAdmin):
    list_display = ["name", "school", "start_date", "end_date", "is_current"]
    list_filter = ["school"]


@admin.register(Term)
class TermAdmin(admin.ModelAdmin):
    list_display = ["__str__", "school", "start_date", "end_date"]
    list_filter = ["school"]


@admin.register(CalendarDay)
class CalendarDayAdmin(admin.ModelAdmin):
    list_display = ["date", "school", "type", "note"]
    list_filter = ["school", "type"]


@admin.register(SchoolClass)
class SchoolClassAdmin(admin.ModelAdmin):
    list_display = ["name", "school", "academic_year"]
    list_filter = ["school", "academic_year"]


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "school", "is_learning_area"]
    list_filter = ["school"]


@admin.register(ClassTeacherAssignment, TeachingAssignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ["__str__", "school", "term"]
    list_filter = ["school"]
```

`backend/apps/people/admin.py`:
```python
from django.contrib import admin

from apps.people.models import (
    EmergencyContact,
    Enrolment,
    Guardianship,
    Parent,
    PickupPerson,
    Staff,
    Student,
)


class EmergencyContactInline(admin.TabularInline):
    model = EmergencyContact
    extra = 0
    exclude = ["school"]


class GuardianshipInline(admin.TabularInline):
    model = Guardianship
    extra = 0
    exclude = ["school"]


class EnrolmentInline(admin.TabularInline):
    model = Enrolment
    extra = 0
    exclude = ["school", "academic_year"]


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ["student_id", "full_name", "school", "status", "is_demo"]
    list_filter = ["school", "status", "is_demo"]
    search_fields = ["student_id", "first_name", "surname"]
    readonly_fields = ["student_id"]
    inlines = [EmergencyContactInline, GuardianshipInline, EnrolmentInline]

    def has_add_permission(self, request):
        return False  # admissions go through apps.people.services.admit_student (Student IDs)


@admin.register(Parent)
class ParentAdmin(admin.ModelAdmin):
    list_display = ["__str__", "phone", "school", "is_demo"]
    list_filter = ["school", "is_demo"]
    search_fields = ["first_name", "surname", "phone"]


@admin.register(Staff)
class StaffAdmin(admin.ModelAdmin):
    list_display = ["__str__", "staff_number", "school", "employment_status", "is_demo"]
    list_filter = ["school", "employment_status", "is_demo"]
    search_fields = ["first_name", "surname", "staff_number"]


@admin.register(PickupPerson)
class PickupPersonAdmin(admin.ModelAdmin):
    list_display = ["__str__", "relationship", "school", "is_demo"]
    list_filter = ["school", "is_demo"]
```

`backend/apps/consent/admin.py`:
```python
from django.contrib import admin

from apps.consent.models import Consent, PrivacyNotice


@admin.register(PrivacyNotice)
class PrivacyNoticeAdmin(admin.ModelAdmin):
    list_display = ["title", "version", "school", "effective_from", "is_draft"]
    list_filter = ["school", "is_draft"]


@admin.register(Consent)
class ConsentAdmin(admin.ModelAdmin):
    list_display = ["__str__", "student", "parent", "school", "updated_at"]
    list_filter = ["school", "type", "given"]
```

- [ ] **Step 2: Check the configuration**

Run: `cd backend && .venv/Scripts/python manage.py check && .venv/Scripts/python manage.py makemigrations --check --dry-run`
Expected: `System check identified no issues (0 silenced).` and `No changes detected`.

- [ ] **Step 3: Document the demo school**

In `README.md`, add a section "Demo school" after "Accounts and sign-in":
```markdown
## Demo school

A school with no pupils yet can be filled with a realistic demo school: a school year with its
calendar, classes, about 250 pupils with their families, and staff for every role. Every demo
person is marked DEMO, and demo phone numbers are never texted.

- Fill a school: `cd backend && .venv/Scripts/python manage.py seed_demo --school adsmart`
- Try every role (development only): set `DEMO_LOGINS_ENABLED=true` in `backend/.env` before
  seeding. The command then prints one sign-in per role and their shared password. Settings
  refuse this flag unless `DJANGO_DEBUG` is on.
- See what would be removed: `.venv/Scripts/python manage.py purge_demo --school adsmart`, then
  add `--yes` to remove it. Real records stay, and nothing is removed while a real record still
  points at a demo one.
- Public holidays: the calendar marks the holidays with fixed rules. Add Eid and any newly
  gazetted days yourself.
```

- [ ] **Step 4: Fill the development school and run every check**

With `tools/postgres` running:
`cd backend && .venv/Scripts/python manage.py migrate -v0 && .venv/Scripts/python manage.py seed_demo --school adsmart`
Expected: `Demo records added to AD Smart School: 16 classes, 250 pupils, … parents, … staff.`

Run: `scripts/check.sh` and then `WITH_E2E=1 scripts/check.sh`.
Expected: "All checks passed."

- [ ] **Step 5: Commit**

```bash
git add backend/apps/academics/admin.py backend/apps/people/admin.py backend/apps/consent/admin.py README.md
git commit -m "Show school records in the development admin and document the demo school"
```
