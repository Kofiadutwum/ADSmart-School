"""The bookshop and uniforms (SMS spec §16–§17): catalogues with price history, required books per
class, stock with every movement recorded, orders paid before collection and collected with a
code, uniform sizes remembered per pupil, and reminders for orders not collected."""

import secrets
from datetime import timedelta

from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response

from apps.accounts import roles
from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError
from apps.core.resources import Resource
from apps.finance import services
from apps.finance.models import Account, LedgerEntry, Payment
from apps.notifications.sms import Purpose
from apps.people.models import Student
from apps.school_admin.views import SchoolView
from apps.shop.models import (
    Book,
    BookPrice,
    Order,
    OrderLine,
    RequiredBook,
    StockMovement,
    UniformItem,
    UniformSize,
    UniformStock,
)

READ = (roles.BOOKSHOP, roles.ACCOUNTANT, roles.ADMINISTRATOR, roles.HEAD_TEACHER, roles.PROPRIETOR)
WRITE = (roles.BOOKSHOP,)
CODE_LETTERS = "ACDEFGHJKMNPQRTUVWXY3479"  # no look-alikes such as 0/O or 1/I


class BookResource(Resource):
    model = Book
    fields = ("title", "subject", "year_group", "academic_year", "price", "low_stock_at", "active")
    shown = ("stock",)
    labels = ("subject", "academic_year")
    read_roles, write_roles = READ, WRITE
    deletable = False

    @classmethod
    def validate(cls, view, data, instance=None):
        view._old_price = instance.price if instance else None
        return data

    @classmethod
    def after_save(cls, view, instance, created):
        if created or view._old_price != instance.price:
            BookPrice.objects.create(
                school=instance.school,
                book=instance,
                price=instance.price,
                changed_by=view.request.user,
            )


class RequiredBookResource(Resource):
    model = RequiredBook
    fields = ("school_class", "book")
    labels = ("school_class", "book")
    read_roles = (*READ, roles.TEACHER)
    write_roles = (roles.BOOKSHOP, roles.HEAD_TEACHER)
    filters = {"class": "school_class_id"}


class UniformResource(Resource):
    model = UniformItem
    fields = ("name", "sizes", "price", "low_stock_at", "active")
    read_roles, write_roles = READ, WRITE
    deletable = False

    @classmethod
    def validate(cls, view, data, instance=None):
        sizes = data.get("sizes")
        if sizes is not None and (
            not isinstance(sizes, list) or not all(isinstance(s, str) and s for s in sizes)
        ):
            raise serializers.ValidationError({"sizes": ["List the sizes, for example S, M, L."]})
        return data

    @classmethod
    def row(cls, view, instance):
        stock = {row.size: row.quantity for row in UniformStock.objects.filter(item=instance)}
        return {**super().row(view, instance), "stock": stock}


class PriceHistoryView(SchoolView):
    read_roles = READ

    def get(self, request, pk):
        book = get_object_or_404(Book.objects.for_school(self.school), pk=pk)
        return Response(
            [
                {"price": row.price, "changed_at": row.changed_at, "by": str(row.changed_by or "")}
                for row in book.prices.all()
            ]
        )


class StockSerializer(serializers.Serializer):
    book = serializers.IntegerField(required=False)
    uniform = serializers.IntegerField(required=False)
    size = serializers.CharField(max_length=20, required=False, default="", allow_blank=True)
    change = serializers.IntegerField(min_value=-10000, max_value=10000)
    reason = serializers.ChoiceField(
        choices=[
            StockMovement.Reason.RECEIVED,
            StockMovement.Reason.ADJUSTED,
            StockMovement.Reason.RETURNED,
        ]
    )
    note = serializers.CharField(max_length=200, required=False, default="", allow_blank=True)


def move_stock(
    school, *, book=None, uniform=None, size="", change: int, reason: str, note="", by=None
) -> None:
    if book is not None:
        Book.objects.filter(pk=book.pk).update(stock=F("stock") + change)
    else:
        if size not in uniform.sizes:
            raise ApiError("bad_size", f"{uniform.name} doesn't come in size {size}.")
        row, _ = UniformStock.objects.get_or_create(school=school, item=uniform, size=size)
        UniformStock.objects.filter(pk=row.pk).update(quantity=F("quantity") + change)
    StockMovement.objects.create(
        school=school,
        book=book,
        uniform=uniform,
        size=size,
        change=change,
        reason=reason,
        note=note,
        recorded_by=by,
    )


