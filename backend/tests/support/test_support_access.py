"""Support access (MS §4): the platform team reads a school's records only while its
Administrator allows it, and every look is logged."""

import pytest

from apps.audit.models import AuditLog
from apps.support.models import SupportGrant
from tests.records import make_student

pytestmark = pytest.mark.django_db


def test_records_stay_closed_until_the_school_allows_it(school, client_for, member_client):
    make_student(school)
    support = member_client("Platform Support")
    closed = support.get(f"/api/platform/schools/{school.slug}/records/pupils")
    assert closed.json()["code"] == "no_support_access"

    admin = client_for("Administrator")
    assert admin.post("/api/school/support/access", {"hours": 24}, format="json").status_code == 201
    opened = support.get(f"/api/platform/schools/{school.slug}/records/pupils")
    assert opened.status_code == 200
    assert len(opened.json()["rows"]) == 1
    assert AuditLog.objects.filter(action=AuditLog.Action.VIEWED_RESTRICTED, school=school).exists()

    assert admin.delete("/api/school/support/access").status_code == 200
    assert SupportGrant.active_for(school) is None
    assert (
        support.get(f"/api/platform/schools/{school.slug}/records/pupils").json()["code"]
        == "no_support_access"
    )


def test_only_24_or_72_hours_can_be_given(school, client_for):
    admin = client_for("Administrator")
    assert (
        admin.post("/api/school/support/access", {"hours": 1000}, format="json").status_code == 400
    )
    assert (
        client_for("Head Teacher")
        .post("/api/school/support/access", {"hours": 24}, format="json")
        .status_code
        == 403
    )
