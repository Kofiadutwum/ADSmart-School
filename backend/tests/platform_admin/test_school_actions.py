import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import TotpDevice
from apps.audit.models import AuditLog
from apps.notifications.backends import MemoryBackend
from tests.helpers import PASSWORD
from tests.records import make_staff

pytestmark = pytest.mark.django_db
STATUS = "/api/platform/schools/adsmart/status"


def administrator_of(school, phone="024 123 4567"):
    user = make_staff(school, roles_held=["Administrator"], phone=phone).user
    user.set_password(PASSWORD)
    user.save()
    return user


def test_suspending_needs_a_reason_and_takes_the_school_offline(api, console, school, ops):
    blank = console.post(STATUS, {"status": "suspended", "reason": ""}, format="json").json()
    assert blank["fields"] == {"reason": ["This field may not be blank."]}
    teacher = APIClient(HTTP_HOST="adsmart.localhost")
    teacher.force_login(make_staff(school).user)
    assert teacher.get("/api/auth/me").status_code == 200

    body = console.post(STATUS, {"status": "suspended", "reason": "Asked to pause"}, format="json")
    assert body.json()["status"] == "suspended"
    assert teacher.get("/api/auth/me").json()["code"] == "not_authenticated"
    assert api.get("/api/public/sites/adsmart.localhost/site").status_code == 503
    entry = AuditLog.objects.get(action="STATUS_CHANGED")
    assert entry.school == school and entry.actor == ops and entry.reason == "Asked to pause"
    assert entry.old_value == {"status": "trial"} and entry.new_value == {"status": "suspended"}

    console.post(STATUS, {"status": "active", "reason": "Back on"}, format="json")
    school.refresh_from_db()
    assert school.status == "active"


def test_resetting_an_administrators_password(console, school, ops):
    admin = administrator_of(school)
    url = f"/api/platform/schools/adsmart/administrators/{admin.pk}/reset-password"
    password = console.post(url).json()["one_time_password"]
    admin.refresh_from_db()
    assert admin.check_password(password) and not admin.check_password(PASSWORD)
    assert admin.must_change_password
    [message] = MemoryBackend.outbox
    assert message["to"] == "+233241234567"
    assert message["body"].startswith(
        "AD Smart School: SchoolSite support has reset your sign-in password."
    )
    entry = AuditLog.objects.get(action="PASSWORD_RESET")
    assert entry.school == school and entry.actor == ops


def test_resetting_an_administrators_authenticator(console, school):
    admin = administrator_of(school)
    TotpDevice.objects.create(user=admin, secret="JBSWY3DPEHPK3PXP", confirmed_at=timezone.now())
    url = f"/api/platform/schools/adsmart/administrators/{admin.pk}/reset-second-factor"
    assert console.post(url).status_code == 204
    assert not TotpDevice.objects.filter(user=admin).exists()
    assert "authenticator app" in MemoryBackend.outbox[-1]["body"]
    assert AuditLog.objects.get(action="SECOND_FACTOR_RESET").school == school


def test_only_a_schools_own_administrators_can_be_reset(console, school, other_school):
    teacher = make_staff(school, username="teacher.one").user
    someone_elses = administrator_of(other_school)
    for user in (teacher, someone_elses):
        url = f"/api/platform/schools/adsmart/administrators/{user.pk}/reset-password"
        assert console.post(url).status_code == 404