def in_stock(line: OrderLine) -> bool:
    wanted = line.quantity - line.issued
    if line.book_id:
        return Book.objects.get(pk=line.book_id).stock >= wanted
    row = UniformStock.objects.filter(item_id=line.uniform_id, size=line.size).first()
    return bool(row) and row.quantity >= wanted


def tell_ready(order: Order) -> None:
    services.text_family(order.student, "BOOKS_READY", Purpose.REMINDER, code=order.collection_code)


def release_waiting(school) -> int:
    """Paid orders waiting for stock become ready once everything is in."""
    ready = 0
    for order in Order.objects.filter(school=school, status=Order.Status.AWAITING_STOCK):
        if all(in_stock(line) for line in order.lines.all()):
            order.status = Order.Status.READY
            order.save(update_fields=["status"])
            tell_ready(order)
            ready += 1
    return ready


class StockView(SchoolView):
    read_roles, write_roles = READ, WRITE

    def get(self, request):
        moves = StockMovement.objects.for_school(self.school).select_related(
            "book", "uniform", "recorded_by"
        )[:300]
        return Response(
            [
                {
                    "id": m.pk,
                    "item": m.book.title if m.book_id else f"{m.uniform.name} {m.size}",
                    "change": m.change,
                    "reason": m.reason,
                    "note": m.note,
                    "by": str(m.recorded_by or ""),
                    "at": m.created_at,
                }
                for m in moves
            ]
        )

    @transaction.atomic
    def post(self, request):
        data = validated(StockSerializer, request)
        book = (
            get_object_or_404(Book.objects.for_school(self.school), pk=data["book"])
            if data.get("book")
            else None
        )
        uniform = (
            get_object_or_404(UniformItem.objects.for_school(self.school), pk=data["uniform"])
            if data.get("uniform")
            else None
        )
        if (book is None) == (uniform is None):
            raise ApiError("which", "Choose a book or a uniform item.")
        move_stock(
            self.school,
            book=book,
            uniform=uniform,
            size=data["size"],
            change=data["change"],
            reason=data["reason"],
            note=data["note"],
            by=request.user,
        )
        ready = release_waiting(self.school) if data["change"] > 0 else 0
        return Response({"ready_now": ready}, status=201)


def low_stock(school) -> list[dict]:
    rows = [
        {"item": book.title, "stock": book.stock, "low_at": book.low_stock_at}
        for book in Book.objects.filter(school=school, active=True, stock__lte=F("low_stock_at"))
    ]
    for row in UniformStock.objects.filter(
        school=school, item__active=True, quantity__lte=F("item__low_stock_at")
    ).select_related("item"):
        rows.append(
            {
                "item": f"{row.item.name} {row.size}",
                "stock": row.quantity,
                "low_at": row.item.low_stock_at,
            }
        )
    return rows


class LowStockView(SchoolView):
    read_roles = READ

    def get(self, request):
        return Response(low_stock(self.school))


def order_row(order: Order) -> dict:
    return {
        "id": order.pk,
        "student": order.student_id,
        "student_name": f"{order.student.first_name} {order.student.surname}",
        "kind": order.kind,
        "status": order.status,
        "total": order.total,
        "collection_code": order.collection_code,
        "paid_at": order.paid_at,
        "created_at": order.created_at,
        "lines": [
            {
                "id": line.pk,
                "item": line.book.title if line.book_id else line.uniform.name,
                "size": line.size,
                "quantity": line.quantity,
                "price": line.price,
                "issued": line.issued,
            }
            for line in order.lines.select_related("book", "uniform")
        ],
    }


class ItemSerializer(serializers.Serializer):
    book = serializers.IntegerField(required=False)
    uniform = serializers.IntegerField(required=False)
    size = serializers.CharField(max_length=20, required=False, default="", allow_blank=True)
    quantity = serializers.IntegerField(min_value=1, max_value=50, default=1)


