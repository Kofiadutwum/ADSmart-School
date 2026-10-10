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
