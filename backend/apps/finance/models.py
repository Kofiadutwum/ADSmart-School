"""School money (SMS spec §13–§14, §18, §25, §39). Every amount is in pesewas (GH₵1 = 100).

One append-only ledger holds every change to what a pupil owes or holds: an entry is never
edited or deleted, only reversed by a linked entry. For the FEES account a positive amount is
owed by the family; for the WALLET account a positive amount is money held for the pupil.
Receipts and invoices are numbered without gaps, per school and year.
"""

from django.conf import settings
from django.db import models

from apps.school.models import SchoolOwned, same_school

USER = settings.AUTH_USER_MODEL


class AppendOnlyError(Exception):
    """Raised on any attempt to change or remove a ledger entry."""


class Account(models.TextChoices):
    FEES = "FEES", "School fees"
    WALLET = "WALLET", "Prepaid wallet"
    CANTEEN = "CANTEEN", "Canteen"
    EXTRA_CLASSES = "EXTRA", "Extra classes"
    BUS = "BUS", "Bus"
    BOOKSHOP = "BOOKS", "Bookshop"
    UNIFORM = "UNIFORM", "Uniforms"


class Category(models.TextChoices):
    """Rate categories for the daily canteen and extra-class charge (SMS spec §14.1)."""

    EARLY_YEARS = "EARLY_YEARS", "Early Years"
    PRIMARY = "PRIMARY", "Primary"
    JHS = "JHS", "JHS"


class FeeStructure(SchoolOwned):
    class ChargeType(models.TextChoices):
        TUITION = "TUITION", "Tuition"
        PTA = "PTA", "PTA dues"
        BUS = "BUS", "Bus"
        CANTEEN = "CANTEEN", "Canteen plan"
        EXTRA_CLASSES = "EXTRA", "Extra classes"
        BECE = "BECE", "BECE fee"
        MOCK = "MOCK", "Mock exams"
        BOOKS = "BOOKS", "Books"
        UNIFORM = "UNIFORM", "Uniform"
        OTHER = "OTHER", "Other"

    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.CASCADE, related_name="+")
    term = models.ForeignKey(
        "academics.Term", null=True, blank=True, on_delete=models.CASCADE, related_name="+",
        help_text="Empty: charged every term",
    )
    name = models.CharField(max_length=80)
    charge_type = models.CharField(max_length=8, choices=ChargeType.choices, default=ChargeType.TUITION)
    band = models.CharField(max_length=20, blank=True, help_text="Empty: every level")
    school_class = models.ForeignKey(
        "academics.SchoolClass", null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    amount = models.PositiveIntegerField(help_text="In pesewas")
    optional = models.BooleanField(default=False)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.amount / 100:.2f})"


class OptionalCharge(SchoolOwned):
    """A pupil opted into an optional charge such as the bus or BECE."""

    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="optional_charges")
    fee = models.ForeignKey(FeeStructure, on_delete=models.CASCADE, related_name="takers")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["student", "fee"], name="finance_one_option")]

    def __str__(self):
        return f"{self.student} takes {self.fee.name}"


class Discount(SchoolOwned):
    class Kind(models.TextChoices):
        SIBLING = "SIBLING", "Sibling"
        STAFF_CHILD = "STAFF_CHILD", "Staff child"
        BURSARY = "BURSARY", "Bursary or scholarship"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Waiting for approval"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="discounts")
    kind = models.CharField(max_length=12, choices=Kind.choices)
    percent = models.PositiveSmallIntegerField(default=0, help_text="Of the term's charges")
    amount = models.PositiveIntegerField(default=0, help_text="Fixed, in pesewas")
    reason = models.CharField(max_length=300)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    approved_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.get_kind_display()} for {self.student}"


class Counter(SchoolOwned):
    """The last number used, so invoice and receipt numbers have no gaps."""

    kind = models.CharField(max_length=10)
    year = models.PositiveSmallIntegerField()
    last = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["school", "kind", "year"], name="finance_one_counter")]

    def __str__(self):
        return f"{self.kind} {self.year}: {self.last}"