class OrderSerializer(serializers.Serializer):
    student = serializers.IntegerField()
    kind = serializers.ChoiceField(choices=Order.Kind.choices)
    items = ItemSerializer(many=True)


def collection_code(school) -> str:
    while True:
        code = "".join(secrets.choice(CODE_LETTERS) for _ in range(6))
        if not Order.objects.filter(school=school, collection_code=code).exists():
            return code


@transaction.atomic
def create_order(student: Student, kind: str, items: list[dict], *, by) -> Order:
    if not items:
        raise ApiError("empty", "Choose at least one item.")
    school = student.school
    order = Order.objects.create(
        school=school,
        student=student,
        ordered_by=by,
        kind=kind,
        collection_code=collection_code(school),
    )
    total = 0
    for item in items:
        if kind == Order.Kind.BOOKS:
            book = get_object_or_404(
                Book.objects.filter(school=school, active=True), pk=item.get("book")
            )
            line = OrderLine(
                school=school, order=order, book=book, quantity=item["quantity"], price=book.price
            )
        else:
            uniform = get_object_or_404(
                UniformItem.objects.filter(school=school, active=True), pk=item.get("uniform")
            )
            if item.get("size") not in uniform.sizes:
                raise ApiError("bad_size", f"Choose a size for {uniform.name}.")
            line = OrderLine(
                school=school,
                order=order,
                uniform=uniform,
                size=item["size"],
                quantity=item["quantity"],
                price=uniform.price,
            )
        line.save()
        total += line.price * line.quantity
    order.total = total
    order.save(update_fields=["total"])
    account = Account.BOOKSHOP if kind == Order.Kind.BOOKS else Account.UNIFORM
    services.post(
        student, account, LedgerEntry.Kind.CHARGE, total, f"Order {order.collection_code}", by=by
    )
    return order


@transaction.atomic
def pay_order(order: Order, *, method: str, reference: str = "", by=None) -> Payment:
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.status != Order.Status.AWAITING_PAYMENT:
        raise ApiError("paid", "This order is already paid.")
    purpose = (
        Payment.Purpose.BOOKSHOP if order.kind == Order.Kind.BOOKS else Payment.Purpose.UNIFORM
    )
    payment = services.record_payment(
        order.student, order.total, method, by=by, purpose=purpose, reference=reference, order=order
    )
    order.paid_at = timezone.now()
    ready = all(in_stock(line) for line in order.lines.all())
    order.status = Order.Status.READY if ready else Order.Status.AWAITING_STOCK
    order.save(update_fields=["paid_at", "status"])
    if ready:
        transaction.on_commit(lambda: tell_ready(order))
    return payment


class OrdersView(SchoolView):
    read_roles, write_roles = READ, WRITE

    def get(self, request):
        orders = Order.objects.for_school(self.school).select_related("student")
        status = request.query_params.get("status")
        if status in Order.Status.values:
            orders = orders.filter(status=status)
        if request.query_params.get("student"):
            orders = orders.filter(student_id=request.query_params["student"])
        return Response([order_row(order) for order in orders[:300]])

    def post(self, request):
        data = validated(OrderSerializer, request)
        pupil = get_object_or_404(Student.objects.for_school(self.school), pk=data["student"])
        order = create_order(pupil, data["kind"], data["items"], by=request.user)
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=order,
            new={"total": order.total},
            request=request,
        )
        return Response(order_row(order), status=201)


class PayOrderSerializer(serializers.Serializer):
    method = serializers.ChoiceField(
        choices=[Payment.Method.CASH, Payment.Method.MOMO, Payment.Method.WALLET]
    )
    reference = serializers.CharField(max_length=80, required=False, default="", allow_blank=True)


class OrderPayView(SchoolView):
    read_roles = READ
    write_roles = (roles.BOOKSHOP, roles.ACCOUNTANT)

    def post(self, request, pk):
        order = get_object_or_404(Order.objects.for_school(self.school), pk=pk)
        data = validated(PayOrderSerializer, request)
        pay_order(order, method=data["method"], reference=data["reference"], by=request.user)
        order.refresh_from_db()
        return Response(order_row(order))


