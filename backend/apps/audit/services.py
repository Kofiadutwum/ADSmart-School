"""The only way to write audit entries (Phase 1 spec §3.8)."""

import ipaddress

from rest_framework.throttling import BaseThrottle

from apps.audit.models import AuditLog
from apps.school.models import School


def client_ip(request) -> str | None:
    """The visitor's address, trusting X-Forwarded-For only as far as NUM_PROXIES allows."""
    value = BaseThrottle().get_ident(request)
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        return None


def _school_of(*objects) -> School | None:
    for obj in objects:
        if isinstance(obj, School):
            return obj
        school = getattr(obj, "school", None)
        if isinstance(school, School):
            return school
    return None


def record(
    action: str,
    *,
    actor=None,
    entity=None,
    entity_type: str = "",
    entity_id="",
    old=None,
    new=None,
    reason: str = "",
    request=None,
    school: School | None = None,
) -> AuditLog:
    if actor is None and request is not None:
        user = getattr(request, "user", None)
        actor = user if user is not None and user.is_authenticated else None
    if entity is not None:
        entity_type, entity_id = entity._meta.label_lower, entity.pk
    return AuditLog.objects.create(
        school=school or _school_of(actor, entity),
        actor=actor,
        actor_name=str(actor) if actor else "",
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        old_value=old,
        new_value=new,
        reason=reason,
        ip_address=client_ip(request) if request is not None else None,
    )
