import json

import pytest

from apps.notifications import sms
from apps.notifications.backends import ConsoleBackend, MemoryBackend
from apps.notifications.models import SmsMessage

pytestmark = pytest.mark.django_db
TO = "+233241234567"


class BrokenBackend:
    def send(self, to, body):
        raise RuntimeError("gateway down")


def test_send_logs_the_redacted_body_and_its_school(school):
    message = sms.send_sms(
        TO,
        "AD Smart School: your code is 123456",
        purpose=sms.Purpose.SIGN_IN_CODE,
        redacted_body="AD Smart School: your code is ******",
        school=school,
    )
    assert message.status == SmsMessage.Status.SENT
    saved = SmsMessage.objects.get()
    assert saved.body == "AD Smart School: your code is ******" and saved.school == school
    assert MemoryBackend.outbox == [{"to": TO, "body": "AD Smart School: your code is 123456"}]


def test_sign_in_codes_are_limited_to_three_an_hour_per_number():
    for _ in range(3):
        assert sms.send_sms(TO, "code", purpose=sms.Purpose.SIGN_IN_CODE).status == "SENT"
    refused = sms.send_sms(TO, "code", purpose=sms.Purpose.SIGN_IN_CODE)
    assert refused.status == SmsMessage.Status.REFUSED and refused.error == "rate_limited"
    assert len(MemoryBackend.outbox) == 3
    assert sms.send_sms("+233201234567", "code", purpose=sms.Purpose.SIGN_IN_CODE).status == "SENT"


def test_backend_failures_are_logged_not_raised(settings):
    settings.SMS_BACKEND = "tests.notifications.test_sms.BrokenBackend"
    message = sms.send_sms(TO, "hello", purpose=sms.Purpose.SIGN_IN_CODE)
    assert message.status == SmsMessage.Status.FAILED and "gateway down" in message.error


def test_console_backend_appends_to_the_outbox_file(tmp_path, settings):
    settings.SMS_FILE_PATH = str(tmp_path / "sms.jsonl")
    ConsoleBackend().send(TO, "Your code is 123456")
    line = json.loads((tmp_path / "sms.jsonl").read_text(encoding="utf-8").splitlines()[-1])
    assert line["to"] == TO and line["body"] == "Your code is 123456"
