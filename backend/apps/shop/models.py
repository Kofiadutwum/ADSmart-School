"""The school bookshop and uniforms (SMS spec §16–§17): catalogues with price history, required
books per class, stock movements, orders collected by code, and uniform sizes per pupil."""

from django.conf import settings
from django.db import models

from apps.school.models import SchoolOwned

USER = settings.AUTH_USER_MODEL


class Book(SchoolOwned):
    title = models.CharField(max_length=200)
    subject = models.ForeignKey(
        "academics.Subject", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    year_group = models.CharField(max_length=12, blank=True)
    academic_year = models.ForeignKey(
        "academics.AcademicYear", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    price = models.PositiveIntegerField()
    stock = models.IntegerField(default=0)
    low_stock_at = models.PositiveIntegerField(default=5)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["title"]

    def __str__(self):
        return self.title


class BookPrice(SchoolOwned):
    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name="prices")
    price = models.PositiveIntegerField()
    changed_by = models.ForeignKey(
        USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-changed_at"]

    def __str__(self):
        return f"{self.book}: {self.price / 100:.2f}"


class RequiredBook(SchoolOwned):
    school_class = models.ForeignKey(
        "academics.SchoolClass", on_delete=models.CASCADE, related_name="required_books"
    )
    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name="+")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["school_class", "book"], name="shop_one_required_book")
        ]

    def __str__(self):
        return f"{self.book} for {self.school_class}"


class UniformItem(SchoolOwned):
    name = models.CharField(max_length=120)
    sizes = models.JSONField(default=list, help_text='For example ["S", "M", "L"]')
    price = models.PositiveIntegerField()
    low_stock_at = models.PositiveIntegerField(default=5)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class UniformStock(SchoolOwned):
    item = models.ForeignKey(UniformItem, on_delete=models.CASCADE, related_name="stock")
    size = models.CharField(max_length=20)
    quantity = models.IntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["item", "size"], name="shop_one_stock_row")]

    def __str__(self):
        return f"{self.item} {self.size}: {self.quantity}"


class UniformSize(SchoolOwned):
    """Sizes a pupil has had, so the next order can suggest one (SMS spec §17)."""

    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="+")
    item = models.ForeignKey(UniformItem, on_delete=models.CASCADE, related_name="+")
    size = models.CharField(max_length=20)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-recorded_at"]

    def __str__(self):
        return f"{self.student}: {self.item} {self.size}"


class StockMovement(SchoolOwned):
    class Reason(models.TextChoices):
        RECEIVED = "RECEIVED", "Received"
        ISSUED = "ISSUED", "Issued"
        ADJUSTED = "ADJUSTED", "Adjusted"
        RETURNED = "RETURNED", "Returned"

    book = models.ForeignKey(
        Book, null=True, blank=True, on_delete=models.CASCADE, related_name="movements"
    )
    uniform = models.ForeignKey(
        UniformItem, null=True, blank=True, on_delete=models.CASCADE, related_name="movements"
    )
    size = models.CharField(max_length=20, blank=True)
    change = models.IntegerField()
    reason = models.CharField(max_length=8, choices=Reason.choices)
    note = models.CharField(max_length=200, blank=True)
    recorded_by = models.ForeignKey(
        USER, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_reason_display()} {self.change}"


class Order(SchoolOwned):
    class Kind(models.TextChoices):
        BOOKS = "BOOKS", "Books"
        UNIFORMS = "UNIFORMS", "Uniforms"

    class Status(models.TextChoices):
        AWAITING_PAYMENT = "AWAITING_PAYMENT", "Waiting for payment"
        AWAITING_STOCK = "AWAITING_STOCK", "Paid, waiting for stock"
        READY = "READY", "Ready to collect"
        PART_ISSUED = "PART_ISSUED", "Partly collected"
        ISSUED = "ISSUED", "Collected"
        CANCELLED = "CANCELLED", "Cancelled"
        REFUNDED = "REFUNDED", "Refunded"

    student = models.ForeignKey("people.Student", on_delete=models.PROTECT, related_name="orders")
    ordered_by = models.ForeignKey(USER, on_delete=models.PROTECT, related_name="+")
    kind = models.CharField(max_length=8, choices=Kind.choices)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.AWAITING_PAYMENT
    )
    total = models.PositiveIntegerField(default=0)
    collection_code = models.CharField(max_length=8)
    paid_at = models.DateTimeField(null=True, blank=True)
    reminded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_kind_display()} order {self.collection_code}"


class OrderLine(SchoolOwned):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="lines")
    book = models.ForeignKey(
        Book, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    uniform = models.ForeignKey(
        UniformItem, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    size = models.CharField(max_length=20, blank=True)
    quantity = models.PositiveSmallIntegerField(default=1)
    price = models.PositiveIntegerField()
    issued = models.PositiveSmallIntegerField(default=0)

    def __str__(self):
        return f"{self.quantity} x {self.book or self.uniform}"
