"""The daily canteen and extra-class charge (SMS spec §14): approved rates, exemptions, closing
the day against the wallet, late edits with approval, and extra-class pay."""

from datetime import date, timedelta

import pytest

from apps.academics.models import ClassTeacherAssignment
from apps.finance import services
from apps.finance.daily import compute_pay, open_list
from apps.finance.models import Account, CategoryRate, ChargeExemption, DailyCharge, PayRule, PayRun
from apps.people.services import enrol
from tests.records import make_class, make_staff, make_student, make_term, make_year

pytestmark = pytest.mark.django_db


def monday(term) -> date:
    day = term.start_date
    return day + timedelta(days=(7 - day.weekday()) % 7)


@pytest.fixture
def day_setup(school):
    year = make_year(school)
    term = make_term(year)
    klass = make_class(year, "basic_2")
    pupils = [make_student(school, first_name=name) for name in ("Ama", "Kojo", "Esi")]
    for pupil in pupils:
        enrol(pupil, klass, start_date=term.start_date)
    CategoryRate.objects.create(
        school=school, category="PRIMARY", daily_amount=1_000, canteen_amount=600, status="APPROVED"
    )
    ChargeExemption.objects.create(school=school, student=pupils[2], kind="FULL", reason="Bursary")
    return {"term": term, "class": klass, "pupils": pupils}


def test_a_days_list_uses_the_approved_rate_and_exemptions(school, day_setup):
    daily = open_list(day_setup["class"], monday(day_setup["term"]))
    charges = {c.student.first_name: c for c in daily.charges.select_related("student")}
    assert (charges["Ama"].canteen, charges["Ama"].extra) == (600, 400)
    assert charges["Esi"].status == DailyCharge.Status.EXEMPT


def test_an_unapproved_rate_charges_nothing(school, day_setup):
    CategoryRate.objects.filter(school=school).update(status="PENDING")
    daily = open_list(day_setup["class"], monday(day_setup["term"]))
    assert all(charge.total == 0 for charge in daily.charges.all())


def test_closing_the_day_takes_what_was_not_paid_from_the_wallet(school, day_setup, client_for):
    canteen = client_for("Canteen Officer")
    day = monday(day_setup["term"])
    body = canteen.get(
        f"/api/school/finance/daily/classes/{day_setup['class'].pk}?date={day}"
    ).json()
    charges = {row["name"].split()[0]: row for row in body["charges"]}
    paid = canteen.patch(
        f"/api/school/finance/daily/charges/{charges['Ama']['id']}",
        {"status": "PAID"},
        format="json",
    )
    assert paid.status_code == 200
    canteen.patch(
        f"/api/school/finance/daily/charges/{charges['Kojo']['id']}",
        {"status": "UNPAID"},
        format="json",
    )

    closed = canteen.post(f"/api/school/finance/daily/lists/{body['id']}/close")
    assert closed.status_code == 200
    ama, kojo, esi = day_setup["pupils"]
    assert services.balance(ama, Account.WALLET) == 0
    assert services.balance(kojo, Account.WALLET) == -1_000
    assert services.balance(esi, Account.WALLET) == 0

    again = canteen.patch(
        f"/api/school/finance/daily/charges/{charges['Kojo']['id']}",
        {"status": "PAID"},
        format="json",
    )
    assert again.json()["code"] == "closed"


def test_a_late_edit_needs_the_head_teacher_and_puts_the_wallet_right(
    school, day_setup, client_for
):
    canteen = client_for("Canteen Officer")
    day = monday(day_setup["term"])
    body = canteen.get(
        f"/api/school/finance/daily/classes/{day_setup['class'].pk}?date={day}"
    ).json()
    kojo = next(row for row in body["charges"] if row["name"].startswith("Kojo"))
    canteen.post(f"/api/school/finance/daily/lists/{body['id']}/close")
    edit = canteen.post(
        f"/api/school/finance/daily/charges/{kojo['id']}/late-edit",
        {"new_status": "ABSENT", "reason": "He was at the clinic"},
        format="json",
    ).json()
    assert (
        canteen.post(
            f"/api/school/finance/late-edits/{edit['id']}/decide", {"approve": True}, format="json"
        ).status_code
        == 403
    )

    head = client_for("Head Teacher")
    assert (
        head.post(
            f"/api/school/finance/late-edits/{edit['id']}/decide", {"approve": True}, format="json"
        ).status_code
        == 200
    )
    assert services.balance(day_setup["pupils"][1], Account.WALLET) == 0


def test_a_weekend_has_no_daily_list(school, day_setup, client_for):
    saturday = monday(day_setup["term"]) + timedelta(days=5)
    answer = client_for("Canteen Officer").get(
        f"/api/school/finance/daily/classes/{day_setup['class'].pk}?date={saturday}"
    )
    assert answer.json()["code"] == "closed_day"


def test_extra_class_pay_goes_to_the_class_teacher(school, day_setup):
    teacher = make_staff(school, username="teacher1")
    ClassTeacherAssignment.objects.create(
        school=school, school_class=day_setup["class"], staff=teacher, term=day_setup["term"]
    )
    week = monday(day_setup["term"])
    daily = open_list(day_setup["class"], week)
    daily.charges.exclude(status="EXEMPT").update(status="PAID", paid=1_000)
    PayRule.objects.create(
        school=school, name="Half", school_class=day_setup["class"], method="PERCENT", value=50
    )

    run = PayRun.objects.create(school=school, week_start=week)
    compute_pay(run)
    line = run.lines.get()
    assert line.staff == teacher
    assert line.amount == 400  # half of two pupils' 400 extra-class pesewas