class OrderCancelView(SchoolView):
    read_roles = READ
    write_roles = WRITE

    @transaction.atomic
    def post(self, request, pk):
        order = get_object_or_404(Order.objects.for_school(self.school).select_for_update(), pk=pk)
        if order.status != Order.Status.AWAITING_PAYMENT:
            raise ApiError("paid", "A paid order is refunded through the Accountant instead.")
        order.status = Order.Status.CANCELLED
        order.save(update_fields=["status"])
        account = Account.BOOKSHOP if order.kind == Order.Kind.BOOKS else Account.UNIFORM
        services.post(
            order.student,
            account,
            LedgerEntry.Kind.ADJUSTMENT,
            -order.total,
            f"Order {order.collection_code} cancelled",
            by=request.user,
        )
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=order,
            new={"cancelled": True},
            request=request,
        )
        return Response(order_row(order))


class CollectLineSerializer(serializers.Serializer):
    line = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1, max_value=50)


class CollectSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=8)
    lines = CollectLineSerializer(many=True, required=False)


class CollectView(SchoolView):
    """The keeper types the code; everything in stock is handed over (or the lines chosen)."""

    read_roles, write_roles = READ, WRITE

    def get(self, request):
        code = request.query_params.get("code", "").strip().upper()
        order = get_object_or_404(
            Order.objects.for_school(self.school).select_related("student"), collection_code=code
        )
        return Response(order_row(order))

    @transaction.atomic
    def post(self, request):
        data = validated(CollectSerializer, request)
        order = get_object_or_404(
            Order.objects.for_school(self.school).select_for_update(),
            collection_code=data["code"].strip().upper(),
        )
        if order.status not in (
            Order.Status.READY,
            Order.Status.PART_ISSUED,
            Order.Status.AWAITING_STOCK,
        ):
            raise ApiError("not_ready", "This order can't be collected now.")
        chosen = {row["line"]: row["quantity"] for row in data.get("lines") or []}
        for line in order.lines.select_related("uniform"):
            wanted = (
                chosen.get(line.pk, line.quantity - line.issued)
                if chosen
                else line.quantity - line.issued
            )
            wanted = min(wanted, line.quantity - line.issued)
            if wanted <= 0 or not in_stock(
                OrderLine(
                    book_id=line.book_id,
                    uniform_id=line.uniform_id,
                    size=line.size,
                    quantity=wanted,
                )
            ):
                continue
            move_stock(
                self.school,
                book=line.book,
                uniform=line.uniform,
                size=line.size,
                change=-wanted,
                reason=StockMovement.Reason.ISSUED,
                note=f"Order {order.collection_code}",
                by=request.user,
            )
            OrderLine.objects.filter(pk=line.pk).update(issued=F("issued") + wanted)
            if line.uniform_id:
                UniformSize.objects.create(
                    school=self.school, student=order.student, item=line.uniform, size=line.size
                )
        order.refresh_from_db()
        done = all(line.issued >= line.quantity for line in order.lines.all())
        order.status = Order.Status.ISSUED if done else Order.Status.PART_ISSUED
        order.save(update_fields=["status"])
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=order,
            new={"status": order.status},
            request=request,
        )
        return Response(order_row(order))


class SizesView(SchoolView):
    read_roles = READ

    def get(self, request, pk):
        pupil = get_object_or_404(Student.objects.for_school(self.school), pk=pk)
        latest: dict[int, dict] = {}
        for row in UniformSize.objects.filter(student=pupil).select_related("item"):
            latest.setdefault(
                row.item_id,
                {"item": row.item.name, "size": row.size, "recorded_at": row.recorded_at},
            )
        return Response(list(latest.values()))


def remind_uncollected(today=None) -> int:
    """A ready order not collected within a week gets one reminder."""
    cutoff = timezone.now() - timedelta(days=7)
    sent = 0
    for order in Order.objects.filter(
        status=Order.Status.READY, paid_at__lt=cutoff, reminded_at__isnull=True
    ):
        tell_ready(order)
        order.reminded_at = timezone.now()
        order.save(update_fields=["reminded_at"])
        sent += 1
    return sent


def low_stock_alerts() -> int:
    from apps.school.models import School

    return sum(len(low_stock(school)) for school in School.objects.all())
