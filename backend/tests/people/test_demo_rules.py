import os
import subprocess
import sys
from pathlib import Path

import pytest

from apps.audit.models import AuditLog
from apps.notifications.backends import MemoryBackend
from apps.notifications.models import SmsMessage
from apps.notifications.sms import Purpose, send_sms
from apps.people import services
from apps.people.demo import is_demo_only_phone, mark_real
from tests.records import make_parent, make_staff, make_student

pytestmark = pytest.mark.django_db
PHONE = "+233241234567"
BACKEND = Path(__file__).resolve().parents[2]


def text(to=PHONE):
    return send_sms(to, "Hello", purpose=Purpose.SIGN_IN_CODE)


def test_numbers_linked_only_to_demo_records_are_never_texted(school):
    make_parent(school, is_demo=True)
    message = text()
    assert message.status == SmsMessage.Status.REFUSED and message.error == "demo_recipient"
    assert MemoryBackend.outbox == []


def test_a_real_person_with_the_same_number_is_texted(school, other_school):
    make_parent(school, is_demo=True)
    make_staff(other_school, phone=PHONE)
    assert text().status == SmsMessage.Status.SENT


def test_demo_pupils_emergency_contacts_are_not_texted(school):
    student = make_student(school, is_demo=True)
    services.add_emergency_contact(
        student, name="Yaw Mensah", phone="055 987 6543", relationship="Uncle"
    )
    assert is_demo_only_phone("+233559876543")
    assert not is_demo_only_phone("+233201112222")  # on no record at all


def test_demo_parents_get_the_usual_reply_and_no_code(api, school):
    make_parent(school, is_demo=True)
    response = api.post("/api/auth/parent/request-code", {"phone": "024 123 4567"}, format="json")
    assert response.json() == {"message": "If this number is registered, a code has been sent."}
    assert MemoryBackend.outbox == []


def test_converting_a_demo_record_is_audited_and_lifts_the_sms_ban(school):
    parent = make_parent(school, is_demo=True)
    mark_real(parent)
    parent.refresh_from_db()
    assert not parent.is_demo
    assert AuditLog.objects.get(action="DEMO_CONVERTED").entity_id == str(parent.pk)
    assert text().status == SmsMessage.Status.SENT


def import_settings(debug: str):
    env = {
        **os.environ,
        "DJANGO_SECRET_KEY": "settings-check-only-0123456789abcdefghijklmnopqrstuvwxyz",
        "DJANGO_DEBUG": debug,
        "DEMO_LOGINS_ENABLED": "true",
        "DATABASE_URL": "sqlite:///unused.sqlite3",
    }
    return subprocess.run(
        [sys.executable, "-c", "import config.settings"],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
    )


def test_demo_sign_ins_are_refused_outside_development():
    refused = import_settings("false")
    assert refused.returncode != 0 and "DEMO_LOGINS_ENABLED" in refused.stderr
    assert import_settings("true").returncode == 0
