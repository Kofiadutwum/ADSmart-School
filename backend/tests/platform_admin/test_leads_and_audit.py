import pytest

from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.platform_admin import services
from apps.website.models import Lead
from tests.records import make_staff

pytestmark = pytest.mark.django_db


def make_lead(**fields):
    return Lead.objects.create(
        **{
            "school_name": "Hope Academy",
            "contact_name": "Yaw Asante",
            "phone": "+233241234567",
            "town": "Tema",
            "data_consent": True,
            **fields,
        }
    )


def test_the_leads_inbox_shows_the_newest_first(console):
    make_lead(school_name="First")
    make_lead(school_name="Second")
    names = [lead["school_name"] for lead in console.get("/api/platform/leads").json()]
    assert names == ["Second", "First"]


def test_updating_a_lead_is_audited(console, ops):
    url = f"/api/platform/leads/{make_lead().pk}"
    refused = console.patch(url, {"status": "lost", "staff_notes": ""}, format="json").json()
    assert "status" in refused["fields"]
    changes = {"status": "contacted", "staff_notes": "Visiting on Monday"}
    body = console.patch(url, changes, format="json").json()
    assert body["status"] == "contacted" and body["staff_notes"] == "Visiting on Monday"
    entry = AuditLog.objects.get(action="UPDATED")
    assert entry.actor == ops and entry.school is None
    assert entry.new_value == {"status": "contacted"}


def test_the_platform_audit_log_shows_platform_events_and_platform_staff_actions(
    console, ops, school
):
    record(AuditLog.Action.SIGN_IN, actor=ops)  # a platform event
    teacher = make_staff(school)  # the school's own entry
    record(AuditLog.Action.SIGN_IN, actor=teacher.user)  # also the school's own
    services.set_status(school, "active", reason="Signed up", by=ops)  # platform staff, in a school
    rows = console.get("/api/platform/audit").json()
    assert [(row["action"], row["school"]) for row in rows] == [
        ("STATUS_CHANGED", "AD Smart School"),
        ("SIGN_IN", None),
    ]
    assert rows[0]["actor_name"] == "Kojo Ops" and rows[0]["reason"] == "Signed up"
