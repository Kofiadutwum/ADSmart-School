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
