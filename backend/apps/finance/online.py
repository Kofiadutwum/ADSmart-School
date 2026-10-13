"""Paying online (SMS spec §18, business tools spec §3.5): Paystack for Mobile Money and card,
SMS payment links that need no sign-in, USSD, and matching imported statements.

The browser's word is never trusted: a payment is recorded only after Paystack confirms the
reference, amount and currency, and only once however often Paystack tells us. Card and MoMo
details never reach this system.
"""

import csv
import hashlib
import hmac
import io
import json
import secrets
import urllib.request
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.accounts import roles
from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError
from apps.core.phones import normalise_gh_phone
from apps.finance import services
from apps.finance.models import (
    OnlinePayment,
    Payment,
    PaymentLink,
    StatementImport,
    StatementLine,
    UssdSession,
)
from apps.notifications.sms import Purpose
from apps.people.models import Student
from apps.school.models import School
from apps.school_admin.views import SchoolView

API = "https://api.paystack.co"


class PayIpThrottle(AnonRateThrottle):
    scope = "pay_ip"


PAYER_EMAIL = (
    "payments@adsmartschool.com"  # Paystack needs an email; the payer's own is used when known
)


def paystack(method: str, path: str, payload: dict | None = None) -> dict:
    if not settings.PAYSTACK_SECRET_KEY:
        raise ApiError(
            "payments_off", "Online payment isn't set up yet. Please pay at the school.", 503
        )
    request = urllib.request.Request(
        API + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={
            "Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}",
            "Content-Type": "application/json",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:  # noqa: S310 - fixed host
            return json.loads(response.read() or b"{}")
    except OSError as exc:
        raise ApiError(
            "payments_unavailable", "Online payment isn't answering just now. Try again soon.", 503
        ) from exc


def new_reference() -> str:
    return "ADS" + secrets.token_hex(10).upper()


def start_payment(
    *,
    purpose,
    amount,
    school=None,
    student=None,
    bill=None,
    order=None,
    email="",
    phone="",
    callback="",
    channel="PAYSTACK",
) -> dict:
    if amount < 100:
        raise ApiError("bad_amount", "Enter at least GHS 1.00.")
    online = OnlinePayment.objects.create(
        school=school,
        reference=new_reference(),
        purpose=purpose,
        student=student,
        bill=bill,
        order=order,
        amount=amount,
        phone=phone,
        channel=channel,
    )
    answer = paystack(
        "POST",
        "/transaction/initialize",
        {
            "email": email or PAYER_EMAIL,
            "amount": amount,
            "currency": "GHS",
            "reference": online.reference,
            "callback_url": callback,
            "channels": ["mobile_money", "card"],
            "metadata": {"purpose": purpose, "school": school.slug if school else ""},
        },
    )
    if not answer.get("status"):
        online.status = OnlinePayment.Status.FAILED
        online.save(update_fields=["status"])
        raise ApiError("payments_refused", "The payment couldn't be started. Please try again.")
    return {"reference": online.reference, "authorization_url": answer["data"]["authorization_url"]}


@transaction.atomic
def complete(reference: str) -> OnlinePayment:
    """Ask Paystack, then record the payment once. Safe to call again for the same reference."""
    online = OnlinePayment.objects.select_for_update().filter(reference=reference).first()
    if online is None:
        raise ApiError("unknown_reference", "That payment isn't known.", 404)
    if online.status != OnlinePayment.Status.PENDING:
        return online
    data = paystack("GET", f"/transaction/verify/{reference}").get("data") or {}
    status = data.get("status")
    if status in ("failed", "abandoned", "reversed"):
        online.status = OnlinePayment.Status.FAILED
        online.save(update_fields=["status"])
        return online
    if status != "success":
        return online  # still waiting; the re-check job asks again later
    if int(data.get("amount", 0)) != online.amount or data.get("currency") != "GHS":
        online.status = OnlinePayment.Status.FAILED
        online.save(update_fields=["status"])
        record(
            AuditLog.Action.UPDATED,
            actor=None,
            entity=online,
            new={"mismatch": data.get("amount")},
            school=online.school,
        )
        return online
    online.status, online.verified_at, online.provider_id = (
        OnlinePayment.Status.SUCCESS,
        timezone.now(),
        str(data.get("id", "")),
    )
    method = Payment.Method.USSD if online.channel == "USSD" else Payment.Method.PAYSTACK
    if online.purpose == OnlinePayment.Purpose.PLATFORM_BILL:
        from apps.billing.services import record_bill_payment

        record_bill_payment(online.bill, online.amount, "PAYSTACK", reference=online.reference)
    elif online.purpose == OnlinePayment.Purpose.ORDER:
        from apps.shop.api import pay_order

        online.payment = pay_order(online.order, method=method, reference=online.reference)
    else:
        purpose = (
            Payment.Purpose.WALLET
            if online.purpose == OnlinePayment.Purpose.WALLET
            else Payment.Purpose.FEES
        )
        online.payment = services.record_payment(
            online.student,
            online.amount,
            method,
            purpose=purpose,
            reference=online.reference,
            payer_phone=online.phone,
        )
    online.save()
    return online


def online_row(online: OnlinePayment) -> dict:
    return {
        "reference": online.reference,
        "status": online.status,
        "amount": online.amount,
        "purpose": online.purpose,
        "receipt_number": online.payment.receipt_number if online.payment_id else "",
    }


class VerifyView(APIView):
    """Where Paystack sends the payer back. It only triggers our own check with Paystack."""

    permission_classes = [AllowAny]
    throttle_classes = [PayIpThrottle]

    def get(self, request):
        reference = request.query_params.get("reference", "")[:40]
        return Response(online_row(complete(reference)))


class WebhookView(APIView):
    """Paystack's message: the signature is checked, then Paystack is asked to confirm."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        secret = settings.PAYSTACK_SECRET_KEY.encode()
        expected = hmac.new(secret, request.body, hashlib.sha512).hexdigest()
        if not secret or not hmac.compare_digest(
            expected, request.headers.get("x-paystack-signature", "")
        ):
            raise ApiError("bad_signature", "Unknown sender.", 401)
        event = json.loads(request.body or b"{}")
        if event.get("event") == "charge.success":
            reference = str((event.get("data") or {}).get("reference", ""))[:40]
            if OnlinePayment.objects.filter(reference=reference).exists():
                complete(reference)
        return Response({"ok": True})


def recheck_pending() -> int:
    """Payments still pending after ten minutes are checked again, for two days."""
    now = timezone.now()
    done = 0
    for online in OnlinePayment.objects.filter(
        status=OnlinePayment.Status.PENDING,
        created_at__lt=now - timedelta(minutes=10),
        created_at__gt=now - timedelta(days=2),
    ):
        try:
            done += complete(online.reference).status != OnlinePayment.Status.PENDING
        except ApiError:
            continue
    return done


class PaySerializer(serializers.Serializer):
    student = serializers.IntegerField()
    amount = serializers.IntegerField(min_value=100, max_value=100_000_000)
    purpose = serializers.ChoiceField(
        choices=[OnlinePayment.Purpose.FEES, OnlinePayment.Purpose.WALLET]
    )


def pay_for_ward(request, wards) -> dict:
    """Pay now from the parent portal, for one of the parent's own children."""
    data = validated(PaySerializer, request)
    pupil = get_object_or_404(wards, pk=data["student"])
    return start_payment(
        purpose=data["purpose"],
        amount=data["amount"],
        school=pupil.school,
        student=pupil,
        email=request.user.email,
        phone=request.user.phone,
        callback=pupil.school.base_url() + "/portal/payments/done",
    )


class LinkSerializer(serializers.Serializer):
    student = serializers.IntegerField()
    amount = serializers.IntegerField(min_value=100, max_value=100_000_000)
    purpose = serializers.ChoiceField(
        choices=[OnlinePayment.Purpose.FEES, OnlinePayment.Purpose.WALLET],
        default=OnlinePayment.Purpose.FEES,
    )


class PaymentLinksView(SchoolView):
    read_roles = (roles.ACCOUNTANT, roles.ADMINISTRATOR, roles.HEAD_TEACHER, roles.PROPRIETOR)
    write_roles = (roles.ACCOUNTANT,)

    def get(self, request):
        links = (
            PaymentLink.objects.for_school(self.school)
            .select_related("student")
            .order_by("-created_at")[:200]
        )
        return Response(
            [
                {
                    "id": link.pk,
                    "student": f"{link.student.first_name} {link.student.surname}",
                    "amount": link.amount,
                    "purpose": link.purpose,
                    "expires_at": link.expires_at,
                    "created_at": link.created_at,
                }
                for link in links
            ]
        )

    @transaction.atomic
    def post(self, request):
        data = validated(LinkSerializer, request)
        pupil = get_object_or_404(Student.objects.for_school(self.school), pk=data["student"])
        link = PaymentLink.objects.create(
            school=self.school,
            token=secrets.token_urlsafe(24),
            student=pupil,
            purpose=data["purpose"],
            amount=data["amount"],
            expires_at=timezone.now() + timedelta(days=7),
            created_by=request.user,
        )
        url = f"{self.school.base_url()}/pay/{link.token}"
        sent = services.text_family(
            pupil,
            "PAYMENT_LINK",
            Purpose.PAYMENT_LINK,
            amount=services.money(link.amount),
            link=url,
        )
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=link,
            new={"texts": sent},
            request=request,
        )
        return Response({"id": link.pk, "texts": sent}, status=201)


class PublicLinkView(APIView):
    """A payment link opened from an SMS: only the school, the child's first name and the amount."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [PayIpThrottle]

    def link(self, token) -> PaymentLink:
        link = PaymentLink.objects.filter(token=token).select_related("student", "school").first()
        if link is None or link.expires_at < timezone.now():
            raise ApiError("expired", "This link has expired. Ask the school for a new one.", 404)
        return link

    def get(self, request, token):
        link = self.link(token)
        return Response(
            {
                "school": link.school.name,
                "pupil": link.student.first_name,
                "amount": link.amount,
                "purpose": link.purpose,
            }
        )

    def post(self, request, token):
        link = self.link(token)
        return Response(
            start_payment(
                purpose=link.purpose,
                amount=link.amount,
                school=link.school,
                student=link.student,
                callback=f"{link.school.base_url()}/pay/{token}/done",
            )
        )


# ---- USSD (SMS spec §18) -------------------------------------------------------------------

PROVIDERS = {
    "mtn": ("024", "054", "055", "059", "025", "053"),
    "vod": ("020", "050"),
    "atl": ("026", "056", "027", "057"),
}


def momo_provider(phone: str) -> str | None:
    local = "0" + phone[-9:]
    return next((code for code, prefixes in PROVIDERS.items() if local[:3] in prefixes), None)


def ussd_step(session_id: str, phone: str, text: str, simulate: bool = False) -> tuple[str, bool]:
    """One screen of the menu: school code, pupil ID, amount, confirm. Returns (message, more)."""
    session, _ = UssdSession.objects.get_or_create(session_id=session_id, defaults={"phone": phone})
    data, text = session.data, (text or "").strip()
    step = data.get("step", "start")
    if step == "start":
        data["step"] = "school"
        reply = ("Welcome to ADsmartschool. Enter your school's code:", True)
    elif step == "school":
        school = School.objects.filter(slug=text.lower()).first()
        if school is None:
            reply = ("That school code wasn't found. Enter the school's code:", True)
        else:
            data.update(step="pupil", school=school.pk)
            reply = ("Enter the pupil's ID:", True)
    elif step == "pupil":
        pupil = Student.objects.filter(school_id=data["school"], student_id=text.upper()).first()
        if pupil is None:
            session.wrong_ids += 1
            reply = (
                ("Too many wrong IDs. Please contact the school.", False)
                if session.wrong_ids >= 3
                else ("That ID wasn't found. Enter the pupil's ID:", True)
            )
        else:
            owed = services.balance(pupil)
            data.update(step="amount", pupil=pupil.pk)
            reply = (
                f"{pupil.first_name}: GHS {services.money(max(owed, 0))} owed. "
                "Enter the amount to pay:",
                True,
            )
    elif step == "amount":
        try:
            amount = int(Decimal(text) * 100)
        except InvalidOperation, ValueError:
            amount = 0
        if amount < 100:
            reply = ("Enter an amount of at least 1.00:", True)
        else:
            data.update(step="confirm", amount=amount)
            reply = (f"Pay GHS {services.money(amount)}? 1 to confirm, 2 to cancel", True)
    elif step == "confirm" and text == "1":
        pupil = Student.objects.get(pk=data["pupil"])
        provider = momo_provider(phone)
        if provider is None:
            reply = ("This number can't pay by Mobile Money here. Please pay at the school.", False)
        elif simulate:
            reply = (
                f"(Simulator) A prompt for GHS {services.money(data['amount'])} "
                f"would go to {phone}.",
                False,
            )
        else:
            online = OnlinePayment.objects.create(
                school=pupil.school,
                reference=new_reference(),
                channel="USSD",
                purpose=OnlinePayment.Purpose.FEES,
                student=pupil,
                amount=data["amount"],
                phone=phone,
            )
            paystack(
                "POST",
                "/charge",
                {
                    "email": PAYER_EMAIL,
                    "amount": online.amount,
                    "currency": "GHS",
                    "reference": online.reference,
                    "mobile_money": {"phone": "0" + phone[-9:], "provider": provider},
                },
            )
            reply = ("Approve the prompt on your phone to pay. You'll get a receipt by SMS.", False)
    else:
        reply = ("Cancelled.", False)
    session.data = data
    session.save()
    return reply


class UssdSerializer(serializers.Serializer):
    sessionID = serializers.CharField(max_length=80)  # noqa: N815 - the provider's names
    msisdn = serializers.CharField(max_length=16)
    userData = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")  # noqa: N815


class UssdView(APIView):
    """The USSD provider's callback, protected by the shared secret."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        if not settings.USSD_SECRET or not hmac.compare_digest(
            request.query_params.get("token", ""), settings.USSD_SECRET
        ):
            raise ApiError("not_allowed", "Unknown sender.", 401)
        data = validated(UssdSerializer, request)
        phone = normalise_gh_phone(data["msisdn"])
        message, more = ussd_step(data["sessionID"], phone, data["userData"])
        return Response(
            {
                "sessionID": data["sessionID"],
                "msisdn": data["msisdn"],
                "message": message,
                "continueSession": more,
            }
        )


