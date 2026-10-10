"""Demo records (Phase 1 spec §9): flagged everywhere, never texted, convertible to real ones."""

from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.people.models import EmergencyContact, Parent, PickupPerson, Staff


def is_demo_only_phone(phone: str) -> bool:
    """True when the number is on demo records and on no real one. Demo numbers are made up and
    may belong to real people, so they are never texted."""
    on_demo = (
        Parent.objects.filter(phone=phone, is_demo=True).exists()
        or Staff.objects.filter(phone=phone, is_demo=True).exists()
        or EmergencyContact.objects.filter(phone=phone, student__is_demo=True).exists()
        or PickupPerson.objects.filter(phone=phone, is_demo=True).exists()
    )
    return on_demo and not (
        Parent.objects.filter(phone=phone, is_demo=False).exists()
        or Staff.objects.filter(phone=phone, is_demo=False).exists()
        or EmergencyContact.objects.filter(phone=phone, student__is_demo=False).exists()
        or PickupPerson.objects.filter(phone=phone, is_demo=False).exists()
        or User.objects.filter(
            phone=phone, parent_profile__isnull=True, staff_profile__isnull=True
        ).exists()
    )


def mark_real(item, *, by=None):
    """The Administrator ticked "This is now a real record" (§9)."""
    if item.is_demo:
        item.is_demo = False
        item.save(update_fields=["is_demo"])
        record(AuditLog.Action.DEMO_CONVERTED, actor=by, entity=item)
    return item
