"""Billing schools (business tools spec §3): the starting plans, gapless bills, part payments and
credits, reminders, and pausing for non-payment that only the Billing page survives."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.billing import services
from apps.billing.models import BillingSettings, Plan, PlatformBill, Subscription

pytestmark = pytest.mark.django_db


def test_the_five_starting_plans_are_there():
    plans = {plan.code: plan for plan in Plan.objects.all()}
    assert [
        plans[c].yearly_price
        for c in ("basic", "standard", "professional", "premium", "enterprise")
    ] == [
        120_000,
        240_000,
        480_000,
        720_000,
        1_000_000,
    ]
    assert plans["enterprise"].from_price is True


def test_a_new_school_starts_on_trial_and_is_billed_when_it_ends(school):
    subscription = services.subscribe(school, Plan.objects.get(code="standard"))
    assert subscription.status == Subscription.Status.TRIAL
    assert subscription.next_bill_on == timezone.localdate() + timedelta(days=30)

    bill = services.issue_bill(subscription)
    second = services.issue_bill(subscription)
    year = timezone.localdate().year
    assert (bill.number, second.number) == (f"ADS-{year}-0001", f"ADS-{year}-0002")
    assert bill.amount == 240_000 + 100_000  # the plan, and the one-time setup on the first bill
    assert second.amount == 240_000
    assert any(line.description.startswith("One-time setup") for line in bill.lines.all())


def test_part_payments_settle_the_bill_and_overpayment_becomes_credit(school):
    subscription = services.subscribe(school, Plan.objects.get(code="basic"))
    bill = services.issue_bill(subscription)
    services.record_bill_payment(bill, 100_000, "MOMO")
    assert services.bill_state(bill) == "PART_PAID"
    services.record_bill_payment(bill, 130_000, "MOMO")  # 220,000 due with the setup fee
    bill.refresh_from_db()
    assert bill.status == PlatformBill.Status.PAID
    subscription.refresh_from_db()
    assert subscription.status == Subscription.Status.ACTIVE

    next_bill = services.issue_bill(subscription)
    assert next_bill.amount == 120_000 - 10_000


def test_pausing_for_non_payment_leaves_only_the_billing_page(school, client_for):
    settings = BillingSettings.current()
    settings.pause_for_non_payment = True
    settings.save()
    subscription = services.subscribe(school, Plan.objects.get(code="basic"))
    bill = services.issue_bill(subscription, due_on=timezone.localdate() - timedelta(days=21))
    services.run_billing()
    school.refresh_from_db()
    assert school.billing_paused is True

    admin = client_for("Administrator")
    assert admin.get("/api/school/pupils").json()["code"] == "billing_paused"
    assert admin.get("/api/school/billing").status_code == 200

    services.record_bill_payment(bill, bill.amount, "BANK")
    school.refresh_from_db()
    assert school.billing_paused is False


def test_a_school_sees_only_its_own_bills(school, other_school, client_for):
    mine = services.issue_bill(services.subscribe(school, Plan.objects.get(code="basic")))
    theirs = services.issue_bill(services.subscribe(other_school, Plan.objects.get(code="basic")))
    admin = client_for("Administrator")
    numbers = [row["number"] for row in admin.get("/api/school/billing").json()["bills"]]
    assert numbers == [mine.number]
    assert admin.get(f"/api/school/billing/bills/{theirs.pk}").status_code == 404


def test_a_paused_schools_website_is_off_but_its_portal_frame_still_loads(school, api):
    school.billing_paused = True
    school.save()
    site = f"/api/public/sites/{school.slug}.localhost/site"
    assert api.get(site).json()["code"] == "suspended"
    assert api.get(f"{site}?portal=1").status_code == 200


def test_each_bill_payment_gets_a_receipt_number_and_an_email(
    school, client_for, mailoutbox, django_capture_on_commit_callbacks
):
    from apps.accounts.models import User

    admin = client_for("Administrator")
    User.objects.filter(pk=admin.staff.user_id).update(email="head.office@sample.example")
    bill = services.issue_bill(services.subscribe(school, Plan.objects.get(code="basic")))
    with django_capture_on_commit_callbacks(execute=True):
        first = services.record_bill_payment(bill, 20_000, "MOMO", reference="MM123")
        second = services.record_bill_payment(bill, 20_000, "MOMO")
    year = timezone.localdate().year
    assert (first.receipt_number, second.receipt_number) == (f"RCT-{year}-0001", f"RCT-{year}-0002")
    receipts = [mail for mail in mailoutbox if "receipt" in mail.subject]
    assert receipts and receipts[0].to == ["head.office@sample.example"]
    assert "MM123" in receipts[0].body and bill.number in receipts[0].body


def test_statistics_show_money_per_month_to_finance_only(school, member_client):
    bill = services.issue_bill(services.subscribe(school, Plan.objects.get(code="basic")))
    services.record_bill_payment(bill, 50_000, "BANK")
    finance = member_client("Platform Finance").get("/api/platform/statistics").json()
    assert finance["money"]["collected_per_month"][0]["amount"] == 50_000
    assert finance["join_requests"]["became_schools_percent"] is None
    assert member_client("Platform Support").get("/api/platform/statistics").status_code == 403