class SimulatorSerializer(serializers.Serializer):
    session = serializers.CharField(max_length=40)
    phone = serializers.CharField(max_length=16)
    text = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")


class UssdSimulatorView(SchoolView):
    """Try the USSD menu from the portal; nothing is charged."""

    read_roles = write_roles = (roles.ACCOUNTANT, roles.ADMINISTRATOR)

    def post(self, request):
        data = validated(SimulatorSerializer, request)
        message, more = ussd_step(
            f"sim-{request.user.pk}-{data['session']}",
            normalise_gh_phone(data["phone"]),
            data["text"],
            simulate=True,
        )
        return Response({"message": message, "more": more})


# ---- Statement imports (SMS spec §18): match MoMo, Paystack and bank statements ------------


class StatementUploadSerializer(serializers.Serializer):
    source = serializers.ChoiceField(choices=StatementImport.Source.choices)
    file = serializers.FileField()

    def validate_file(self, value):
        if value.size > 2 * 1024 * 1024:
            raise serializers.ValidationError("Choose a file under 2 MB.")
        return value


def parse_statement(raw: bytes) -> list[dict]:
    """CSV with date (YYYY-MM-DD), amount (GHS), reference and description columns."""
    rows = []
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig", errors="replace")))
    for number, row in enumerate(reader, start=2):
        row = {key.strip().lower(): (value or "").strip() for key, value in row.items() if key}
        try:
            date = serializers.DateField().to_internal_value(row.get("date", ""))
            amount = int(Decimal(row.get("amount", "").replace(",", "")) * 100)
        except (serializers.ValidationError, InvalidOperation, ValueError) as exc:
            raise ApiError(
                "bad_file", f"Line {number} needs a date (YYYY-MM-DD) and an amount."
            ) from exc
        rows.append(
            {
                "date": date,
                "amount": amount,
                "reference": row.get("reference", "")[:120],
                "description": row.get("description", "")[:200],
            }
        )
    return rows


