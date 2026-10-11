"""Business tools spec §5.6: tips by email, with confirmation and one-click unsubscribe."""

import re
import time

import pytest
from django.core import mail, signing
from django.utils import timezone

from apps.accounts import roles
from apps.platform_content.models import TipSubscriber
from apps.platform_content.tips import UNSUBSCRIBE_SALT, unsubscribe_url
from apps.website.enquiries import issue_form_token
from tests.platform_admin.conftest import make_platform_member, signed_in

pytestmark = pytest.mark.django_db
SIGN_UP = "/api/public/platform/tips"
CONFIRM = "/api/public/platform/tips/confirm"
LEAVE = "/api/public/platform/tips/unsubscribe"
CHECK_EMAIL = {"status": "check_email"}


def form(**overrides) -> dict:
    return {
        "email": "ama@example.com",
        "consent": True,
        "form_token": issue_form_token(now=time.time() - 10),
        "website": "",
        **overrides,
    }


def token_in(link_path: str, message) -> str:
    return re.search(rf"{link_path}\?token=(\S+)", message.body).group(1)


def test_sign_up_sends_one_confirmation_and_never_reveals_status(visitor):
    first = visitor.post(SIGN_UP, form(), format="json")
    assert first.status_code == 202 and first.json() == CHECK_EMAIL
    assert [message.to for message in mail.outbox] == [["ama@example.com"]]
    assert "/tips/confirm?token=" in mail.outbox[0].body

    again = visitor.post(SIGN_UP, form(email="AMA@Example.com"), format="json")
    assert again.status_code == 202 and again.json() == CHECK_EMAIL
    assert len(mail.outbox) == 1, "at most one confirmation an hour"

    TipSubscriber.objects.update(confirmed_at=timezone.now(), last_emailed_at=None)
    already = visitor.post(SIGN_UP, form(), format="json")
    assert already.json() == CHECK_EMAIL and len(mail.outbox) == 1
    assert TipSubscriber.objects.count() == 1


@pytest.mark.parametrize(
    ("change", "field"), [({"consent": False}, "consent"), ({"email": "not-an-email"}, "email")]
)
def test_needs_consent_and_a_valid_email(visitor, change, field):
    response = visitor.post(SIGN_UP, form(**change), format="json")

    assert response.status_code == 400 and field in response.json()["fields"]
    assert not TipSubscriber.objects.exists()


def test_confirm_and_unsubscribe_tokens_cannot_be_swapped(visitor):
    visitor.post(SIGN_UP, form(), format="json")
    confirm_token = token_in("/tips/confirm", mail.outbox[0])
    subscriber = TipSubscriber.objects.get()
    leave_token = signing.dumps(subscriber.pk, salt=UNSUBSCRIBE_SALT)

    assert (
        visitor.post(CONFIRM, {"token": leave_token}, format="json").json()["code"]
        == "invalid_link"
    )
    assert (
        visitor.post(LEAVE, {"token": confirm_token}, format="json").json()["code"]
        == "invalid_link"
    )
    confirmed = visitor.post(CONFIRM, {"token": confirm_token}, format="json")

    assert confirmed.status_code == 200 and confirmed.json() == {"status": "confirmed"}
    assert TipSubscriber.objects.subscribed().count() == 1


def test_expired_confirm_link_is_refused(visitor, monkeypatch):
    visitor.post(SIGN_UP, form(), format="json")
    token = token_in("/tips/confirm", mail.outbox[0])
    eight_days = time.time() + 8 * 24 * 3600
    monkeypatch.setattr(signing.time, "time", lambda: eight_days)

    assert visitor.post(CONFIRM, {"token": token}, format="json").status_code == 400
    assert not TipSubscriber.objects.subscribed().exists()


def test_unsubscribe_is_one_click_and_idempotent(visitor):
    now = timezone.now()
    subscriber = TipSubscriber.objects.create(
        email="ama@example.com", consent_at=now, confirmed_at=now
    )
    token = unsubscribe_url(subscriber).split("token=")[1]

    for _ in range(2):
        response = visitor.post(LEAVE, {"token": token}, format="json")
        assert response.status_code == 200 and response.json() == {"status": "unsubscribed"}
    assert not TipSubscriber.objects.subscribed().exists()

    visitor.post(SIGN_UP, form(), format="json")
    assert len(mail.outbox) == 1, "signing up again asks for confirmation again"


def test_honeypot_and_missing_form_token(visitor):
    trapped = visitor.post(SIGN_UP, form(website="https://spam.example"), format="json")
    assert trapped.status_code == 202 and trapped.json() == CHECK_EMAIL

    assert visitor.post(SIGN_UP, form(form_token=""), format="json").status_code == 400
    assert not TipSubscriber.objects.exists() and mail.outbox == []


def test_only_the_platform_host_takes_sign_ups(api):
    assert api.post(SIGN_UP, form(), format="json").status_code == 404


def test_subscriber_counts_and_csv_for_content_only(content):
    now = timezone.now()
    for email, confirmed, left in [
        ("b@example.com", now, None),
        ("=cmd@example.com", now, None),
        ("pending@example.com", None, None),
        ("left@example.com", now, now),
    ]:
        TipSubscriber.objects.create(
            email=email, consent_at=now, confirmed_at=confirmed, unsubscribed_at=left
        )

    counts = content.get("/api/platform/website/subscribers").json()
    assert counts == {"confirmed": 2, "pending": 1, "unsubscribed": 1}

    download = content.get("/api/platform/website/subscribers.csv")
    assert download["Content-Type"].startswith("text/csv")
    assert "attachment" in download["Content-Disposition"]
    lines = download.content.decode("utf-8-sig").splitlines()
    assert lines[0] == "email,confirmed_at"
    assert [line.split(",")[0] for line in lines[1:]] == ["'=cmd@example.com", "b@example.com"]

    support = signed_in(make_platform_member("helper", roles.PLATFORM_SUPPORT))
    assert support.get("/api/platform/website/subscribers.csv").status_code == 403
