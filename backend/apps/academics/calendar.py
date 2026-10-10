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
def create_term(
    academic_year: AcademicYear, number: int, start: date, end: date, *, by=None
) -> Term:
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
