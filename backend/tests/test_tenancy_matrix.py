"""Amendment §9: every API route is classified for school separation, so none slips in
unexamined. Add each new route here with how it finds its school, and test that."""

from django.urls import URLPattern, URLResolver, get_resolver

SCHOOL_FROM_PATH = "school from the host in the path (tests/website/test_public_api.py)"
SCHOOL_FROM_HOST = "school from the address used (tests/website/test_enquiries.py)"
PLATFORM_ONLY = "platform host only (tests/website/test_platform.py)"
NO_SCHOOL_DATA = "no school data"

CLASSIFIED = {
    "api/health": NO_SCHOOL_DATA,
    "api/public/sites/<str:host>/site": SCHOOL_FROM_PATH,
    "api/public/sites/<str:host>/news": SCHOOL_FROM_PATH,
    "api/public/sites/<str:host>/news/<slug:slug>": SCHOOL_FROM_PATH,
    "api/public/sites/<str:host>/privacy-notice": SCHOOL_FROM_PATH,
    "api/public/enquiries/form-token": NO_SCHOOL_DATA,
    "api/public/enquiries": SCHOOL_FROM_HOST,
    "api/public/platform": "live schools' public details only (tests/website/test_platform.py)",
    "api/public/platform/privacy-notice": NO_SCHOOL_DATA,
    "api/public/platform/leads": PLATFORM_ONLY,
}


def _routes(patterns, prefix=""):
    for entry in patterns:
        if isinstance(entry, URLResolver):
            yield from _routes(entry.url_patterns, prefix + str(entry.pattern))
        elif isinstance(entry, URLPattern):
            yield prefix + str(entry.pattern)


def test_every_api_route_is_classified():
    routes = {route for route in _routes(get_resolver().url_patterns) if route.startswith("api/")}

    assert routes == set(CLASSIFIED), "Classify new API routes in tests/test_tenancy_matrix.py"
