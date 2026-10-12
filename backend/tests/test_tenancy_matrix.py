"""Amendment §9: every API route is classified for school separation, so none slips in
unexamined. Add each new route here with how it finds its school, and test that."""

from django.urls import URLPattern, URLResolver, get_resolver

SCHOOL_FROM_PATH = "school from the host in the path (tests/website/test_public_api.py)"
SCHOOL_FROM_HOST = "school from the address used (tests/website/test_enquiries.py)"
PLATFORM_ONLY = "platform host only (tests/website/test_platform.py)"
NO_SCHOOL_DATA = "no school data"
PENDING_USER = "the pending user at their own address (tests/accounts/test_second_factor.py)"
PLATFORM_STAFF = "platform staff at the admin address only (tests/platform_admin/test_access.py)"
OWN_SESSIONS = "the signed-in user's own sessions (tests/accounts/test_sessions.py)"
SCHOOL_STAFF = "the signed-in staff member's own school only (tests/school_admin/test_access.py)"

CLASSIFIED = {
    "api/health": NO_SCHOOL_DATA,
    "api/cron/article-emails": NO_SCHOOL_DATA,
    "api/public/sites/<str:host>/site": SCHOOL_FROM_PATH,
    "api/public/sites/<str:host>/news": SCHOOL_FROM_PATH,
    "api/public/sites/<str:host>/news/<slug:slug>": SCHOOL_FROM_PATH,
    "api/public/sites/<str:host>/privacy-notice": SCHOOL_FROM_PATH,
    "api/public/enquiries/form-token": NO_SCHOOL_DATA,
    "api/public/enquiries": SCHOOL_FROM_HOST,
    "api/public/platform": "live schools' public details only (tests/website/test_platform.py)",
    "api/public/platform/privacy-notice": NO_SCHOOL_DATA,
    "api/public/platform/leads": PLATFORM_ONLY,
    "api/auth/login": "accounts of the address used only (tests/accounts/test_sign_in.py)",
    "api/auth/logout": NO_SCHOOL_DATA,
    "api/auth/me": "the signed-in user only (tests/accounts/test_sessions.py)",
    "api/auth/sessions": OWN_SESSIONS,
    "api/auth/sessions/<int:pk>": OWN_SESSIONS,
    "api/auth/password": "the signed-in user only (tests/accounts/test_sessions.py)",
    "api/auth/second-factor/email": PENDING_USER,
    "api/auth/second-factor/sms": PENDING_USER,
    "api/auth/second-factor/verify": PENDING_USER,
    "api/auth/parent/request-code": SCHOOL_FROM_HOST,
    "api/auth/parent/set-password": SCHOOL_FROM_HOST,
    "api/platform/schools": PLATFORM_STAFF,
    "api/platform/schools/<slug:slug>": PLATFORM_STAFF,
    "api/platform/schools/<slug:slug>/administrators": PLATFORM_STAFF,
    "api/platform/schools/<slug:slug>/status": PLATFORM_STAFF,
    "api/platform/schools/<slug:slug>/administrators/<int:pk>/reset-password": PLATFORM_STAFF,
    "api/platform/leads": PLATFORM_STAFF,
    "api/platform/leads/<int:pk>": PLATFORM_STAFF,
    "api/platform/audit": PLATFORM_STAFF,
    "api/platform/team": PLATFORM_STAFF,
    "api/platform/team/<int:pk>": PLATFORM_STAFF,
    "api/platform/team/<int:pk>/reset-password": PLATFORM_STAFF,
    "api/platform/website/gallery": PLATFORM_STAFF,
    "api/platform/website/gallery/order": PLATFORM_STAFF,
    "api/platform/website/gallery/<int:pk>": PLATFORM_STAFF,
    "api/platform/website/articles": PLATFORM_STAFF,
    "api/platform/website/articles/<int:pk>": PLATFORM_STAFF,
    "api/platform/website/articles/<int:pk>/cover": PLATFORM_STAFF,
    "api/platform/website/articles/<int:pk>/publish": PLATFORM_STAFF,
    "api/platform/website/articles/<int:pk>/unpublish": PLATFORM_STAFF,
    "api/platform/website/article-images": PLATFORM_STAFF,
    "api/platform/website/testimonials": PLATFORM_STAFF,
    "api/platform/website/testimonials/order": PLATFORM_STAFF,
    "api/platform/website/testimonials/<int:pk>": PLATFORM_STAFF,
    "api/platform/website/testimonials/<int:pk>/photo": PLATFORM_STAFF,
    "api/platform/website/faqs": PLATFORM_STAFF,
    "api/platform/website/faqs/order": PLATFORM_STAFF,
    "api/platform/website/faqs/<int:pk>": PLATFORM_STAFF,
    "api/platform/website/settings": PLATFORM_STAFF,
    "api/public/platform/articles": NO_SCHOOL_DATA,
    "api/public/platform/articles/<slug:slug>": NO_SCHOOL_DATA,
    "api/public/platform/tips": PLATFORM_ONLY,
    "api/public/platform/tips/confirm": NO_SCHOOL_DATA,
    "api/public/platform/tips/unsubscribe": NO_SCHOOL_DATA,
    "api/public/platform/visit": PLATFORM_ONLY,
    "api/platform/website/subscribers": PLATFORM_STAFF,
    "api/platform/website/subscribers.csv": PLATFORM_STAFF,
    "api/school/me": SCHOOL_STAFF,
    "api/school/staff": SCHOOL_STAFF,
    "api/school/staff/<int:pk>": SCHOOL_STAFF,
    "api/school/staff/<int:pk>/reset-password": SCHOOL_STAFF,
    "api/school/staff/<int:pk>/make-real": SCHOOL_STAFF,
    "api/school/classes": SCHOOL_STAFF,
    "api/school/classes/<int:pk>": SCHOOL_STAFF,
    "api/school/classes/<int:pk>/class-teacher": SCHOOL_STAFF,
    "api/school/subjects": SCHOOL_STAFF,
    "api/school/subjects/<int:pk>": SCHOOL_STAFF,
    "api/school/teaching": SCHOOL_STAFF,
    "api/school/teaching/<int:pk>": SCHOOL_STAFF,
    "api/school/years": SCHOOL_STAFF,
    "api/school/years/<int:pk>": SCHOOL_STAFF,
    "api/school/years/<int:pk>/terms": SCHOOL_STAFF,
    "api/school/terms/<int:pk>": SCHOOL_STAFF,
    "api/school/calendar": SCHOOL_STAFF,
    "api/school/calendar/<str:day>": SCHOOL_STAFF,
    "api/school/dashboard": SCHOOL_STAFF,
    "api/school/profile": SCHOOL_STAFF,
    "api/school/profile/logo": SCHOOL_STAFF,
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