class Invoice(SchoolOwned):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        PAID = "PAID", "Paid"
        CANCELLED = "CANCELLED", "Cancelled"

    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="invoices")
    term = models.ForeignKey("academics.Term", on_delete=models.PROTECT, related_name="+")
    number = models.CharField(max_length=20)
    issued_on = models.DateField()
    due_on = models.DateField()
    status = models.CharField(max_length=9, choices=Status.choices, default=Status.OPEN)
    total = models.IntegerField(default=0, help_text="This term's charges after discounts")
    arrears = models.IntegerField(default=0, help_text="Owed from before, shown separately")

    class Meta:
        ordering = ["-issued_on", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["school", "number"], name="finance_invoice_number"),
            models.UniqueConstraint(fields=["student", "term"], name="finance_one_invoice_per_term"),
        ]

    def __str__(self):
        return self.number

    def save(self, *args, **kwargs):
        self.school_id = same_school(self.student)
        super().save(*args, **kwargs)


class InvoiceLine(SchoolOwned):
    class Kind(models.TextChoices):
        CHARGE = "CHARGE", "Charge"
        DISCOUNT = "DISCOUNT", "Discount"
        ARREARS = "ARREARS", "Arrears"

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="lines")
    description = models.CharField(max_length=160)
    amount = models.IntegerField()
    kind = models.CharField(max_length=8, choices=Kind.choices, default=Kind.CHARGE)
    fee = models.ForeignKey(FeeStructure, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    def __str__(self):
        return f"{self.description}: {self.amount / 100:.2f}"


class Instalment(SchoolOwned):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="instalments")
    due_on = models.DateField()
    amount = models.PositiveIntegerField()
    reminded_before = models.BooleanField(default=False)
    reminded_after = models.BooleanField(default=False)

    class Meta:
        ordering = ["due_on"]

    def __str__(self):
        return f"{self.invoice} instalment due {self.due_on}"


class Payment(SchoolOwned):
    class Method(models.TextChoices):
        CASH = "CASH", "Cash"
        BANK = "BANK", "Bank slip"
        MOMO = "MOMO", "Mobile Money (direct)"
        PAYSTACK = "PAYSTACK", "Online (Paystack)"
        USSD = "USSD", "USSD"
        WALLET = "WALLET", "From the wallet"

    class Purpose(models.TextChoices):
        FEES = "FEES", "School fees"
        WALLET = "WALLET", "Wallet top-up"
        BOOKSHOP = "BOOKS", "Bookshop"
        UNIFORM = "UNIFORM", "Uniforms"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Waiting to be matched"
        CONFIRMED = "CONFIRMED", "Confirmed"
        REVERSED = "REVERSED", "Reversed"

    student = models.ForeignKey("people.Student", on_delete=models.PROTECT, related_name="payments")
    amount = models.PositiveIntegerField()
    method = models.CharField(max_length=8, choices=Method.choices)
    purpose = models.CharField(max_length=7, choices=Purpose.choices, default=Purpose.FEES)
    reference = models.CharField(max_length=80, blank=True)
    payer_phone = models.CharField(max_length=16, blank=True)
    note = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=9, choices=Status.choices, default=Status.CONFIRMED)
    receipt_number = models.CharField(max_length=20, blank=True)
    received_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    received_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    order = models.ForeignKey("shop.Order", null=True, blank=True, on_delete=models.SET_NULL, related_name="payments")

    class Meta:
        ordering = ["-received_at", "-id"]

    def __str__(self):
        return self.receipt_number or f"Payment {self.pk}"

    def save(self, *args, **kwargs):
        self.school_id = same_school(self.student)
        super().save(*args, **kwargs)


class LedgerQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise AppendOnlyError("Ledger entries cannot be changed.")

    def delete(self):
        raise AppendOnlyError("Ledger entries cannot be deleted.")


