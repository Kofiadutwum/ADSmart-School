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
