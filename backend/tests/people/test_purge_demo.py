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