class LedgerEntry(SchoolOwned):
    class Kind(models.TextChoices):
        CHARGE = "CHARGE", "Charge"
        DISCOUNT = "DISCOUNT", "Discount"
        PAYMENT = "PAYMENT", "Payment"
        REFUND = "REFUND", "Refund"
        REVERSAL = "REVERSAL", "Reversal"
        ADJUSTMENT = "ADJUSTMENT", "Adjustment"
        TOP_UP = "TOP_UP", "Wallet top-up"
        SPEND = "SPEND", "Wallet spend"
        COLLECTED = "COLLECTED", "Collected"

    student = models.ForeignKey("people.Student", null=True, blank=True, on_delete=models.PROTECT, related_name="ledger")
    account = models.CharField(max_length=7, choices=Account.choices)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    amount = models.IntegerField(help_text="Pesewas; see the module note for the sign")
    description = models.CharField(max_length=200)
    invoice = models.ForeignKey(Invoice, null=True, blank=True, on_delete=models.PROTECT, related_name="ledger")
    payment = models.ForeignKey(Payment, null=True, blank=True, on_delete=models.PROTECT, related_name="ledger")
    reverses = models.OneToOneField("self", null=True, blank=True, on_delete=models.PROTECT, related_name="reversed_by")
    created_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    objects = LedgerQuerySet.as_manager()

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["school", "student", "account"])]

    def __str__(self):
        return f"{self.get_kind_display()} {self.amount / 100:.2f} ({self.account})"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise AppendOnlyError("Ledger entries cannot be changed.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise AppendOnlyError("Ledger entries cannot be deleted.")


class RefundRequest(SchoolOwned):
    """Raised by the Accountant, approved by the Head Teacher or Proprietor (SMS spec §13)."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Waiting for approval"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    student = models.ForeignKey("people.Student", on_delete=models.PROTECT, related_name="refunds")
    account = models.CharField(max_length=7, choices=Account.choices, default=Account.FEES)
    amount = models.PositiveIntegerField()
    reason = models.CharField(max_length=300)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    raised_by = models.ForeignKey(USER, on_delete=models.PROTECT, related_name="+")
    decided_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    decided_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Refund {self.amount / 100:.2f} for {self.student}"


class CategoryRate(SchoolOwned):
    """The daily charge per category; part of it is the canteen, the rest extra classes."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Waiting for approval"
        APPROVED = "APPROVED", "Approved"

    category = models.CharField(max_length=11, choices=Category.choices)
    daily_amount = models.PositiveIntegerField()
    canteen_amount = models.PositiveIntegerField()
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    set_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    approved_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["school", "category"], name="finance_one_rate")]

    def __str__(self):
        return f"{self.get_category_display()}: {self.daily_amount / 100:.2f} a day"


class ChargeExemption(SchoolOwned):
    class Kind(models.TextChoices):
        FULL = "FULL", "Exempt"
        REDUCED = "REDUCED", "Reduced daily amount"

    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="charge_exemptions")
    kind = models.CharField(max_length=7, choices=Kind.choices)
    daily_amount = models.PositiveIntegerField(default=0, help_text="For a reduced amount")
    reason = models.CharField(max_length=200)
    active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.get_kind_display()} for {self.student}"


class DailyList(SchoolOwned):
    """A class's canteen, extra-class and bus charges for one day (SMS spec §14)."""

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        CLOSED = "CLOSED", "Closed"

    school_class = models.ForeignKey("academics.SchoolClass", on_delete=models.CASCADE, related_name="daily_lists")
    date = models.DateField()
    status = models.CharField(max_length=6, choices=Status.choices, default=Status.OPEN)
    closed_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-date"]
        constraints = [models.UniqueConstraint(fields=["school_class", "date"], name="finance_one_daily_list")]

    def __str__(self):
        return f"{self.school_class} {self.date}"


class DailyCharge(SchoolOwned):
    class Status(models.TextChoices):
        UNPAID = "UNPAID", "Not paid"
        PAID = "PAID", "Paid"
        PART = "PART", "Part paid"
        ABSENT = "ABSENT", "Absent"
        EXEMPT = "EXEMPT", "Exempt"

    daily_list = models.ForeignKey(DailyList, on_delete=models.CASCADE, related_name="charges")
    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="daily_charges")
    canteen = models.PositiveIntegerField(default=0)
    extra = models.PositiveIntegerField(default=0)
    bus = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=6, choices=Status.choices, default=Status.UNPAID)
    paid = models.PositiveIntegerField(default=0)
    method = models.CharField(max_length=6, blank=True)
    marked_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["daily_list", "student"], name="finance_one_charge")]

    def __str__(self):
        return f"{self.student} {self.daily_list.date}"

    @property
    def total(self) -> int:
        return self.canteen + self.extra + self.bus


