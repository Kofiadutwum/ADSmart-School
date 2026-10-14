"""Fees and payments (SMS spec §13): invoices from the fee structure, gapless numbers, the
append-only ledger, receipts, reversals, refunds and the wallet."""

import pytest

from apps.finance import services
from apps.finance.models import (
    Account,
    AppendOnlyError,
    Discount,
    FeeStructure,
    Invoice,
    LedgerEntry,
    OptionalCharge,
    Payment,
    RefundRequest,
)
from apps.notifications.backends import MemoryBackend
from apps.notifications.models import SmsCreditEntry
from apps.people.services import enrol, link_guardian
from tests.records import make_class, make_parent, make_student, make_term, make_year

pytestmark = pytest.mark.django_db


@pytest.fixture
def setting(school):
    year = make_year(school)
    term = make_term(year)
    klass = make_class(year, "basic_2")
    pupil = make_student(school)
    enrol(pupil, klass, start_date=term.start_date)
    parent = make_parent(school)
    link_guardian(parent, pupil, "MOTHER", is_payer=True)
    FeeStructure.objects.create(school=school, academic_year=year, name="Tuition", amount=150_000)
    FeeStructure.objects.create(
        school=school, academic_year=year, name="PTA", amount=5_000, band="jhs"
    )
    bus = FeeStructure.objects.create(
        school=school, academic_year=year, name="Bus", amount=20_000, optional=True
    )
    return {
        "year": year,
        "term": term,
        "class": klass,
        "pupil": pupil,
        "parent": parent,
        "bus": bus,
    }


def test_an_invoice_charges_the_pupils_level_options_and_discounts(school, setting):
    pupil = setting["pupil"]
    OptionalCharge.objects.create(school=school, student=pupil, fee=setting["bus"])
    Discount.objects.create(
        school=school,
        student=pupil,
        kind="SIBLING",
        percent=10,
        reason="Two children",
        status="APPROVED",
    )
    Discount.objects.create(
        school=school, student=pupil, kind="OTHER", amount=1_000, reason="Waiting"
    )

    invoice = services.issue_invoice(pupil, setting["term"])

    # Tuition and the bus apply; the JHS-only PTA does not; only the approved discount counts.
    assert invoice.total == 170_000 - 17_000
    assert invoice.number == f"INV-{setting['term'].start_date.year}-00001"
    assert services.balance(pupil) == 153_000
    assert [line.kind for line in invoice.lines.all()].count("DISCOUNT") == 1


def test_invoice_and_receipt_numbers_have_no_gaps(school, setting):
    other = make_student(school, first_name="Kojo")
    enrol(other, setting["class"], start_date=setting["term"].start_date)
    first = services.issue_invoice(setting["pupil"], setting["term"])
    second = services.issue_invoice(other, setting["term"])
    assert first.number[-5:] == "00001" and second.number[-5:] == "00002"
    a = services.record_payment(setting["pupil"], 100, "CASH", notify=False)
    b = services.record_payment(other, 100, "CASH", notify=False)
    assert int(b.receipt_number[-5:]) == int(a.receipt_number[-5:]) + 1


def test_paying_in_full_settles_the_invoice_and_texts_the_payer(
    school, setting, django_capture_on_commit_callbacks
):
    SmsCreditEntry.objects.create(school=school, change=10, reason="Top-up")
    invoice = services.issue_invoice(setting["pupil"], setting["term"])
    with django_capture_on_commit_callbacks(execute=True):
        payment = services.record_payment(setting["pupil"], invoice.total, Payment.Method.CASH)

    invoice.refresh_from_db()
    assert invoice.status == Invoice.Status.PAID
    assert services.balance(setting["pupil"]) == 0
    assert payment.receipt_number in MemoryBackend.outbox[-1]["body"]
    assert MemoryBackend.outbox[-1]["to"] == setting["parent"].phone


def test_a_payment_without_sms_credit_is_still_recorded(
    school, setting, django_capture_on_commit_callbacks
):
    services.issue_invoice(setting["pupil"], setting["term"])
    with django_capture_on_commit_callbacks(execute=True):
        services.record_payment(setting["pupil"], 1_000, Payment.Method.CASH)
    assert Payment.objects.count() == 1
    assert MemoryBackend.outbox == []


def test_ledger_entries_are_never_changed_and_reversals_put_things_right(school, setting):
    invoice = services.issue_invoice(setting["pupil"], setting["term"])
    payment = services.record_payment(setting["pupil"], invoice.total, "CASH", notify=False)
    entry = LedgerEntry.objects.filter(payment=payment).first()
    with pytest.raises(AppendOnlyError):
        entry.amount = 1
        entry.save()
    with pytest.raises(AppendOnlyError):
        LedgerEntry.objects.filter(pk=entry.pk).delete()

    services.reverse_payment(payment, by=None, reason="Bounced cheque")
    invoice.refresh_from_db()
    assert invoice.status == Invoice.Status.OPEN
    assert services.balance(setting["pupil"]) == invoice.total
    with pytest.raises(Exception, match="already been reversed"):
        services.reverse_payment(payment, by=None, reason="Again")


def test_the_wallet_pays_only_what_it_holds(school, setting):
    pupil = setting["pupil"]
    with pytest.raises(Exception, match="enough in the wallet"):
        services.record_payment(pupil, 500, Payment.Method.WALLET, notify=False)
    services.record_payment(pupil, 2_000, "CASH", purpose=Payment.Purpose.WALLET, notify=False)
    services.record_payment(pupil, 500, Payment.Method.WALLET, notify=False)
    assert services.balance(pupil, Account.WALLET) == 1_500
    assert services.balance(pupil) == -500


def test_a_refund_needs_money_held_and_a_leader(school, setting, client_for):
    pupil = setting["pupil"]
    services.record_payment(pupil, 5_000, "CASH", notify=False)  # paid before any invoice
    accountant = client_for("Accountant")
    raised = accountant.post(
        "/api/school/finance/refunds",
        {"student": pupil.pk, "account": "FEES", "amount": 3_000, "reason": "Overpaid"},
        format="json",
    )
    assert raised.status_code == 201
    refund_id = raised.json()["id"]
    assert (
        accountant.post(
            f"/api/school/finance/refunds/{refund_id}/decide", {"approve": True}, format="json"
        ).status_code
        == 403
    )

    head = client_for("Head Teacher")
    assert (
        head.post(
            f"/api/school/finance/refunds/{refund_id}/decide", {"approve": True}, format="json"
        ).status_code
        == 200
    )
    assert services.balance(pupil) == -2_000

    too_much = RefundRequest.objects.create(
        school=school, student=pupil, amount=9_000, reason="x", raised_by=head.staff.user
    )
    answer = head.post(
        f"/api/school/finance/refunds/{too_much.pk}/decide", {"approve": True}, format="json"
    )
    assert answer.status_code == 400
    assert answer.json()["code"] == "not_enough_credit"


def test_another_schools_pupil_cannot_be_charged(school, other_school, setting, client_for):
    stranger = make_student(other_school, first_name="Yaw")
    accountant = client_for("Accountant")
    answer = accountant.post(
        "/api/school/finance/payments",
        {"student": stranger.pk, "amount": 100, "method": "CASH"},
        format="json",
    )
    assert answer.status_code == 404
    assert Payment.objects.count() == 0
