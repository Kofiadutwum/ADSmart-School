"""The owner's billing of schools (business tools spec §3): plans, subscriptions, school groups,
gapless bills, payments, credits, reversals and refunds. Amounts are in pesewas."""

from django.conf import settings
from django.db import models

USER = settings.AUTH_USER_MODEL


class Plan(models.Model):
    code = models.SlugField(max_length=20, unique=True)
    name = models.CharField(max_length=40)
    yearly_price = models.PositiveIntegerField()
    from_price = models.BooleanField(default=False, help_text='Shown as "From"')
    audience = models.CharField(max_length=200, blank=True)
    includes = models.TextField(blank=True, help_text="One item per line")
    order = models.PositiveSmallIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "yearly_price"]

    def __str__(self):
        return self.name


class SchoolGroup(models.Model):
    """Enterprise: several campuses, one bill (owner's decision 2026-10-11)."""

    name = models.CharField(max_length=120)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=16, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Subscription(models.Model):
    class Status(models.TextChoices):
        TRIAL = "TRIAL", "Trial"
        ACTIVE = "ACTIVE", "Active"
        PAUSED = "PAUSED", "Paused for non-payment"
        CANCELLED = "CANCELLED", "Cancelled"

    school = models.OneToOneField("school.School", on_delete=models.CASCADE, related_name="subscription")
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="subscriptions")
    price = models.PositiveIntegerField(help_text="Kept when the plan's price changes")
    status = models.CharField(max_length=9, choices=Status.choices, default=Status.TRIAL)
    starts_on = models.DateField()
    ends_on = models.DateField()
    group = models.ForeignKey(SchoolGroup, null=True, blank=True, on_delete=models.SET_NULL, related_name="subscriptions")

    def __str__(self):
        return f"{self.school}: {self.plan}"


class BillCounter(models.Model):
    year = models.PositiveSmallIntegerField(unique=True)
    last = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"{self.year}: {self.last}"


class PlatformBill(models.Model):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        PAID = "PAID", "Paid"
        VOID = "VOID", "Void"

    number = models.CharField(max_length=20, unique=True)
    school = models.ForeignKey("school.School", null=True, blank=True, on_delete=models.PROTECT, related_name="bills")
    group = models.ForeignKey(SchoolGroup, null=True, blank=True, on_delete=models.PROTECT, related_name="bills")
    period_start = models.DateField()
    period_end = models.DateField()
    amount = models.PositiveIntegerField()
    status = models.CharField(max_length=4, choices=Status.choices, default=Status.OPEN)
    issued_on = models.DateField()
    due_on = models.DateField()
    reminded_on = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-issued_on", "-id"]

    def __str__(self):
        return self.number


class BillLine(models.Model):
    bill = models.ForeignKey(PlatformBill, on_delete=models.CASCADE, related_name="lines")
    description = models.CharField(max_length=160)
    amount = models.IntegerField()

    def __str__(self):
        return self.description


class BillPayment(models.Model):
    class Method(models.TextChoices):
        BANK = "BANK", "Bank transfer"
        MOMO = "MOMO", "Mobile Money"
        CASH = "CASH", "Cash"
        CHEQUE = "CHEQUE", "Cheque"
        PAYSTACK = "PAYSTACK", "Online (Paystack)"

    bill = models.ForeignKey(PlatformBill, on_delete=models.PROTECT, related_name="payments")
    amount = models.PositiveIntegerField()
    method = models.CharField(max_length=8, choices=Method.choices)
    reference = models.CharField(max_length=80, blank=True)
    received_on = models.DateField()
    recorded_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.bill}: {self.amount / 100:.2f}"


class BillAdjustment(models.Model):
    class Kind(models.TextChoices):
        CREDIT = "CREDIT", "Credit"
        REVERSAL = "REVERSAL", "Payment reversed"
        REFUND = "REFUND", "Refund"

    bill = models.ForeignKey(PlatformBill, on_delete=models.PROTECT, related_name="adjustments")
    kind = models.CharField(max_length=8, choices=Kind.choices)
    amount = models.PositiveIntegerField()
    reason = models.CharField(max_length=300)
    recorded_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.get_kind_display()} on {self.bill}"


class BillingSettings(models.Model):
    """One row. Pausing for non-payment is off until the owner switches it on (BT §3.7)."""

    pause_for_non_payment = models.BooleanField(default=False)
    grace_days = models.PositiveSmallIntegerField(default=30)
    reminder_days = models.PositiveSmallIntegerField(default=7)

    def __str__(self):
        return "Billing settings"

    @classmethod
    def current(cls) -> "BillingSettings":
        return cls.objects.first() or cls.objects.create()
