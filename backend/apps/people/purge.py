"""purge_demo (Phase 1 spec §9): delete the remaining demo records, never a real one."""

from django.db import transaction
from django.db.models import Q

from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.consent.models import Consent
from apps.people.models import Guardianship, Parent, PickupPerson, Staff, Student


class DemoReferencesError(Exception):
    def __init__(self, problems: list[str]):
        super().__init__("Real records still point at demo ones.")
        self.problems = problems


def demo_references(school) -> list[str]:
    """Real records that still point at demo ones; deleting would break them."""
    mixed = (
        Guardianship.objects.for_school(school)
        .filter(
            Q(parent__is_demo=True, student__is_demo=False)
            | Q(parent__is_demo=False, student__is_demo=True)
        )
        .select_related("parent", "student")
    )
    problems = [
        f"{link.parent} is a guardian of {link.student}, but only one of them is a demo record."
        for link in mixed
    ]
    pickups = PickupPerson.objects.for_school(school).filter(is_demo=False, student__is_demo=True)
    problems += [
        f"{person.name} (a real pick-up person) is linked to the demo pupil {person.student}."
        for person in pickups.select_related("student")
    ]
    by_demo_account = Q(recorded_by__parent_profile__is_demo=True) | Q(
        recorded_by__staff_profile__is_demo=True
    )
    for_real_person = Q(student__is_demo=False) | Q(parent__is_demo=False)
    consents = Consent.objects.for_school(school).filter(by_demo_account).filter(for_real_person)
    problems += [
        f"A consent for a real record was recorded by the demo account {consent.recorded_by}."
        for consent in consents.select_related("recorded_by")
    ]
    return problems


def _demo_rows(school) -> dict:
    return {
        "pupils": Student.objects.for_school(school).filter(is_demo=True),
        "parents": Parent.objects.for_school(school).filter(is_demo=True),
        "staff": Staff.objects.for_school(school).filter(is_demo=True),
        "pick-up people": PickupPerson.objects.for_school(school).filter(is_demo=True),
    }


def demo_counts(school) -> dict[str, int]:
    return {name: rows.count() for name, rows in _demo_rows(school).items()}


@transaction.atomic
def purge_demo(school, *, by=None) -> dict[str, int]:
    problems = demo_references(school)
    if problems:
        raise DemoReferencesError(problems)
    counts = demo_counts(school)
    rows = _demo_rows(school)
    accounts = [
        *rows["pupils"].exclude(user=None).values_list("user_id", flat=True),
        *rows["parents"].values_list("user_id", flat=True),
        *rows["staff"].values_list("user_id", flat=True),
    ]
    rows["pick-up people"].delete()
    rows["pupils"].delete()  # with their contacts, enrolments, guardianships and consents
    rows["parents"].delete()
    rows["staff"].delete()  # with their class and teaching assignments
    User.objects.filter(pk__in=accounts).delete()
    record(AuditLog.Action.DEMO_PURGED, actor=by, school=school, entity_type="demo", new=counts)
    return counts
