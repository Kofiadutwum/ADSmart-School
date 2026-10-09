import pytest
from django.contrib.auth.models import AnonymousUser
from django.core.management import call_command
from django.db import DatabaseError, connection, transaction
from django.test import RequestFactory

from apps.accounts.models import User
from apps.audit.models import AppendOnlyError, AuditLog
from apps.audit.services import client_ip, record

pytestmark = pytest.mark.django_db


@pytest.fixture
def actor(school):
    return User.objects.create_user(
        "ama.admin", kind="staff", school=school, display_name="Ama Admin"
    )


def test_record_stores_actor_entity_values_school_and_address(actor, school):
    request = RequestFactory().post("/", REMOTE_ADDR="10.0.0.1", HTTP_X_FORWARDED_FOR="41.66.1.2")
    request.user = actor
    entry = record(
        AuditLog.Action.USER_CREATED, entity=actor, new={"kind": "staff"}, request=request
    )
    entry.refresh_from_db()
    assert entry.actor_id == actor.pk and entry.actor_name == "Ama Admin"
    assert entry.entity_type == "accounts.user" and entry.entity_id == str(actor.pk)
    assert entry.new_value == {"kind": "staff"} and entry.ip_address == "41.66.1.2"
    assert entry.school == school


def test_the_school_comes_from_the_actor_the_entity_or_is_given(actor, school, other_school):
    assert record(AuditLog.Action.SIGN_IN, actor=actor).school == school
    assert record(AuditLog.Action.UPDATED, entity=other_school).school == other_school
    assert record(AuditLog.Action.SIGN_IN_FAILED, school=other_school).school == other_school
    assert record(AuditLog.Action.SIGN_IN_FAILED).school is None


def test_anonymous_requests_have_no_actor_and_junk_addresses_are_dropped():
    request = RequestFactory().post("/", HTTP_X_FORWARDED_FOR="unknown")
    request.user = AnonymousUser()
    entry = record(AuditLog.Action.SIGN_IN_FAILED, request=request)
    assert entry.actor is None and entry.actor_name == "" and entry.ip_address is None


def test_client_ip_trusts_only_the_proxy_added_address():
    request = RequestFactory().get(
        "/", REMOTE_ADDR="127.0.0.1", HTTP_X_FORWARDED_FOR="6.6.6.6, 41.66.1.2"
    )
    assert client_ip(request) == "41.66.1.2"


def test_entries_cannot_be_changed_or_deleted():
    entry = record(AuditLog.Action.SIGN_IN_FAILED, new={"identifier": "someone"})
    entry.reason = "edited"
    with pytest.raises(AppendOnlyError):
        entry.save()
    with pytest.raises(AppendOnlyError):
        entry.delete()
    with pytest.raises(AppendOnlyError):
        AuditLog.objects.filter(pk=entry.pk).update(reason="edited")
    with pytest.raises(AppendOnlyError):
        AuditLog.objects.filter(pk=entry.pk).delete()


def test_the_database_refuses_changes_too():
    assert connection.vendor == "postgresql"
    entry = record(AuditLog.Action.SIGN_IN_FAILED)
    with pytest.raises(DatabaseError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("UPDATE audit_auditlog SET reason = 'x' WHERE id = %s", [entry.pk])
    with pytest.raises(DatabaseError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("DELETE FROM audit_auditlog WHERE id = %s", [entry.pk])


def test_entries_outlive_the_actor(actor):
    entry = record(AuditLog.Action.SIGN_IN, actor=actor)
    actor.delete()
    entry.refresh_from_db()
    assert entry.actor_name == "Ama Admin"


def test_create_user_command_is_audited(school):
    call_command("create_user", kind="parent", school="adsmart", username="024 123 4567")
    user = User.objects.get()
    entry = AuditLog.objects.get(action=AuditLog.Action.USER_CREATED)
    assert entry.entity_id == str(user.pk) and entry.school == school
    assert entry.new_value == {"kind": "parent", "roles": ["Parent"]}