class LateEdit(SchoolOwned):
    """A change to a closed day, which needs the Head Teacher's approval (SMS spec §14)."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Waiting for approval"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    charge = models.ForeignKey(DailyCharge, on_delete=models.CASCADE, related_name="late_edits")
    new_status = models.CharField(max_length=6, choices=DailyCharge.Status.choices)
    reason = models.CharField(max_length=200)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    requested_by = models.ForeignKey(USER, on_delete=models.PROTECT, related_name="+")
    decided_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    def __str__(self):
        return f"Late edit for {self.charge}"


class Handover(SchoolOwned):
    """The Canteen Officer's daily count of what a class teacher hands over."""

    date = models.DateField()
    school_class = models.ForeignKey("academics.SchoolClass", on_delete=models.CASCADE, related_name="+")
    collector = models.ForeignKey(USER, on_delete=models.PROTECT, related_name="+")
    expected = models.PositiveIntegerField()
    counted = models.PositiveIntegerField()
    note = models.CharField(max_length=200, blank=True)
    signed_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"Hand-over {self.school_class} {self.date}"

    @property
    def difference(self) -> int:
        return self.counted - self.expected


class CashUp(SchoolOwned):
    """Day-end cash-up for every cash collector (SMS spec §13)."""

    date = models.DateField()
    collector = models.ForeignKey(USER, on_delete=models.PROTECT, related_name="+")
    expected = models.PositiveIntegerField()
    counted = models.PositiveIntegerField()
    note = models.CharField(max_length=200, blank=True)
    signed_off_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date"]
        constraints = [models.UniqueConstraint(fields=["collector", "date"], name="finance_one_cash_up")]

    def __str__(self):
        return f"Cash-up {self.date} by {self.collector}"

    @property
    def difference(self) -> int:
        return self.counted - self.expected


class WeeklyStatement(SchoolOwned):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        APPROVED = "APPROVED", "Approved"
        SENT = "SENT", "Sent"

    school_class = models.ForeignKey("academics.SchoolClass", on_delete=models.CASCADE, related_name="+")
    week_start = models.DateField()
    totals = models.JSONField(default=dict)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.DRAFT)
    approved_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-week_start"]
        constraints = [
            models.UniqueConstraint(fields=["school_class", "week_start"], name="finance_one_statement")
        ]

    def __str__(self):
        return f"{self.school_class} week of {self.week_start}"


class PayRule(SchoolOwned):
    """How extra-class money is paid to teachers (SMS spec §14.3)."""

    class Scope(models.TextChoices):
        CLASS = "CLASS", "One class"
        CATEGORY = "CATEGORY", "Pooled across a category"

    class Method(models.TextChoices):
        PERCENT = "PERCENT", "Percentage of what was collected"
        PER_PUPIL_DAY = "PER_PUPIL_DAY", "Amount per paying pupil per day"
        FIXED = "FIXED", "Fixed amount a week"

    name = models.CharField(max_length=80)
    scope = models.CharField(max_length=8, choices=Scope.choices, default=Scope.CLASS)
    school_class = models.ForeignKey("academics.SchoolClass", null=True, blank=True, on_delete=models.CASCADE, related_name="+")
    category = models.CharField(max_length=11, choices=Category.choices, blank=True)
    method = models.CharField(max_length=13, choices=Method.choices, default=Method.PERCENT)
    value = models.PositiveIntegerField(help_text="Percent, or pesewas")
    minimum = models.PositiveIntegerField(default=0)
    maximum = models.PositiveIntegerField(default=0, help_text="0: no maximum")
    shares = models.JSONField(default=dict, blank=True, help_text="Pooled: staff id to percent")
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class PayRun(SchoolOwned):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        APPROVED = "APPROVED", "Approved"
        PAID = "PAID", "Paid"

    week_start = models.DateField()
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.DRAFT)
    approved_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    paid_at = models.DateTimeField(null=True, blank=True)
    reference = models.CharField(max_length=80, blank=True)

    class Meta:
        ordering = ["-week_start"]
        constraints = [models.UniqueConstraint(fields=["school", "week_start"], name="finance_one_pay_run")]

    def __str__(self):
        return f"Extra-class pay, week of {self.week_start}"