def line_row(line: StatementLine) -> dict:
    return {
        "id": line.pk,
        "date": line.date,
        "amount": line.amount,
        "reference": line.reference,
        "description": line.description,
        "status": line.status,
        "payment": line.payment.receipt_number if line.payment_id else "",
    }


class StatementsView(SchoolView):
    read_roles = (roles.ACCOUNTANT, roles.HEAD_TEACHER, roles.PROPRIETOR)
    write_roles = (roles.ACCOUNTANT,)
    parser_classes = [MultiPartParser]

    def get(self, request):
        imports = StatementImport.objects.for_school(self.school)[:50]
        return Response(
            [
                {
                    "id": item.pk,
                    "source": item.source,
                    "file_name": item.file_name,
                    "created_at": item.created_at,
                    "unmatched": item.lines.filter(status=StatementLine.Status.UNMATCHED).count(),
                    "lines": item.lines.count(),
                }
                for item in imports
            ]
        )

    @transaction.atomic
    def post(self, request):
        data = validated(StatementUploadSerializer, request)
        rows = parse_statement(data["file"].read())
        statement = StatementImport.objects.create(
            school=self.school,
            source=data["source"],
            file_name=data["file"].name[:200],
            uploaded_by=request.user,
        )
        payments = Payment.objects.for_school(self.school).filter(status=Payment.Status.CONFIRMED)
        for row in rows:
            match = (
                payments.filter(reference=row["reference"], amount=row["amount"]).first()
                if row["reference"]
                else None
            )
            StatementLine.objects.create(
                school=self.school,
                statement=statement,
                payment=match,
                status=StatementLine.Status.MATCHED if match else StatementLine.Status.UNMATCHED,
                **row,
            )
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=statement,
            new={"lines": len(rows)},
            request=request,
        )
        return Response(
            {"id": statement.pk, "lines": [line_row(line) for line in statement.lines.all()]},
            status=201,
        )


class StatementDetailView(SchoolView):
    read_roles = (roles.ACCOUNTANT, roles.HEAD_TEACHER, roles.PROPRIETOR)

    def get(self, request, pk):
        statement = get_object_or_404(StatementImport.objects.for_school(self.school), pk=pk)
        return Response([line_row(line) for line in statement.lines.select_related("payment")])


class LineSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=StatementLine.Status.choices)
    payment = serializers.IntegerField(required=False, allow_null=True)


class StatementLineView(SchoolView):
    read_roles = write_roles = (roles.ACCOUNTANT,)

    @transaction.atomic
    def patch(self, request, pk):
        line = get_object_or_404(StatementLine.objects.for_school(self.school), pk=pk)
        data = validated(LineSerializer, request)
        line.status = data["status"]
        if data.get("payment"):
            line.payment = get_object_or_404(
                Payment.objects.for_school(self.school), pk=data["payment"]
            )
        elif data["status"] != StatementLine.Status.MATCHED:
            line.payment = None
        line.save()
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=line,
            new={"status": line.status},
            request=request,
        )
        return Response(line_row(line))
