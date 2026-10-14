"""Retention (SMS spec §30): a leaving date is recorded when a member of staff is switched off,
and staff and pupils past the school's period are anonymised, while money and audit records stay."""

from datetime import date, timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.people.models import Staff
from tests.records import make_staff

pytestmark = pytest.mark.django_db


def test_switching_staff_off_records_the_leaving_day_and_back_on_clears_it(school, admin):
    member = make_staff(school, username="leaving.teacher")
    admin.patch(f"/api/school/staff/{member.pk}", {"is_active": False}, format="json")
    member.refresh_from_db()
    assert member.left_on == timezone.localdate()
    admin.patch(f"/api/school/staff/{member.pk}", {"is_active": True}, format="json")
    member.refresh_from_db()
    assert member.left_on is None


def test_staff_past_the_period_are_anonymised_only_with_apply(school):
    member = make_staff(school, username="long.gone", phone="0244111222")
    member.user.is_active = False
    member.user.save()
    Staff.objects.filter(pk=member.pk).update(left_on=date.today() - timedelta(days=365 * 8))
    recent = make_staff(school, username="recent.leaver")
    recent.user.is_active = False
    recent.user.save()
    Staff.objects.filter(pk=recent.pk).update(left_on=date.today() - timedelta(days=30))

    out = StringIO()
    call_command("apply_retention", stdout=out)
    assert "Would anonymise 0 former pupils and 1 former staff" in out.getvalue()
    member.refresh_from_db()
    assert member.first_name == "Kofi"

    call_command("apply_retention", "--apply", stdout=StringIO())
    member.refresh_from_db()
    recent.refresh_from_db()
    assert (member.first_name, member.surname, member.phone) == ("Former", "staff member", "")
    assert member.user.login == f"former-staff-{member.pk}" and member.user.is_active is False
    assert recent.first_name == "Kofi"