class PayLine(SchoolOwned):
    run = models.ForeignKey(PayRun, on_delete=models.CASCADE, related_name="lines")
    staff = models.ForeignKey("people.Staff", on_delete=models.PROTECT, related_name="+")
    amount = models.IntegerField(default=0)
    adjustment = models.IntegerField(default=0)
    adjustment_reason = models.CharField(max_length=200, blank=True)

    def __str__(self):
        return f"{self.staff}: {(self.amount + self.adjustment) / 100:.2f}"


class OnlinePayment(models.Model):
    """A Paystack or USSD payment, pending until verified with the provider (SMS spec §18)."""

    class Purpose(models.TextChoices):
        FEES = "FEES", "School fees"
        WALLET = "WALLET", "Wallet top-up"
        PLATFORM_BILL = "BILL", "Platform bill"
        ORDER = "ORDER", "Bookshop or uniform order"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SUCCESS = "SUCCESS", "Paid"
        FAILED = "FAILED", "Failed"

    school = models.ForeignKey("school.School", null=True, blank=True, on_delete=models.CASCADE, related_name="+")
    reference = models.CharField(max_length=40, unique=True)
    channel = models.CharField(max_length=8, default="PAYSTACK")
    purpose = models.CharField(max_length=6, choices=Purpose.choices)
    student = models.ForeignKey("people.Student", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    bill = models.ForeignKey("billing.PlatformBill", null=True, blank=True, on_delete=models.PROTECT, related_name="online_payments")
    order = models.ForeignKey("shop.Order", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    amount = models.PositiveIntegerField()
    phone = models.CharField(max_length=16, blank=True)
    status = models.CharField(max_length=7, choices=Status.choices, default=Status.PENDING)
    provider_id = models.CharField(max_length=80, blank=True)
    payment = models.ForeignKey(Payment, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.reference


class PaymentLink(SchoolOwned):
    """An SMS link a parent opens to pay without signing in (SMS spec §18)."""

    token = models.CharField(max_length=40, unique=True)
    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="+")
    purpose = models.CharField(max_length=6, choices=OnlinePayment.Purpose.choices, default=OnlinePayment.Purpose.FEES)
    amount = models.PositiveIntegerField()
    expires_at = models.DateTimeField()
    created_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Payment link for {self.student}"


class UssdSession(models.Model):
    session_id = models.CharField(max_length=80, unique=True)
    phone = models.CharField(max_length=16)
    data = models.JSONField(default=dict)
    wrong_ids = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.session_id


class StatementImport(SchoolOwned):
    class Source(models.TextChoices):
        MOMO = "MOMO", "Mobile Money"
        PAYSTACK = "PAYSTACK", "Paystack"
        BANK = "BANK", "Bank"

    source = models.CharField(max_length=8, choices=Source.choices)
    file_name = models.CharField(max_length=200)
    uploaded_by = models.ForeignKey(USER, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_source_display()} statement {self.created_at:%Y-%m-%d}"


class StatementLine(SchoolOwned):
    class Status(models.TextChoices):
        UNMATCHED = "UNMATCHED", "Not matched"
        MATCHED = "MATCHED", "Matched"
        IGNORED = "IGNORED", "Ignored"

    statement = models.ForeignKey(StatementImport, on_delete=models.CASCADE, related_name="lines")
    date = models.DateField()
    amount = models.IntegerField()
    reference = models.CharField(max_length=120, blank=True)
    description = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=9, choices=Status.choices, default=Status.UNMATCHED)
    payment = models.ForeignKey(Payment, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["date", "id"]

    def __str__(self):
        return f"{self.date} {self.amount / 100:.2f} {self.reference}"
