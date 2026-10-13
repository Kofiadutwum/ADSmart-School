"""Which school a web address belongs to (amendment §2)."""

from dataclasses import dataclass

from django.conf import settings
from django.http import Http404
from django.http.request import split_domain_port

from apps.core.exceptions import ApiError
from apps.school.models import School, SchoolDomain

PLATFORM, ADMIN, SCHOOL = "platform", "admin", "school"
UNAVAILABLE = "This school's website is temporarily unavailable."


@dataclass(frozen=True)
class Site:
    kind: str
    school: School | None = None


def resolve_host(host: str) -> Site | None:
    """The platform site, the admin area, a school, or None for an unknown address."""
    domain, _port = split_domain_port(host.strip().lower())
    root = settings.PLATFORM_DOMAIN.lower()
    if domain in (root, f"www.{root}"):
        return Site(PLATFORM)
    if domain == f"admin.{root}" or (settings.ADMIN_HOST and domain == settings.ADMIN_HOST):
        return Site(ADMIN)
    school = None
    if domain.endswith(f".{root}"):
        slug = domain.removesuffix(f".{root}")
        if "." not in slug:
            school = School.objects.filter(slug=slug).first()
    elif domain:
        match = (
            SchoolDomain.objects.select_related("school")
            .filter(domain=domain, verified_at__isnull=False)
            .first()
        )
        school = match.school if match else None
    return Site(SCHOOL, school) if school else None


def school_for_host(host: str, *, for_portal: bool = False) -> School:
    """The school at this address: 404 if there is none, 503 while it is suspended. A school
    paused for an unpaid bill is unavailable too, except to its portal's frame, so its staff
    can still reach Billing and pay (business tools spec §3.7)."""
    site = resolve_host(host)
    if site is None or site.school is None:
        raise Http404("No school is registered at this address.")
    if site.school.is_suspended or (site.school.billing_paused and not for_portal):
        raise ApiError("suspended", UNAVAILABLE, 503)
    return site.school


def request_school(request) -> School:
    """The school whose address the browser used, forwarded by Next.js (amendment §2.4)."""
    return school_for_host(request.get_host())
