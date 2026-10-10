"""Recording consent given or withdrawn (Phase 1 spec §3.5, §11.3)."""

from django.utils import timezone

from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.consent.models import Consent, PrivacyNotice
from apps.people.models import Parent, Student

PARENT_TYPES = {Consent.Type.SMS_CONTACT}


def _field(subject, consent_type: str) -> str:
    if isinstance(subject, Student) and consent_type not in PARENT_TYPES:
        return "student"
    if isinstance(subject, Parent) and consent_type in PARENT_TYPES:
        return "parent"
    raise ValueError(f"{Consent.Type(consent_type).label} is not recorded for this person.")


def set_consent(subject, consent_type: str, given: bool, *, by=None) -> Consent:
    """Give or withdraw one consent. The row keeps the latest answer; the audit log keeps all."""
    field = _field(subject, consent_type)
    consent = Consent.objects.filter(**{field: subject, "type": consent_type}).first()
    consent = consent or Consent(**{field: subject, "type": consent_type})
    now = timezone.now()
    consent.given = given
    if given:
        consent.given_at, consent.withdrawn_at = now, None
    else:
        consent.withdrawn_at = now
    consent.recorded_by = by
    consent.privacy_notice = PrivacyNotice.current(subject.school)
    consent.save()
    action = AuditLog.Action.CONSENT_GIVEN if given else AuditLog.Action.CONSENT_WITHDRAWN
    record(action, actor=by, entity=consent, new={"type": consent_type, field: subject.pk})
    return consent


def has_consent(subject, consent_type: str) -> bool:
    field = "student" if isinstance(subject, Student) else "parent"
    return Consent.objects.filter(**{field: subject, "type": consent_type, "given": True}).exists()


def photo_allowed(student) -> bool:
    """Without photo consent, screens show the pupil's initials instead (§3.5)."""
    return has_consent(student, Consent.Type.PHOTO_USE)
