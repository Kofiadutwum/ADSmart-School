"""The Administrator's dashboard: counts and the go-live checklist (Phase 1 spec §7.2)."""

from django.conf import settings
from django.db.models import Count

from apps.academics.models import AcademicYear, SchoolClass
from apps.academics.structure import BANDS, YEAR_GROUPS
from apps.accounts import roles
from apps.accounts.models import User
from apps.people.models import Enrolment, Student
from apps.people.purge import demo_counts
from apps.school.models import School
from apps.website.models import Enquiry, PhotoSlot
from apps.website.services import publication_blockers

# Sending texts for real needs a provider; these only print, keep or refuse them.
NOT_A_PROVIDER = ("ConsoleBackend", "MemoryBackend", "UnavailableBackend")
PROFILE_FIELDS = {"address": "address", "ghana_post_gps": "GhanaPost GPS", "logo": "logo"}


def current_year(school: School) -> AcademicYear | None:
    return AcademicYear.objects.for_school(school).filter(is_current=True).first()


def counts(school: School) -> dict:
    year = current_year(school)
    active = Student.objects.for_school(school).filter(status=Student.Status.ACTIVE)
    places = Enrolment.objects.for_school(school).filter(
        academic_year=year, end_date__isnull=True, student__in=active
    )
    by_group = places.values("school_class__year_group").annotate(n=Count("student", distinct=True))
    by_band: dict[str, int] = {}
    for row in by_group:
        band = YEAR_GROUPS[row["school_class__year_group"]].band
        by_band[band] = by_band.get(band, 0) + row["n"]
    staff = User.objects.filter(school=school, kind=User.Kind.STAFF, is_active=True)
    return {
        "students_by_level": [
            {"band": code, "label": BANDS[code].name, "count": by_band[code]}
            for code in BANDS
            if code in by_band
        ],
        "not_in_class": active.exclude(pk__in=places.values("student")).count(),
        "staff": staff.count(),
        "classes": SchoolClass.objects.for_school(school).filter(academic_year=year).count(),
        "new_enquiries": Enquiry.objects.for_school(school)
        .filter(status=Enquiry.Status.NEW)
        .count(),
    }


def staff_without_codes(school: School):
    """Staff whose role needs a second factor but who have nowhere to receive the code."""
    return (
        User.objects.filter(
            school=school,
            kind=User.Kind.STAFF,
            is_active=True,
            groups__name__in=roles.SECOND_FACTOR_ROLES,
        )
        .filter(email="", phone="")
        .distinct()
    )


def _item(key: str, label: str, done: bool, detail: str) -> dict:
    return {"key": key, "label": label, "done": done, "detail": "" if done else detail}


def checklist(school: School) -> list[dict]:
    placeholders = PhotoSlot.objects.for_school(school).filter(is_placeholder=True).count()
    demo = sum(demo_counts(school).values())
    provider = not settings.SMS_BACKEND.endswith(NOT_A_PROVIDER)
    no_codes = [str(user) for user in staff_without_codes(school)]
    missing = [label for field, label in PROFILE_FIELDS.items() if not getattr(school, field)]
    short = (
        Student.objects.for_school(school)
        .filter(status=Student.Status.ACTIVE)
        .annotate(n=Count("emergency_contacts"))
        .filter(n__lt=2)
        .count()
    )
    blockers = publication_blockers(school)
    return [
        _item(
            "placeholder_photos",
            "Real photos on the website",
            not placeholders,
            f"{placeholders} photo(s) are still placeholders.",
        ),
        _item("demo_records", "Demo records removed", not demo, f"{demo} demo record(s) remain."),
        _item(
            "sms_provider",
            "Text message provider connected",
            provider,
            "Texts are not sent yet. The platform team connects the provider.",
        ),
        _item(
            "second_factor",
            "Every Administrator, Head Teacher, Accountant and Proprietor can get sign-in codes",
            not no_codes,
            f"Add a mobile number or email for: {', '.join(no_codes)}.",
        ),
        _item(
            "profile",
            "School profile complete",
            not missing,
            f"Add the school's {', '.join(missing)}.",
        ),
        _item(
            "emergency_contacts",
            "Every pupil has two emergency contacts",
            not short,
            f"{short} pupil(s) have fewer than two.",
        ),
        _item(
            "site_live",
            "Website live",
            not blockers,
            "; ".join(blockers) + ".",
        ),
    ]


def dashboard(school: School) -> dict:
    return {"counts": counts(school), "checklist": checklist(school)}
