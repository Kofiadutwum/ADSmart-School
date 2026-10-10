# Plan 5A: Platform Admin Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At `admin.<platform domain>`, the platform team can:
- See every school, with its status and go-live progress.
- Add a school, with its placeholder website and first Administrator. A one-time password is shown once.
- Open a school's page, with counts, the go-live list and its Administrators.
- Suspend or reactivate a school, with a reason.
- Reset an Administrator's password or authenticator app.
- Work through the "Get your school online" leads.
- Read the platform audit log.

**Architecture:**
- **New app:** a Django app `platform_admin` serves `/api/platform/…`. It has no models of its own; it works on `School`, `User`, `Lead` and `AuditLog`.
- **Who gets in:** only accounts with `kind = platform` are let through.
- **Address binding:** Plan 3's session binding already signs everyone else out at the admin address, and signs platform staff out anywhere else.
- **Screens:** the frontend adds them under `/platform-admin/(portal)/`, with navigation in `PortalShell`.

**Tech Stack:** Django 6.1.2, DRF 3.18.3, Next.js 16.4, React 19.3, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-09-multi-school-platform-design.md` (§4, §5, §9)

**Split of Plan 5** (rulings; amendment §10 lists one plan):
- **5A (this plan):** the platform admin area.
- **5B:** the school admin screens (Phase 1 spec §7), support grants and on-demand revalidation.
- **Plan 6:** custom domains (add, check, make primary), which need DNS checks and TLS.

## Global Constraints

- **Who gets in:**
  - Only `kind = platform` accounts use `/api/platform/`.
  - Anyone else gets 403: `not_authenticated` when signed out, `permission_denied` when signed in.
- **What platform staff see without a support grant** (amendment §4): a school's setup details, go-live list, counts, status and its Administrators. Never pupils', parents' or staff records.
- **Add a school** (§5):
  - It starts on `trial`, with its placeholder site, through `apps.website.provisioning.create_school`.
  - Its first Administrator gets a one-time password: 12 characters from an unambiguous alphabet, shown as `xxxx-xxxx-xxxx`. It is shown once, and `must_change_password` is set.
  - It is all or nothing: one transaction.
- **Resets** (§4):
  - Only a school's Administrators can be reset.
  - A password reset signs the Administrator out everywhere.
  - Both resets are audited in the school's log and announced by SMS: `<School>: <Platform> support has reset …`.
- **Status:** a change needs a reason and is audited. Suspending signs the school's users out at their next request and takes the site offline (Plan 2, Plan 3).
- **Audit:** platform staff actions are recorded with the school they touched. The platform audit view shows platform events (no school) plus every action by platform staff.
- **Errors:** always `{code, message, fields}`. Nested fields read as `administrator.username`.
- **Copy:** UK English, plain language.

## Review Focus

1. **A school user or a signed-out visitor calling `/api/platform/…`.** Every route, every method gets 403. Task 1 pins this by walking the URL list, so routes added later are covered too.
2. **Half-made schools.** When the Administrator's details are wrong, no school is created. Task 2 pins this.
3. **Resetting someone who is not an Administrator, or one from another school.** This returns 404. Task 3 pins this.
4. **Records leaking into the school page.** The school page returns exactly its listed keys: counts, never rows. Task 1 pins this.
5. **A suspended school's own users and website.** They are signed out at once, and the site API answers 503. Task 3 pins this.

---

### Task 1: Platform admin API: who gets in, the schools list and a school's page

**Files:**
- Create: `backend/apps/platform_admin/__init__.py`, `apps.py`, `permissions.py`, `views.py`, `urls.py`
- Modify: `backend/config/settings.py` (INSTALLED_APPS), `backend/config/urls.py`, `backend/tests/test_tenancy_matrix.py`
- Test: `backend/tests/platform_admin/__init__.py`, `conftest.py`, `test_access.py`, `test_schools.py`

**Interfaces:**
- Consumes:
  - `School`, `publication_blockers` (Plan 2).
  - `User`, `roles`, `has_authenticator`, `validated` (Plan 3).
  - `Student`, `Staff`, `Parent` (Plan 4); `Enquiry` (Plan 2).
- Produces:
  - **`permissions.IsPlatformStaff`** and the base view `views.PlatformStaffView`.
  - **`GET /api/platform/schools?q=&status=`** returns `[SchoolRow]`. Each row is `{slug, name, town, region, status, is_public, to_do, created_at, url}`.
  - **`GET /api/platform/schools/<slug>`** returns `SchoolDetail`, which is `SchoolRow` plus `{phone, email, levels_offered, blockers, counts{pupils, staff, parents, enquiries}, administrators[{id, name, username, phone, has_authenticator, must_change_password, last_sign_in, is_active}]}`.
  - **Helpers:** `views.school_row(school, blockers=None)`, `views.school_detail(school)`.
  - **Test fixtures:** `ops` (a platform user, "Kojo Ops") and `console` (an `APIClient` signed in as `ops` at `admin.localhost`).

- [ ] **Step 1: Write the failing tests**

`backend/tests/platform_admin/__init__.py`:
```python

```

`backend/tests/platform_admin/conftest.py`:
```python
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User


@pytest.fixture
def ops(db):
    return User.objects.create_user("ops", kind=User.Kind.PLATFORM, display_name="Kojo Ops")


@pytest.fixture
def console(ops):
    """A member of the platform team, signed in at the admin address."""
    client = APIClient(HTTP_HOST="admin.localhost")
    client.force_login(ops)
    return client
```

`backend/tests/platform_admin/test_access.py`:
```python
import pytest
from django.urls import get_resolver
from rest_framework.test import APIClient

from tests.records import make_staff
from tests.test_tenancy_matrix import _routes

pytestmark = pytest.mark.django_db


def platform_paths() -> list[str]:
    """Every /api/platform/ route, so routes added later are checked too."""
    routes = [route for route in _routes(get_resolver().url_patterns) if route.startswith("api/platform/")]
    return ["/" + route.replace("<slug:slug>", "adsmart").replace("<int:pk>", "1") for route in routes]


@pytest.mark.parametrize("method", ["get", "post", "patch"])
def test_signed_out_visitors_are_refused_everywhere(method, school):
    paths = platform_paths()
    assert paths
    visitor = APIClient(HTTP_HOST="admin.localhost")
    for path in paths:
        response = getattr(visitor, method)(path)
        assert response.status_code == 403, path
        assert response.json()["code"] == "not_authenticated", path


def test_school_staff_are_refused_everywhere(school):
    staff = make_staff(school, roles_held=["Administrator"])
    client = APIClient(HTTP_HOST="adsmart.localhost")
    client.force_login(staff.user)
    for path in platform_paths():
        response = client.get(path)
        assert response.status_code == 403, path
        assert response.json()["code"] == "permission_denied", path


def test_platform_staff_at_a_school_address_count_as_signed_out(ops, school):
    client = APIClient(HTTP_HOST="adsmart.localhost")
    client.force_login(ops)
    assert client.get("/api/platform/schools").json()["code"] == "not_authenticated"
```

`backend/tests/platform_admin/test_schools.py`:
```python
import pytest

from tests.records import make_staff, make_student

pytestmark = pytest.mark.django_db
DETAIL_KEYS = {
    "slug",
    "name",
    "town",
    "region",
    "status",
    "is_public",
    "to_do",
    "created_at",
    "url",
    "phone",
    "email",
    "levels_offered",
    "blockers",
    "counts",
    "administrators",
}


def test_the_schools_list_shows_status_and_go_live_progress(console, school, other_school):
    rows = console.get("/api/platform/schools").json()
    assert [row["slug"] for row in rows] == ["adsmart", "brightfuture"]
    first = rows[0]
    assert first["status"] == "trial" and first["is_public"] is False and first["to_do"] == 2
    assert first["url"] == "http://adsmart.localhost:3000"


def test_search_and_status_filter(console, school, other_school):
    other_school.status = "active"
    other_school.save()
    found = console.get("/api/platform/schools?q=ejisu").json()
    assert [row["slug"] for row in found] == ["brightfuture"]
    active = console.get("/api/platform/schools?status=active").json()
    assert [row["slug"] for row in active] == ["brightfuture"]


def test_a_school_page_shows_counts_the_go_live_list_and_administrators_only(console, school):
    make_student(school)
    make_staff(school, roles_held=["Administrator"], phone="024 123 4567")
    make_staff(school, username="teacher.one")
    body = console.get("/api/platform/schools/adsmart").json()
    assert set(body) == DETAIL_KEYS  # counts, never records (amendment §4)
    assert body["counts"] == {"pupils": 1, "staff": 2, "parents": 0, "enquiries": 0}
    assert "The site has not been marked live" in body["blockers"]
    [admin] = body["administrators"]
    assert admin["username"] == "k.mensah" and admin["phone"] == "+233241234567"
    assert admin["has_authenticator"] is False and admin["last_sign_in"] is None


def test_an_unknown_school_is_not_found(console):
    assert console.get("/api/platform/schools/nowhere").status_code == 404
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/platform_admin -q`
Expected: FAIL. `test_signed_out_visitors_are_refused_everywhere` fails on `assert paths` (no routes yet), and the others get 404s.

- [ ] **Step 3: Write the app**

`backend/apps/platform_admin/__init__.py`:
```python

```

`backend/apps/platform_admin/apps.py`:
```python
from django.apps import AppConfig


class PlatformAdminConfig(AppConfig):
    name = "apps.platform_admin"
    label = "platform_admin"
    default_auto_field = "django.db.models.BigAutoField"
```

`backend/apps/platform_admin/permissions.py`:
```python
"""The platform team only (amendment §4). Plan 3's session binding keeps their sessions to
the admin address, so a school's own users are never signed in there."""

from rest_framework.permissions import BasePermission

from apps.accounts.models import User


class IsPlatformStaff(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.kind == User.Kind.PLATFORM)
```

`backend/apps/platform_admin/views.py`:
```python
"""The platform admin API (amendment §5): schools, their Administrators, leads and the audit
log. Platform staff see counts and setup details, never pupils', parents' or staff records."""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import roles
from apps.accounts.models import User
from apps.accounts.signin import has_authenticator
from apps.people.models import Parent, Staff, Student
from apps.platform_admin.permissions import IsPlatformStaff
from apps.school.models import School
from apps.website.models import Enquiry
from apps.website.services import publication_blockers


class PlatformStaffView(APIView):
    permission_classes = [IsPlatformStaff]


def school_row(school: School, blockers: list[str] | None = None) -> dict:
    blockers = publication_blockers(school) if blockers is None else blockers
    return {
        "slug": school.slug,
        "name": school.name,
        "town": school.town,
        "region": school.region,
        "status": school.status,
        "is_public": not blockers,
        "to_do": len(blockers),
        "created_at": school.created_at,
        "url": school.base_url(),
    }


def administrators(school: School) -> list[dict]:
    users = User.objects.filter(
        school=school, kind=User.Kind.STAFF, groups__name=roles.ADMINISTRATOR
    ).order_by("display_name", "login")
    return [
        {
            "id": user.pk,
            "name": str(user),
            "username": user.login,
            "phone": user.phone,
            "has_authenticator": has_authenticator(user),
            "must_change_password": user.must_change_password,
            "last_sign_in": user.last_login,
            "is_active": user.is_active,
        }
        for user in users
    ]


def school_detail(school: School) -> dict:
    blockers = publication_blockers(school)
    return {
        **school_row(school, blockers),
        "phone": school.phone,
        "email": school.email,
        "levels_offered": school.levels_offered,
        "blockers": blockers,
        "counts": {
            "pupils": Student.objects.for_school(school).count(),
            "staff": Staff.objects.for_school(school).count(),
            "parents": Parent.objects.for_school(school).count(),
            "enquiries": Enquiry.objects.for_school(school).count(),
        },
        "administrators": administrators(school),
    }


class SchoolsView(PlatformStaffView):
    def get(self, request):
        schools = School.objects.all()
        query = request.query_params.get("q", "").strip()
        if query:
            schools = schools.filter(
                Q(name__icontains=query) | Q(slug__icontains=query) | Q(town__icontains=query)
            )
        status = request.query_params.get("status", "")
        if status:
            schools = schools.filter(status=status)
        return Response([school_row(school) for school in schools])


class SchoolDetailView(PlatformStaffView):
    def get(self, request, slug):
        return Response(school_detail(get_object_or_404(School, slug=slug)))
```

`backend/apps/platform_admin/urls.py`:
```python
from django.urls import path

from apps.platform_admin import views

urlpatterns = [
    path("schools", views.SchoolsView.as_view()),
    path("schools/<slug:slug>", views.SchoolDetailView.as_view()),
]
```

Then:
- In `backend/config/settings.py`, add `"apps.platform_admin",` to INSTALLED_APPS after `"apps.people",`.
- In `backend/config/urls.py`, add `path("api/platform/", include("apps.platform_admin.urls")),` after the `api/auth/` line.
- In `backend/tests/test_tenancy_matrix.py`, add after `PENDING_USER = …`:
```python
PLATFORM_STAFF = "platform staff at the admin address only (tests/platform_admin/test_access.py)"
```
- Add to `CLASSIFIED`:
```python
    "api/platform/schools": PLATFORM_STAFF,
    "api/platform/schools/<slug:slug>": PLATFORM_STAFF,
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/platform_admin tests/test_tenancy_matrix.py -q`
Expected: all pass.

- [ ] **Step 5: Check and commit**

Run: `.venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff format . && .venv/Scripts/python -m ruff check .`

```bash
git add backend/apps/platform_admin backend/config backend/tests/platform_admin backend/tests/test_tenancy_matrix.py
git commit -m "Add the platform admin API: platform staff only, the schools list and a school's page"
```

---

### Task 2: Add a school with its first Administrator, and add more Administrators

**Files:**
- Create: `backend/apps/platform_admin/services.py`
- Rewrite: `backend/apps/platform_admin/views.py`
- Modify: `backend/apps/platform_admin/urls.py`, `backend/tests/test_tenancy_matrix.py`
- Test: `backend/tests/platform_admin/test_new_schools.py`

**Interfaces:**
- Consumes: `create_school` (Plan 2), `create_staff` (Plan 4), `normalise_identifier`, `normalise_gh_phone`, `record`.
- Produces:
  - **`services`:**
    - `one_time_password() -> str`.
    - `_issue_password(user) -> str`. It sets the password and `must_change_password`.
    - `add_administrator(school, *, first_name, surname, username, phone, by) -> (User, password)`.
    - `open_school(*, administrator: dict, by, request=None, **school_fields) -> (School, User, password)`.
  - **`POST /api/platform/schools`:**
    - Body: `{name, slug, town, region, phone, email, levels_offered[], administrator{first_name, surname, username, phone}}`.
    - Returns 201 with `{school: SchoolDetail, administrator: {username, one_time_password}}`.
  - **`POST /api/platform/schools/<slug>/administrators`:**
    - Body: `{first_name, surname, username, phone}`.
    - Returns 201 with `{username, one_time_password}`.
  - **`views.AdministratorSerializer`** and **`views._one_time(user, password)`**.

- [ ] **Step 1: Write the failing tests**

`backend/tests/platform_admin/test_new_schools.py`:
```python
import pytest

from apps.accounts import roles
from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.school.models import School
from apps.website.models import ContentBlock
from tests.helpers import sign_in
from tests.records import make_staff

pytestmark = pytest.mark.django_db
NEW = {
    "name": "Bright Future Academy",
    "slug": "brightfuture",
    "town": "Ejisu",
    "region": "Ashanti Region",
    "phone": "020 123 4567",
    "email": "office@brightfuture.example",
    "levels_offered": ["kg", "lower_primary"],
    "administrator": {
        "first_name": "Esi",
        "surname": "Owusu",
        "username": "Esi.Owusu",
        "phone": "024 765 4321",
    },
}


def open_school(console, **changes):
    return console.post("/api/platform/schools", {**NEW, **changes}, format="json")


def test_opening_a_school_builds_its_site_and_first_administrator(api, console, ops):
    response = open_school(console)
    assert response.status_code == 201
    body = response.json()
    school = School.objects.get(slug="brightfuture")
    assert school.status == "trial" and school.levels_offered == ["kg", "lower_primary"]
    assert ContentBlock.objects.for_school(school).exists()  # its placeholder website
    assert body["school"]["slug"] == "brightfuture"
    password = body["administrator"]["one_time_password"]
    assert body["administrator"]["username"] == "esi.owusu" and len(password) == 14
    admin = User.objects.get(school=school, login="esi.owusu")
    assert admin.must_change_password and admin.check_password(password)
    assert admin.phone == "+233247654321" and roles.roles_of(admin) == ["Administrator"]
    by_ops = set(AuditLog.objects.filter(actor=ops).values_list("action", "school_id"))
    assert by_ops == {("CREATED", school.pk), ("USER_CREATED", school.pk)}
    signed_in = sign_in(api, "esi.owusu", password, HTTP_HOST="brightfuture.localhost")
    assert signed_in.json()["status"] == "second_factor"  # Administrators set up the app first


def test_the_web_address_must_be_free_and_allowed(console, school):
    assert "slug" in open_school(console, slug="admin").json()["fields"]
    assert "slug" in open_school(console, slug="adsmart").json()["fields"]
    assert not School.objects.filter(slug="admin").exists()


def test_administrator_details_are_checked_before_anything_is_made(console):
    wrong = {**NEW["administrator"], "username": "1bad", "phone": "12345"}
    fields = open_school(console, administrator=wrong).json()["fields"]
    assert set(fields) == {"administrator.username", "administrator.phone"}
    assert not School.objects.filter(slug="brightfuture").exists()


def test_adding_another_administrator(console, school):
    make_staff(school, roles_held=["Administrator"])
    url = "/api/platform/schools/adsmart/administrators"
    taken = {"first_name": "Kofi", "surname": "Mensah", "username": "K.Mensah", "phone": "024 111 2222"}
    refused = console.post(url, taken, format="json").json()
    assert refused["fields"] == {"username": ["That username is already used at this school."]}
    added = console.post(url, {**taken, "username": "ama.owusu"}, format="json")
    assert added.status_code == 201 and added.json()["username"] == "ama.owusu"
    assert len(console.get("/api/platform/schools/adsmart").json()["administrators"]) == 2
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/platform_admin/test_new_schools.py -q`
Expected: FAIL. The POSTs answer 405, and the administrators route 404.

- [ ] **Step 3: Write the services and views**

`backend/apps/platform_admin/services.py`:
```python
"""What the platform team does to schools (amendment §5). Every change is audited."""

import secrets

from django.db import transaction

from apps.accounts import roles
from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.people.services import create_staff
from apps.school.models import School
from apps.website.provisioning import create_school

PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no 0/o or 1/i/l to misread


def one_time_password() -> str:
    """Handed over once by the platform team; it must be changed at the first sign-in."""
    raw = "".join(secrets.choice(PASSWORD_ALPHABET) for _ in range(12))
    return f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"


def _issue_password(user: User) -> str:
    password = one_time_password()
    user.set_password(password)
    user.must_change_password = True
    user.save(update_fields=["password", "must_change_password"])
    return password


@transaction.atomic
def add_administrator(
    school: School, *, first_name, surname, username, phone, by
) -> tuple[User, str]:
    staff = create_staff(
        school,
        username=username,
        first_name=first_name,
        surname=surname,
        roles_held=[roles.ADMINISTRATOR],
        phone=phone,
        by=by,
    )
    return staff.user, _issue_password(staff.user)


@transaction.atomic
def open_school(*, administrator: dict, by, request=None, **fields) -> tuple[School, User, str]:
    """A new school on trial, with its placeholder site and first Administrator (amendment §5)."""
    school = create_school(**fields)
    record(
        AuditLog.Action.CREATED,
        actor=by,
        entity=school,
        new={"slug": school.slug, "name": school.name},
        request=request,
    )
    user, password = add_administrator(school, **administrator, by=by)
    return school, user, password
```

`backend/apps/platform_admin/views.py`:
```python
"""The platform admin API (amendment §5): schools, their Administrators, leads and the audit
log. Platform staff see counts and setup details, never pupils', parents' or staff records."""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import roles
from apps.accounts.identifiers import normalise_identifier
from apps.accounts.models import User
from apps.accounts.signin import has_authenticator
from apps.accounts.views import validated
from apps.core.phones import normalise_gh_phone
from apps.people.models import Parent, Staff, Student
from apps.platform_admin import services
from apps.platform_admin.permissions import IsPlatformStaff
from apps.school.models import LEVEL_CODES, School
from apps.website.models import Enquiry
from apps.website.services import publication_blockers


class PlatformStaffView(APIView):
    permission_classes = [IsPlatformStaff]


def school_row(school: School, blockers: list[str] | None = None) -> dict:
    blockers = publication_blockers(school) if blockers is None else blockers
    return {
        "slug": school.slug,
        "name": school.name,
        "town": school.town,
        "region": school.region,
        "status": school.status,
        "is_public": not blockers,
        "to_do": len(blockers),
        "created_at": school.created_at,
        "url": school.base_url(),
    }


def administrators(school: School) -> list[dict]:
    users = User.objects.filter(
        school=school, kind=User.Kind.STAFF, groups__name=roles.ADMINISTRATOR
    ).order_by("display_name", "login")
    return [
        {
            "id": user.pk,
            "name": str(user),
            "username": user.login,
            "phone": user.phone,
            "has_authenticator": has_authenticator(user),
            "must_change_password": user.must_change_password,
            "last_sign_in": user.last_login,
            "is_active": user.is_active,
        }
        for user in users
    ]


def school_detail(school: School) -> dict:
    blockers = publication_blockers(school)
    return {
        **school_row(school, blockers),
        "phone": school.phone,
        "email": school.email,
        "levels_offered": school.levels_offered,
        "blockers": blockers,
        "counts": {
            "pupils": Student.objects.for_school(school).count(),
            "staff": Staff.objects.for_school(school).count(),
            "parents": Parent.objects.for_school(school).count(),
            "enquiries": Enquiry.objects.for_school(school).count(),
        },
        "administrators": administrators(school),
    }


def _one_time(user: User, password: str) -> dict:
    return {"username": user.login, "one_time_password": password}


class AdministratorSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=60)
    surname = serializers.CharField(max_length=60)
    username = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=20)

    def validate_username(self, value):
        try:
            return normalise_identifier(User.Kind.STAFF, value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate_phone(self, value):
        try:
            return normalise_gh_phone(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc


class NewSchoolSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    slug = serializers.CharField(max_length=30)
    town = serializers.CharField(max_length=80)
    region = serializers.CharField(max_length=80)
    phone = serializers.CharField(max_length=20)
    email = serializers.EmailField()
    levels_offered = serializers.ListField(
        child=serializers.ChoiceField(choices=LEVEL_CODES), allow_empty=False
    )
    administrator = AdministratorSerializer()


class SchoolsView(PlatformStaffView):
    def get(self, request):
        schools = School.objects.all()
        query = request.query_params.get("q", "").strip()
        if query:
            schools = schools.filter(
                Q(name__icontains=query) | Q(slug__icontains=query) | Q(town__icontains=query)
            )
        status = request.query_params.get("status", "")
        if status:
            schools = schools.filter(status=status)
        return Response([school_row(school) for school in schools])

    def post(self, request):
        data = validated(NewSchoolSerializer, request)
        try:
            school, user, password = services.open_school(**data, by=request.user, request=request)
        except DjangoValidationError as exc:  # the School model's own checks (slug, phone, …)
            raise serializers.ValidationError(exc.message_dict) from exc
        body = {"school": school_detail(school), "administrator": _one_time(user, password)}
        return Response(body, status=201)


class SchoolDetailView(PlatformStaffView):
    def get(self, request, slug):
        return Response(school_detail(get_object_or_404(School, slug=slug)))


class AdministratorsView(PlatformStaffView):
    def post(self, request, slug):
        school = get_object_or_404(School, slug=slug)
        data = validated(AdministratorSerializer, request)
        if User.objects.filter(school=school, login=data["username"]).exists():
            raise serializers.ValidationError(
                {"username": ["That username is already used at this school."]}
            )
        user, password = services.add_administrator(school, **data, by=request.user)
        return Response(_one_time(user, password), status=201)
```

In `backend/apps/platform_admin/urls.py`, add `path("schools/<slug:slug>/administrators", views.AdministratorsView.as_view()),`.

In `backend/tests/test_tenancy_matrix.py`, add `"api/platform/schools/<slug:slug>/administrators": PLATFORM_STAFF,` to `CLASSIFIED`.

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/platform_admin tests/test_tenancy_matrix.py -q`
Expected: all pass.

- [ ] **Step 5: Check and commit**

Run: `.venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff format . && .venv/Scripts/python -m ruff check .`

```bash
git add backend/apps/platform_admin backend/tests/platform_admin backend/tests/test_tenancy_matrix.py
git commit -m "Let the platform team add a school with its first Administrator and a one-time password"
```

---

### Task 3: Suspend or reactivate a school; reset an Administrator's password or authenticator

**Files:**
- Rewrite: `backend/apps/platform_admin/services.py`
- Modify: `backend/apps/platform_admin/views.py` (append), `backend/apps/platform_admin/urls.py`, `backend/apps/notifications/sms.py`, `backend/tests/test_tenancy_matrix.py`
- Test: `backend/tests/platform_admin/test_school_actions.py`

**Interfaces:**
- Consumes:
  - From Plan 3: `end_other_sessions`, `reset_second_factor`, `send_sms`.
  - From Task 2: `_issue_password`, `_one_time`.
- Produces:
  - **`services`:** `set_status(school, status, *, reason, by, request=None)`, `reset_administrator_password(user, *, by, request=None) -> str`, `reset_administrator_second_factor(user, *, by, request=None)`.
  - **`sms.Purpose.ACCOUNT_NOTICE`**.
  - **Endpoints:**
    - `POST /api/platform/schools/<slug>/status` takes `{status, reason}` and returns `SchoolDetail`.
    - `POST …/administrators/<id>/reset-password` returns `{username, one_time_password}`.
    - `POST …/administrators/<id>/reset-second-factor` returns 204.

- [ ] **Step 1: Write the failing tests**

`backend/tests/platform_admin/test_school_actions.py`:
```python
import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import TotpDevice
from apps.audit.models import AuditLog
from apps.notifications.backends import MemoryBackend
from tests.helpers import PASSWORD
from tests.records import make_staff

pytestmark = pytest.mark.django_db
STATUS = "/api/platform/schools/adsmart/status"


def administrator_of(school, phone="024 123 4567"):
    user = make_staff(school, roles_held=["Administrator"], phone=phone).user
    user.set_password(PASSWORD)
    user.save()
    return user


def test_suspending_needs_a_reason_and_takes_the_school_offline(api, console, school, ops):
    blank = console.post(STATUS, {"status": "suspended", "reason": ""}, format="json").json()
    assert blank["fields"] == {"reason": ["This field may not be blank."]}
    teacher = APIClient(HTTP_HOST="adsmart.localhost")
    teacher.force_login(make_staff(school).user)
    assert teacher.get("/api/auth/me").status_code == 200

    body = console.post(STATUS, {"status": "suspended", "reason": "Asked to pause"}, format="json")
    assert body.json()["status"] == "suspended"
    assert teacher.get("/api/auth/me").json()["code"] == "not_authenticated"
    assert api.get("/api/public/sites/adsmart.localhost/site").status_code == 503
    entry = AuditLog.objects.get(action="STATUS_CHANGED")
    assert entry.school == school and entry.actor == ops and entry.reason == "Asked to pause"
    assert entry.old_value == {"status": "trial"} and entry.new_value == {"status": "suspended"}

    console.post(STATUS, {"status": "active", "reason": "Back on"}, format="json")
    school.refresh_from_db()
    assert school.status == "active"


def test_resetting_an_administrators_password(console, school, ops):
    admin = administrator_of(school)
    url = f"/api/platform/schools/adsmart/administrators/{admin.pk}/reset-password"
    password = console.post(url).json()["one_time_password"]
    admin.refresh_from_db()
    assert admin.check_password(password) and not admin.check_password(PASSWORD)
    assert admin.must_change_password
    [message] = MemoryBackend.outbox
    assert message["to"] == "+233241234567"
    assert message["body"].startswith(
        "AD Smart School: SchoolSite support has reset your sign-in password."
    )
    entry = AuditLog.objects.get(action="PASSWORD_RESET")
    assert entry.school == school and entry.actor == ops


def test_resetting_an_administrators_authenticator(console, school):
    admin = administrator_of(school)
    TotpDevice.objects.create(user=admin, secret="JBSWY3DPEHPK3PXP", confirmed_at=timezone.now())
    url = f"/api/platform/schools/adsmart/administrators/{admin.pk}/reset-second-factor"
    assert console.post(url).status_code == 204
    assert not TotpDevice.objects.filter(user=admin).exists()
    assert "authenticator app" in MemoryBackend.outbox[-1]["body"]
    assert AuditLog.objects.get(action="SECOND_FACTOR_RESET").school == school


def test_only_a_schools_own_administrators_can_be_reset(console, school, other_school):
    teacher = make_staff(school, username="teacher.one").user
    someone_elses = administrator_of(other_school)
    for user in (teacher, someone_elses):
        url = f"/api/platform/schools/adsmart/administrators/{user.pk}/reset-password"
        assert console.post(url).status_code == 404
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/platform_admin/test_school_actions.py -q`
Expected: FAIL, with 404s on the new routes.

- [ ] **Step 3: Write the services and views**

In `backend/apps/notifications/sms.py`, add to `Purpose`:
```python
    ACCOUNT_NOTICE = "account_notice"  # telling someone their account was changed for them
```

`backend/apps/platform_admin/services.py`:
```python
"""What the platform team does to schools (amendment §5). Every change is audited."""

import secrets

from django.conf import settings
from django.db import transaction

from apps.accounts import roles
from apps.accounts.models import User
from apps.accounts.second_factor import reset_second_factor
from apps.accounts.sessions import end_other_sessions
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.notifications.sms import Purpose, send_sms
from apps.people.services import create_staff
from apps.school.models import School
from apps.website.provisioning import create_school

PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no 0/o or 1/i/l to misread


def one_time_password() -> str:
    """Handed over once by the platform team; it must be changed at the first sign-in."""
    raw = "".join(secrets.choice(PASSWORD_ALPHABET) for _ in range(12))
    return f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"


def _issue_password(user: User) -> str:
    password = one_time_password()
    user.set_password(password)
    user.must_change_password = True
    user.save(update_fields=["password", "must_change_password"])
    return password


@transaction.atomic
def add_administrator(
    school: School, *, first_name, surname, username, phone, by
) -> tuple[User, str]:
    staff = create_staff(
        school,
        username=username,
        first_name=first_name,
        surname=surname,
        roles_held=[roles.ADMINISTRATOR],
        phone=phone,
        by=by,
    )
    return staff.user, _issue_password(staff.user)


@transaction.atomic
def open_school(*, administrator: dict, by, request=None, **fields) -> tuple[School, User, str]:
    """A new school on trial, with its placeholder site and first Administrator (amendment §5)."""
    school = create_school(**fields)
    record(
        AuditLog.Action.CREATED,
        actor=by,
        entity=school,
        new={"slug": school.slug, "name": school.name},
        request=request,
    )
    user, password = add_administrator(school, **administrator, by=by)
    return school, user, password


def set_status(school: School, status: str, *, reason: str, by, request=None) -> School:
    """Suspending signs the school's users out at their next request and takes its website
    offline (amendment §2, §3.3)."""
    if not reason.strip():
        raise ValueError("Give a reason.")
    old = school.status
    school.status = status
    school.save(update_fields=["status"])
    record(
        AuditLog.Action.STATUS_CHANGED,
        actor=by,
        entity=school,
        old={"status": old},
        new={"status": status},
        reason=reason,
        request=request,
    )
    return school


def _tell(user: User, text: str) -> None:
    """Administrators hear about every reset platform support makes (amendment §4)."""
    if user.phone:
        send_sms(
            user.phone,
            f"{user.school.name}: {text}",
            purpose=Purpose.ACCOUNT_NOTICE,
            school=user.school,
        )


def reset_administrator_password(user: User, *, by, request=None) -> str:
    password = _issue_password(user)
    end_other_sessions(user, keep_key=None)
    record(
        AuditLog.Action.PASSWORD_RESET,
        actor=by,
        entity=user,
        reason="Reset by platform support",
        request=request,
    )
    _tell(
        user,
        f"{settings.PLATFORM_NAME} support has reset your sign-in password. "
        "If you did not ask for this, contact them at once.",
    )
    return password


def reset_administrator_second_factor(user: User, *, by, request=None) -> None:
    reset_second_factor(user, by=by, request=request, reason="Reset by platform support")
    _tell(
        user,
        f"{settings.PLATFORM_NAME} support has reset your authenticator app. "
        "You will set up a new one at your next sign-in.",
    )
```

Append to `backend/apps/platform_admin/views.py`:
```python


class StatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=School.Status.choices)
    reason = serializers.CharField(max_length=500)


class SchoolStatusView(PlatformStaffView):
    def post(self, request, slug):
        school = get_object_or_404(School, slug=slug)
        data = validated(StatusSerializer, request)
        services.set_status(
            school, data["status"], reason=data["reason"], by=request.user, request=request
        )
        return Response(school_detail(school))


def _administrator(slug: str, pk: int) -> User:
    """Only a school's own Administrators can be reset by the platform team (amendment §4)."""
    return get_object_or_404(
        User,
        pk=pk,
        school__slug=slug,
        kind=User.Kind.STAFF,
        groups__name=roles.ADMINISTRATOR,
    )


class ResetPasswordView(PlatformStaffView):
    def post(self, request, slug, pk):
        user = _administrator(slug, pk)
        password = services.reset_administrator_password(user, by=request.user, request=request)
        return Response(_one_time(user, password))


class ResetSecondFactorView(PlatformStaffView):
    def post(self, request, slug, pk):
        user = _administrator(slug, pk)
        services.reset_administrator_second_factor(user, by=request.user, request=request)
        return Response(status=204)
```

In `backend/apps/platform_admin/urls.py`, add:
```python
    path("schools/<slug:slug>/status", views.SchoolStatusView.as_view()),
    path(
        "schools/<slug:slug>/administrators/<int:pk>/reset-password",
        views.ResetPasswordView.as_view(),
    ),
    path(
        "schools/<slug:slug>/administrators/<int:pk>/reset-second-factor",
        views.ResetSecondFactorView.as_view(),
    ),
```

In `backend/tests/test_tenancy_matrix.py`, add to `CLASSIFIED`:
```python
    "api/platform/schools/<slug:slug>/status": PLATFORM_STAFF,
    "api/platform/schools/<slug:slug>/administrators/<int:pk>/reset-password": PLATFORM_STAFF,
    "api/platform/schools/<slug:slug>/administrators/<int:pk>/reset-second-factor": (
        PLATFORM_STAFF
    ),
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/platform_admin tests/notifications tests/test_tenancy_matrix.py -q`
Expected: all pass.

- [ ] **Step 5: Check and commit**

Run: `.venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff format . && .venv/Scripts/python -m ruff check .`

```bash
git add backend/apps/platform_admin backend/apps/notifications/sms.py backend/tests/platform_admin backend/tests/test_tenancy_matrix.py
git commit -m "Let the platform team suspend or reactivate a school and reset its Administrators"
```

---

### Task 4: The leads inbox and the platform audit log

**Files:**
- Modify: `backend/apps/platform_admin/views.py` (imports and append), `backend/apps/platform_admin/urls.py`, `backend/tests/test_tenancy_matrix.py`
- Test: `backend/tests/platform_admin/test_leads_and_audit.py`

**Interfaces:**
- Consumes: `Lead` (Plan 2), `AuditLog`, `record`.
- Produces:
  - **`GET /api/platform/leads`** returns `[{id, school_name, contact_name, phone, email, town, message, status, staff_notes, created_at}]`, newest first.
  - **`PATCH /api/platform/leads/<id>`** takes `{status, staff_notes}` and returns the lead. It is audited `UPDATED`.
  - **`GET /api/platform/audit`** returns `[{id, created_at, actor_name, action, entity_type, entity_id, school, reason}]`, the latest 200. It covers platform events plus every action by platform staff.

- [ ] **Step 1: Write the failing tests**

`backend/tests/platform_admin/test_leads_and_audit.py`:
```python
import pytest

from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.platform_admin import services
from apps.website.models import Lead
from tests.records import make_staff

pytestmark = pytest.mark.django_db


def make_lead(**fields):
    return Lead.objects.create(
        **{
            "school_name": "Hope Academy",
            "contact_name": "Yaw Asante",
            "phone": "+233241234567",
            "town": "Tema",
            "data_consent": True,
            **fields,
        }
    )


def test_the_leads_inbox_shows_the_newest_first(console):
    make_lead(school_name="First")
    make_lead(school_name="Second")
    names = [lead["school_name"] for lead in console.get("/api/platform/leads").json()]
    assert names == ["Second", "First"]


def test_updating_a_lead_is_audited(console, ops):
    url = f"/api/platform/leads/{make_lead().pk}"
    refused = console.patch(url, {"status": "lost", "staff_notes": ""}, format="json").json()
    assert "status" in refused["fields"]
    changes = {"status": "contacted", "staff_notes": "Visiting on Monday"}
    body = console.patch(url, changes, format="json").json()
    assert body["status"] == "contacted" and body["staff_notes"] == "Visiting on Monday"
    entry = AuditLog.objects.get(action="UPDATED")
    assert entry.actor == ops and entry.school is None
    assert entry.new_value == {"status": "contacted"}


def test_the_platform_audit_log_shows_platform_events_and_platform_staff_actions(
    console, ops, school
):
    record(AuditLog.Action.SIGN_IN, actor=ops)  # a platform event
    teacher = make_staff(school)  # the school's own entry
    record(AuditLog.Action.SIGN_IN, actor=teacher.user)  # also the school's own
    services.set_status(school, "active", reason="Signed up", by=ops)  # platform staff, in a school
    rows = console.get("/api/platform/audit").json()
    assert [(row["action"], row["school"]) for row in rows] == [
        ("STATUS_CHANGED", "AD Smart School"),
        ("SIGN_IN", None),
    ]
    assert rows[0]["actor_name"] == "Kojo Ops" and rows[0]["reason"] == "Signed up"
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/platform_admin/test_leads_and_audit.py -q`
Expected: FAIL, with 404s on the new routes.

- [ ] **Step 3: Write the views**

In `backend/apps/platform_admin/views.py`:
- Change `from apps.website.models import Enquiry` to `from apps.website.models import Enquiry, Lead`.
- Add `from apps.audit.models import AuditLog` and `from apps.audit.services import record` after the `apps.accounts.views` import.
- Append:
```python


def lead_row(lead: Lead) -> dict:
    return {
        "id": lead.pk,
        "school_name": lead.school_name,
        "contact_name": lead.contact_name,
        "phone": lead.phone,
        "email": lead.email,
        "town": lead.town,
        "message": lead.message,
        "status": lead.status,
        "staff_notes": lead.staff_notes,
        "created_at": lead.created_at,
    }


class LeadUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Lead.Status.choices)
    staff_notes = serializers.CharField(max_length=2000, allow_blank=True, default="")


class LeadsView(PlatformStaffView):
    def get(self, request):
        leads = Lead.objects.order_by("-created_at", "-id")
        return Response([lead_row(lead) for lead in leads])


class LeadDetailView(PlatformStaffView):
    def patch(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        data = validated(LeadUpdateSerializer, request)
        old = {"status": lead.status}
        lead.status, lead.staff_notes = data["status"], data["staff_notes"]
        lead.save(update_fields=["status", "staff_notes"])
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=lead,
            old=old,
            new={"status": lead.status},
            request=request,
        )
        return Response(lead_row(lead))


AUDIT_LIMIT = 200  # shortcut: the latest entries only; add paging once the log grows


class AuditView(PlatformStaffView):
    """Platform events, plus everything platform staff did in any school (amendment §4)."""

    def get(self, request):
        entries = AuditLog.objects.filter(
            Q(school__isnull=True) | Q(actor__kind=User.Kind.PLATFORM)
        ).select_related("school")[:AUDIT_LIMIT]
        return Response(
            [
                {
                    "id": entry.pk,
                    "created_at": entry.created_at,
                    "actor_name": entry.actor_name,
                    "action": entry.action,
                    "entity_type": entry.entity_type,
                    "entity_id": entry.entity_id,
                    "school": entry.school.name if entry.school_id else None,
                    "reason": entry.reason,
                }
                for entry in entries
            ]
        )
```

In `backend/apps/platform_admin/urls.py`, add:
```python
    path("leads", views.LeadsView.as_view()),
    path("leads/<int:pk>", views.LeadDetailView.as_view()),
    path("audit", views.AuditView.as_view()),
```

In `backend/tests/test_tenancy_matrix.py`, add to `CLASSIFIED`:
```python
    "api/platform/leads": PLATFORM_STAFF,
    "api/platform/leads/<int:pk>": PLATFORM_STAFF,
    "api/platform/audit": PLATFORM_STAFF,
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/platform_admin tests/test_tenancy_matrix.py -q`
Expected: all pass.

- [ ] **Step 5: Check and commit**

Run: `.venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff format . && .venv/Scripts/python -m ruff check .`

```bash
git add backend/apps/platform_admin backend/tests/platform_admin backend/tests/test_tenancy_matrix.py
git commit -m "Add the leads inbox and the platform audit log to the platform admin API"
```

---

### Task 5: Frontend: admin navigation, the slug suggestion and the schools list

**Files:**
- Modify: `frontend/src/lib/client-api.ts`, `frontend/src/lib/types.ts`, `frontend/src/app/platform-admin/page.tsx`
- Rewrite: `frontend/src/components/portal/portal-shell.tsx`, `frontend/src/app/platform-admin/(portal)/layout.tsx`
- Create: `frontend/src/lib/slug.ts`, `frontend/src/components/platform-admin/status-badge.tsx`, `frontend/src/components/platform-admin/schools-view.tsx`, `frontend/src/app/platform-admin/(portal)/schools/page.tsx`
- Test: `frontend/src/lib/slug.test.ts`, `frontend/src/components/portal/portal-shell.test.tsx`, `frontend/src/components/platform-admin/schools-view.test.tsx`

**Interfaces:**
- Consumes: the Task 1 endpoints, `AuthProvider` and `PortalShell` (Plan 3), and `mockApi` / `bodyOf`.
- Produces:
  - **API helpers:** `patchJson(path, data)`.
  - **Types:** `SchoolStatus`, `SchoolRow`, `Administrator`, `SchoolDetail`, `OneTimePassword`, `LeadStatus`, `Lead`, `AuditEntry`.
  - **`suggestSlug(name)`**.
  - **Components:**
    - `PortalShell` gains a `nav` prop of `[{href, label}]`. The current page is marked with `aria-current="page"`.
    - `<StatusBadge status />` and `STATUS_LABEL`.
    - `<SchoolsView />`.
  - **Routes:** the admin address opens on `/schools`, and `/` redirects there.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/slug.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { suggestSlug } from "./slug";

describe("suggestSlug", () => {
  it("turns a school's name into a web address", () => {
    expect(suggestSlug("St. Mary's Academy")).toBe("st-marys-academy");
    expect(suggestSlug("Crèche Étoile")).toBe("creche-etoile");
    expect(suggestSlug("123 Bright Future")).toBe("bright-future");
  });

  it("keeps to 30 characters without a trailing hyphen", () => {
    const slug = suggestSlug("The Very Long Name International School of Kumasi");
    expect(slug.length).toBeLessThanOrEqual(30);
    expect(slug.endsWith("-")).toBe(false);
  });
});
```

`frontend/src/components/portal/portal-shell.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { mockApi } from "@/test/http";
import { AuthProvider } from "./auth-provider";
import { PortalShell } from "./portal-shell";

const ME = {
  id: 1, kind: "platform", username: "ops", display_name: "Kojo Ops", roles: ["Platform Admin"],
  must_change_password: false, has_authenticator: true, school: null,
};
const NAV = [
  { href: "/schools", label: "Schools" },
  { href: "/leads", label: "Leads" },
];

describe("PortalShell", () => {
  it("marks the page you are on in the navigation", async () => {
    vi.mocked(usePathname).mockReturnValue("/platform-admin/schools/adsmart");
    mockApi([["GET", "/api/auth/me", 200, ME]]);
    render(
      <AuthProvider>
        <PortalShell name="SchoolSite admin" nav={NAV}>
          <p>page</p>
        </PortalShell>
      </AuthProvider>,
    );
    expect(await screen.findByRole("link", { name: "Schools" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Leads" })).not.toHaveAttribute("aria-current");
  });
});
```

`frontend/src/components/platform-admin/schools-view.test.tsx`:
```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi } from "@/test/http";
import { SchoolsView } from "./schools-view";

const ROWS = [
  {
    slug: "adsmart", name: "AD Smart School", town: "Kronom, Kumasi", region: "Ashanti Region", status: "trial",
    is_public: false, to_do: 3, created_at: "2026-10-09T23:34:00Z", url: "http://adsmart.localhost:3000",
  },
  {
    slug: "hope", name: "Hope Academy", town: "Tema", region: "Greater Accra Region", status: "active",
    is_public: true, to_do: 0, created_at: "2026-10-10T09:00:00Z", url: "http://hope.localhost:3000",
  },
];

describe("schools list", () => {
  it("lists schools with their status and go-live progress", async () => {
    mockApi([["GET", "/api/platform/schools", 200, ROWS]]);
    render(<SchoolsView />);
    const link = await screen.findByRole("link", { name: /AD Smart School/ });
    expect(link).toHaveAttribute("href", "/schools/adsmart");
    const list = screen.getByRole("list");
    expect(within(list).getByText("Preview · 3 to do")).toBeInTheDocument();
    expect(within(list).getByText("Website live")).toBeInTheDocument();
    expect(within(list).getByText("Active")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a school" })).toHaveAttribute("href", "/schools/new");
  });

  it("searches and filters on the server", async () => {
    const fetchMock = mockApi([
      ["GET", "/api/platform/schools", 200, ROWS],
      ["GET", "/api/platform/schools?q=hope", 200, [ROWS[1]]],
      ["GET", "/api/platform/schools?q=hope&status=active", 200, [ROWS[1]]],
    ]);
    const user = userEvent.setup();
    render(<SchoolsView />);
    await screen.findByText("AD Smart School");
    await user.type(screen.getByRole("searchbox"), "hope");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.queryByText("AD Smart School")).not.toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Status"), "active");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/platform/schools?q=hope&status=active", expect.anything()),
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend && npx vitest run src/lib/slug.test.ts src/components/portal src/components/platform-admin`
Expected: FAIL. `./slug` and `./schools-view` cannot be resolved, and the shell test finds no "Schools" link.

- [ ] **Step 3: Write the library code and the shell**

In `frontend/src/lib/client-api.ts`:
- Change `async function send<T>(method: "POST" | "DELETE", …` to `async function send<T>(method: "POST" | "PATCH" | "DELETE", …`.
- Append:
```ts

export function patchJson<T>(path: string, data: unknown): Promise<T> {
  return send<T>("PATCH", path, data);
}
```

In `frontend/src/lib/types.ts`, append:
```ts

export type SchoolStatus = "trial" | "active" | "suspended";

/** GET /api/platform/schools (amendment §5). */
export type SchoolRow = {
  slug: string;
  name: string;
  town: string;
  region: string;
  status: SchoolStatus;
  is_public: boolean;
  to_do: number;
  created_at: string;
  url: string;
};

export type Administrator = {
  id: number;
  name: string;
  username: string;
  phone: string;
  has_authenticator: boolean;
  must_change_password: boolean;
  last_sign_in: string | null;
  is_active: boolean;
};

export type SchoolDetail = SchoolRow & {
  phone: string;
  email: string;
  levels_offered: LevelCode[];
  blockers: string[];
  counts: { pupils: number; staff: number; parents: number; enquiries: number };
  administrators: Administrator[];
};

export type OneTimePassword = { username: string; one_time_password: string };

export type LeadStatus = "new" | "contacted" | "onboarded" | "closed";

export type Lead = {
  id: number;
  school_name: string;
  contact_name: string;
  phone: string;
  email: string;
  town: string;
  message: string;
  status: LeadStatus;
  staff_notes: string;
  created_at: string;
};

export type AuditEntry = {
  id: number;
  created_at: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  school: string | null;
  reason: string;
};
```

`frontend/src/lib/slug.ts`:
```ts
/** A web-address name suggested from a school's name (amendment §2.2): "St. Mary's Academy" → "st-marys-academy". */
export function suggestSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .slice(0, 30)
    .replace(/-+$/, "");
}
```

`frontend/src/components/portal/portal-shell.tsx`:
```tsx
"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BrandLink } from "@/components/brand/brand-link";
import { SkipLink } from "@/components/site/skip-link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { publicPath } from "@/lib/hosts";
import type { ImageData } from "@/lib/types";
import { useAuth } from "./auth-provider";

export type NavItem = { href: string; label: string };
type Props = { name: string; logo?: ImageData | null; nav?: NavItem[]; children: ReactNode };

/** The signed-in frame: brand, navigation, who is signed in and Sign out. */
export function PortalShell({ name, logo = null, nav, children }: Props) {
  const { me, signOut } = useAuth();
  const path = publicPath(usePathname());
  return (
    <>
      <SkipLink />
      <header className="glass-frosted sticky top-0 z-30 border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <BrandLink name={name} logo={logo} />
          <div className="flex items-center gap-3">
            <span className="hidden max-w-48 truncate text-sm font-medium md:inline">{me.display_name}</span>
            <Button variant="outline" onClick={signOut} className="px-3">
              <LogOut aria-hidden className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
        {nav && (
          <nav aria-label="Main" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
            {nav.map((item) => {
              const current = path === item.href || path.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center rounded-control px-3 text-sm font-semibold",
                    current ? "bg-ink/10 text-ink" : "text-ink-muted hover:bg-ink/5 hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 outline-none sm:px-6">
        {children}
      </main>
    </>
  );
}
```

- [ ] **Step 4: Write the schools list and its routes**

`frontend/src/components/platform-admin/status-badge.tsx`:
```tsx
import { cn } from "@/lib/cn";
import type { SchoolStatus } from "@/lib/types";

export const STATUS_LABEL: Record<SchoolStatus, string> = {
  trial: "Trial",
  active: "Active",
  suspended: "Suspended",
};

const STYLES: Record<SchoolStatus, string> = {
  trial: "bg-amber/25",
  active: "bg-success/15",
  suspended: "bg-danger/15",
};

/** The word carries the meaning; the colour only helps (WCAG 1.4.1). */
export function StatusBadge({ status }: { status: SchoolStatus }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold text-ink", STYLES[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}
```

`frontend/src/components/platform-admin/schools-view.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { inputClasses } from "@/components/site/field";
import { Button, ButtonLink } from "@/components/ui/button";
import { errorMessage, getJson } from "@/lib/client-api";
import { formatDate } from "@/lib/dates";
import type { SchoolRow, SchoolStatus } from "@/lib/types";
import { STATUS_LABEL, StatusBadge } from "./status-badge";

/** Every school on the platform (amendment §5), with search and a status filter. */
export function SchoolsView() {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ q: "", status: "" });
  const [schools, setSchools] = useState<SchoolRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
    getJson<SchoolRow[]>(`/api/platform/schools${query ? `?${query}` : ""}`).then(
      (rows) => {
        if (cancelled) return;
        setSchools(rows);
        setError(null);
      },
      (caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [filters]);

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters((current) => ({ ...current, q: search.trim() }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Schools</h1>
        <ButtonLink href="/schools/new">Add a school</ButtonLink>
      </div>

      <form role="search" onSubmit={onSearch} className="flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1">
          <span className="block text-sm font-medium">Search by name, web address or town</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={`${inputClasses} mt-1`}
          />
        </label>
        <label>
          <span className="block text-sm font-medium">Status</span>
          <select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            className={`${inputClasses} mt-1`}
          >
            <option value="">All</option>
            {(Object.keys(STATUS_LABEL) as SchoolStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {schools === null && !error && <p className="text-ink-muted">Loading…</p>}
      {schools?.length === 0 && <p className="text-ink-muted">No schools match.</p>}
      {schools && schools.length > 0 && (
        <ul className="grid gap-3">
          {schools.map((school) => (
            <li key={school.slug}>
              <Link
                href={`/schools/${school.slug}`}
                className="surface flex flex-wrap items-center justify-between gap-3 rounded-card p-4 hover:shadow-elev-2"
              >
                <span>
                  <span className="block font-semibold">{school.name}</span>
                  <span className="block text-sm text-ink-muted">
                    {school.town}, {school.region} · added {formatDate(school.created_at)}
                  </span>
                </span>
                <span className="flex items-center gap-3 text-sm">
                  <span>{school.is_public ? "Website live" : `Preview · ${school.to_do} to do`}</span>
                  <StatusBadge status={school.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

`frontend/src/app/platform-admin/(portal)/schools/page.tsx`:
```tsx
import type { Metadata } from "next";
import { SchoolsView } from "@/components/platform-admin/schools-view";

export const metadata: Metadata = { title: "Schools" };

export default function SchoolsPage() {
  return <SchoolsView />;
}
```

`frontend/src/app/platform-admin/page.tsx`:
```tsx
import { redirect } from "next/navigation";

/** The admin address opens on the schools list. */
export default function PlatformAdminHome() {
  redirect("/schools");
}
```

`frontend/src/app/platform-admin/(portal)/layout.tsx`:
```tsx
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/portal/auth-provider";
import { PortalShell } from "@/components/portal/portal-shell";
import { getPlatform } from "@/lib/api";

const NAV = [
  { href: "/schools", label: "Schools" },
  { href: "/leads", label: "Leads" },
  { href: "/audit", label: "Audit log" },
  { href: "/account", label: "Account" },
];

export default async function PlatformPortalLayout({ children }: { children: ReactNode }) {
  const { name } = await getPlatform();
  return (
    <AuthProvider>
      <PortalShell name={`${name} admin`} nav={NAV}>
        {children}
      </PortalShell>
    </AuthProvider>
  );
}
```

- [ ] **Step 5: Run the tests and checks**

Run: `cd frontend && npm test && npm run lint && npm run typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "Add admin navigation and the schools list to the platform admin area"
```

---

### Task 6: Frontend: add a school, and a school's page

**Files:**
- Create: `frontend/src/components/platform-admin/new-school-form.tsx`, `frontend/src/components/platform-admin/school-detail.tsx`, `frontend/src/app/platform-admin/(portal)/schools/new/page.tsx`, `frontend/src/app/platform-admin/(portal)/schools/[slug]/page.tsx`
- Test: `frontend/src/components/platform-admin/new-school-form.test.tsx`, `frontend/src/components/platform-admin/school-detail.test.tsx`

**Interfaces:**
- Consumes:
  - The Task 2 and Task 3 endpoints, and Task 5's types, `StatusBadge` and `suggestSlug`.
  - `Field`, `FormAlert`, `postJson`, `formatPhoneLocal`, `formatDate`, `formatDateTime`, `LEVELS`.
- Produces:
  - `<NewSchoolForm />`, which shows the one-time password once, in `data-testid="one-time-password"`.
  - `<SchoolDetailView slug />`, with counts, the go-live list, Administrators (reset, add) and a status form.

- [ ] **Step 1: Write the failing tests**

`frontend/src/components/platform-admin/new-school-form.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { NewSchoolForm } from "./new-school-form";

const DETAIL = {
  slug: "hope-academy", name: "Hope Academy", town: "Tema", region: "Greater Accra Region", status: "trial",
  is_public: false, to_do: 4, created_at: "2026-10-10T09:00:00Z", url: "http://hope-academy.localhost:3000",
  phone: "+233201112233", email: "office@hope.example", levels_offered: ["kg"], blockers: [],
  counts: { pupils: 0, staff: 1, parents: 0, enquiries: 0 }, administrators: [],
};

async function fill(user: UserEvent) {
  await user.type(screen.getByLabelText(/^school name/i), "Hope Academy");
  await user.type(screen.getByLabelText(/^town/i), "Tema");
  await user.type(screen.getByLabelText(/^region/i), "Greater Accra Region");
  await user.type(screen.getByLabelText(/^school phone/i), "020 111 2233");
  await user.type(screen.getByLabelText(/^school email/i), "office@hope.example");
  await user.type(screen.getByLabelText(/^first name/i), "Esi");
  await user.type(screen.getByLabelText(/^surname/i), "Owusu");
  await user.type(screen.getByLabelText(/^username/i), "esi.owusu");
  await user.type(screen.getByLabelText(/^mobile number/i), "024 765 4321");
}

describe("add a school", () => {
  it("suggests the web address from the name until it is edited", async () => {
    mockApi([]);
    const user = userEvent.setup();
    render(<NewSchoolForm />);
    await user.type(screen.getByLabelText(/^school name/i), "St. Mary's Academy");
    const address = screen.getByLabelText(/^web address/i);
    expect(address).toHaveValue("st-marys-academy");
    await user.clear(address);
    await user.type(address, "stmarys");
    await user.type(screen.getByLabelText(/^school name/i), " Kumasi");
    expect(address).toHaveValue("stmarys");
  });

  it("asks for every field before sending anything", async () => {
    const fetchMock = mockApi([]);
    const user = userEvent.setup();
    render(<NewSchoolForm />);
    await user.click(screen.getByRole("button", { name: "Add the school" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please check the highlighted fields.");
    expect(screen.getAllByText("Fill this in.")).toHaveLength(10);
    expect(bodyOf(fetchMock, "POST", "/api/platform/schools")).toBeUndefined();
  });

  it("adds the school and shows the one-time password once", async () => {
    const fetchMock = mockApi([
      [
        "POST",
        "/api/platform/schools",
        201,
        { school: DETAIL, administrator: { username: "esi.owusu", one_time_password: "abcd-efgh-jkmn" } },
      ],
    ]);
    const user = userEvent.setup();
    render(<NewSchoolForm />);
    await fill(user);
    await user.click(screen.getByLabelText("Crèche"));
    await user.click(screen.getByRole("button", { name: "Add the school" }));

    const heading = await screen.findByRole("heading", { name: "Hope Academy is set up" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByTestId("one-time-password")).toHaveTextContent("abcd-efgh-jkmn");
    expect(bodyOf(fetchMock, "POST", "/api/platform/schools")).toEqual({
      name: "Hope Academy",
      slug: "hope-academy",
      town: "Tema",
      region: "Greater Accra Region",
      phone: "020 111 2233",
      email: "office@hope.example",
      levels_offered: ["nursery", "kg", "lower_primary", "upper_primary", "jhs"],
      administrator: { first_name: "Esi", surname: "Owusu", username: "esi.owusu", phone: "024 765 4321" },
    });
  });

  it("shows the server's field errors, the Administrator's included", async () => {
    mockApi([
      [
        "POST",
        "/api/platform/schools",
        400,
        {
          code: "validation_error",
          message: "Please check the highlighted fields.",
          fields: {
            slug: ["“hope-academy” is taken."],
            "administrator.username": ["Usernames start with a letter."],
          },
        },
      ],
    ]);
    const user = userEvent.setup();
    render(<NewSchoolForm />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Add the school" }));
    expect(await screen.findByText("“hope-academy” is taken.")).toBeInTheDocument();
    expect(screen.getByText("Usernames start with a letter.")).toBeInTheDocument();
  });
});
```

`frontend/src/components/platform-admin/school-detail.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { SchoolDetailView } from "./school-detail";

const DETAIL = {
  slug: "adsmart", name: "AD Smart School", town: "Kronom, Kumasi", region: "Ashanti Region", status: "trial",
  is_public: false, to_do: 1, created_at: "2026-10-09T23:34:00Z", url: "http://adsmart.localhost:3000",
  phone: "+233545875881", email: "school@example.com", levels_offered: ["kg"],
  blockers: ["The site has not been marked live"],
  counts: { pupils: 250, staff: 32, parents: 283, enquiries: 4 },
  administrators: [
    {
      id: 7, name: "Esi Owusu", username: "esi.owusu", phone: "+233247654321", has_authenticator: true,
      must_change_password: false, last_sign_in: "2026-10-09T14:05:00Z", is_active: true,
    },
  ],
};
const PAGE = "/api/platform/schools/adsmart";

describe("a school's page", () => {
  it("shows counts, the go-live list and the Administrators", async () => {
    mockApi([["GET", PAGE, 200, DETAIL]]);
    render(<SchoolDetailView slug="adsmart" />);
    expect(await screen.findByRole("heading", { name: "AD Smart School" })).toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.getByText("The site has not been marked live")).toBeInTheDocument();
    expect(screen.getByText("024 765 4321")).toBeInTheDocument();
  });

  it("resets a password and shows the new one-time password", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockApi([
      ["GET", PAGE, 200, DETAIL],
      ["POST", `${PAGE}/administrators/7/reset-password`, 200, { username: "esi.owusu", one_time_password: "pqrs-tuvw-xyz2" }],
      ["GET", PAGE, 200, DETAIL],
    ]);
    const user = userEvent.setup();
    render(<SchoolDetailView slug="adsmart" />);
    await user.click(await screen.findByRole("button", { name: "Reset password for Esi Owusu" }));
    expect(await screen.findByTestId("one-time-password")).toHaveTextContent("pqrs-tuvw-xyz2");
  });

  it("needs a reason to change the school's status", async () => {
    const fetchMock = mockApi([
      ["GET", PAGE, 200, DETAIL],
      ["POST", `${PAGE}/status`, 200, { ...DETAIL, status: "suspended" }],
    ]);
    const user = userEvent.setup();
    render(<SchoolDetailView slug="adsmart" />);
    await user.click(await screen.findByRole("button", { name: "Change status" }));
    expect(await screen.findByText("Give a reason. It goes in the audit log.")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^reason/i), "Asked to pause");
    await user.click(screen.getByRole("button", { name: "Change status" }));
    expect(await screen.findByText("AD Smart School is now suspended.")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", `${PAGE}/status`)).toEqual({ status: "suspended", reason: "Asked to pause" });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend && npx vitest run src/components/platform-admin`
Expected: FAIL. `./new-school-form` and `./school-detail` cannot be resolved.

- [ ] **Step 3: Write the form for adding a school**

`frontend/src/components/platform-admin/new-school-form.tsx`:
```tsx
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { errorMessage, fieldErrors, postJson } from "@/lib/client-api";
import { LEVELS, type LevelCode } from "@/lib/levels";
import { suggestSlug } from "@/lib/slug";
import type { OneTimePassword, SchoolDetail } from "@/lib/types";

type FieldName =
  | "name" | "slug" | "town" | "region" | "phone" | "email"
  | "first_name" | "surname" | "username" | "admin_phone";
type Values = Record<FieldName, string>;
type Result = { school: SchoolDetail; administrator: OneTimePassword };

const EMPTY: Values = {
  name: "", slug: "", town: "", region: "", phone: "", email: "",
  first_name: "", surname: "", username: "", admin_phone: "",
};
const CHECK_FORM = "Please check the highlighted fields.";
// The server names the Administrator's fields "administrator.<field>".
const SERVER_NAME: Partial<Record<FieldName, string>> = {
  first_name: "administrator.first_name",
  surname: "administrator.surname",
  username: "administrator.username",
  admin_phone: "administrator.phone",
};
const errorKey = (field: FieldName) => SERVER_NAME[field] ?? field;

type InputOptions = { hint?: string; type?: "text" | "tel" | "email" };

/** Add a school with its placeholder site and first Administrator (amendment §5). */
export function NewSchoolForm() {
  const [values, setValues] = useState<Values>(EMPTY);
  const [slugEdited, setSlugEdited] = useState(false);
  const [levels, setLevels] = useState<LevelCode[]>(LEVELS.map((level) => level.code));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Result | null>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  function change(field: FieldName, value: string) {
    if (field === "slug") setSlugEdited(true);
    setValues((current) => ({
      ...current,
      [field]: value,
      ...(field === "name" && !slugEdited ? { slug: suggestSlug(value) } : {}),
    }));
  }

  function toggleLevel(code: LevelCode, checked: boolean) {
    setLevels((current) =>
      LEVELS.map((level) => level.code).filter((item) => (item === code ? checked : current.includes(item))),
    );
  }

  function fail(message: string, fields: Record<string, string> = {}) {
    setError(message);
    setErrors(fields);
    setAttempt((count) => count + 1);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing: Record<string, string> = {};
    for (const field of Object.keys(values) as FieldName[]) {
      if (!values[field].trim()) missing[errorKey(field)] = "Fill this in.";
    }
    if (levels.length === 0) missing.levels_offered = "Choose at least one level.";
    if (Object.keys(missing).length > 0) return fail(CHECK_FORM, missing);
    setBusy(true);
    try {
      const { first_name, surname, username, admin_phone, ...school } = values;
      setDone(
        await postJson<Result>("/api/platform/schools", {
          ...school,
          levels_offered: levels,
          administrator: { first_name, surname, username, phone: admin_phone },
        }),
      );
    } catch (caught) {
      fail(errorMessage(caught), fieldErrors(caught));
    } finally {
      setBusy(false);
    }
  }

  function input(field: FieldName, label: string, options: InputOptions = {}) {
    return (
      <Field id={`new-${field}`} label={label} hint={options.hint} required error={errors[errorKey(field)]}>
        {(props) => (
          <input
            {...props}
            type={options.type ?? "text"}
            value={values[field]}
            onChange={(event) => change(field, event.target.value)}
            autoComplete="off"
            className={inputClasses}
          />
        )}
      </Field>
    );
  }

  if (done) {
    const { school, administrator } = done;
    return (
      <section aria-labelledby="school-ready" className="surface max-w-2xl space-y-4 rounded-card p-6">
        <h1 id="school-ready" ref={doneRef} tabIndex={-1} className="text-2xl font-semibold outline-none">
          {school.name} is set up
        </h1>
        <p>
          Its website is ready in preview at{" "}
          <a href={school.url} target="_blank" rel="noreferrer" className="link">
            {school.url}
          </a>
          .
        </p>
        <p>Give {values.first_name} this one-time password for their first sign-in. It is shown only once.</p>
        <p
          data-testid="one-time-password"
          className="rounded-control bg-ink/5 p-4 text-center font-mono text-2xl tracking-wider"
        >
          {administrator.one_time_password}
        </p>
        <p className="text-sm text-ink-muted">
          Their username is <strong className="text-ink">{administrator.username}</strong>. At their first sign-in
          they set up an authenticator app, then choose their own password.
        </p>
        <ButtonLink href={`/schools/${school.slug}`}>Open the school&apos;s page</ButtonLink>
      </section>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Add a school</h1>
        <p className="mt-1 text-ink-muted">It starts on trial, with a placeholder website in preview.</p>
      </div>
      <FormAlert message={error} focusKey={attempt} />

      <fieldset className="space-y-5">
        <legend className="text-xl font-semibold">The school</legend>
        {input("name", "School name")}
        {input("slug", "Web address", {
          hint: "Lowercase letters, numbers and hyphens. It cannot be changed later.",
        })}
        <div className="grid gap-5 sm:grid-cols-2">
          {input("town", "Town")}
          {input("region", "Region", { hint: "For example Ashanti Region" })}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {input("phone", "School phone", { type: "tel" })}
          {input("email", "School email", { type: "email" })}
        </div>
        <fieldset aria-describedby={errors.levels_offered ? "new-levels-error" : undefined}>
          <legend className="font-medium">Levels taught</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {LEVELS.map((level) => (
              <label key={level.code} className="flex min-h-11 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={levels.includes(level.code)}
                  onChange={(event) => toggleLevel(level.code, event.target.checked)}
                  className="size-5 accent-primary"
                />
                {level.name}
              </label>
            ))}
          </div>
          {errors.levels_offered && (
            <p id="new-levels-error" className="mt-2 text-sm font-medium text-danger">
              {errors.levels_offered}
            </p>
          )}
        </fieldset>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="text-xl font-semibold">Its first Administrator</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          {input("first_name", "First name")}
          {input("surname", "Surname")}
        </div>
        {input("username", "Username", { hint: "They sign in with this, for example esi.owusu" })}
        {input("admin_phone", "Mobile number", {
          type: "tel",
          hint: "For security messages, such as a password reset",
        })}
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Setting up…" : "Add the school"}
        </Button>
        <ButtonLink href="/schools" variant="outline" size="lg">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Write a school's page**

`frontend/src/components/platform-admin/school-detail.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { errorMessage, fieldErrors, getJson, postJson } from "@/lib/client-api";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatPhoneLocal } from "@/lib/identifiers";
import type { Administrator, OneTimePassword, SchoolDetail, SchoolStatus } from "@/lib/types";
import { STATUS_LABEL, StatusBadge } from "./status-badge";

const COUNTS = [
  ["pupils", "Pupils"],
  ["staff", "Staff"],
  ["parents", "Parents"],
  ["enquiries", "Enquiries"],
] as const;
const CHECK_FORM = "Please check the highlighted fields.";

/** One school as the platform team sees it: counts and setup, never records (amendment §4, §5). */
export function SchoolDetailView({ slug }: { slug: string }) {
  const path = `/api/platform/schools/${slug}`;
  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<SchoolDetail>(path).then(
      (data) => {
        if (!cancelled) setSchool(data);
      },
      (caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path]);

  async function refresh() {
    setSchool(await getJson<SchoolDetail>(path));
  }

  if (error)
    return (
      <p role="alert" className="text-danger">
        {error}
      </p>
    );
  if (!school) return <p className="text-ink-muted">Loading…</p>;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/schools" className="link text-sm">
          All schools
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">{school.name}</h1>
          <StatusBadge status={school.status} />
        </div>
        <p className="mt-1 text-ink-muted">
          {school.town}, {school.region} · added {formatDate(school.created_at)}
        </p>
        <a href={school.url} target="_blank" rel="noreferrer" className="link mt-2 inline-block">
          Open the website
        </a>
      </div>

      <section aria-labelledby="counts-heading" className="surface rounded-card p-6">
        <h2 id="counts-heading" className="text-xl font-semibold">
          At a glance
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {COUNTS.map(([key, label]) => (
            <div key={key}>
              <dt className="text-sm text-ink-muted">{label}</dt>
              <dd className="text-2xl font-semibold">{school.counts[key]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-ink-muted">Counts only: pupils&apos; and families&apos; records stay with the school.</p>
      </section>

      <section aria-labelledby="website-heading" className="surface rounded-card p-6">
        <h2 id="website-heading" className="text-xl font-semibold">
          Website
        </h2>
        {school.blockers.length === 0 ? (
          <p className="mt-2">The website is live.</p>
        ) : (
          <>
            <p className="mt-2">It stays in preview until the school has done these:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {school.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <Administrators school={school} onChanged={refresh} />
      {/* Keyed by status, so its choices and fields reset after each change. */}
      <StatusForm
        key={school.status}
        school={school}
        notice={statusNotice}
        onChanged={(updated) => {
          setStatusNotice(`${updated.name} is now ${STATUS_LABEL[updated.status].toLowerCase()}.`);
          setSchool(updated);
        }}
      />
    </div>
  );
}

function OneTimePasswordNote({ password }: { password: OneTimePassword }) {
  return (
    <div role="status" className="mt-3 rounded-control bg-success/10 p-4">
      <p>
        One-time password for <strong>{password.username}</strong>, shown only once:
      </p>
      <p data-testid="one-time-password" className="mt-1 font-mono text-xl tracking-wider">
        {password.one_time_password}
      </p>
      <p className="mt-1 text-sm">They must change it at their next sign-in.</p>
    </div>
  );
}

function Administrators({ school, onChanged }: { school: SchoolDetail; onChanged: () => Promise<void> }) {
  const base = `/api/platform/schools/${school.slug}/administrators`;
  const [revealed, setRevealed] = useState<{ id: number | "new"; password: OneTimePassword } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function resetPassword(admin: Administrator) {
    if (!window.confirm(`Reset ${admin.name}'s password? They are signed out everywhere and told by SMS.`)) return;
    try {
      const password = await postJson<OneTimePassword>(`${base}/${admin.id}/reset-password`);
      setRevealed({ id: admin.id, password });
      setNotice(null);
      setError(null);
      await onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function resetAuthenticator(admin: Administrator) {
    if (!window.confirm(`Reset ${admin.name}'s authenticator app? They set up a new one at their next sign-in.`))
      return;
    try {
      await postJson(`${base}/${admin.id}/reset-second-factor`);
      setNotice(`${admin.name}'s authenticator app was reset. They set up a new one at their next sign-in.`);
      setRevealed(null);
      setError(null);
      await onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <section aria-labelledby="admins-heading" className="surface rounded-card p-6">
      <h2 id="admins-heading" className="text-xl font-semibold">
        Administrators
      </h2>
      {error && (
        <p role="alert" className="mt-3 text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3">
          {notice}
        </p>
      )}
      {school.administrators.length === 0 && <p className="mt-3 text-ink-muted">No Administrators yet.</p>}
      <ul className="mt-3 divide-y divide-line">
        {school.administrators.map((admin) => (
          <li key={admin.id} className="py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{admin.name}</p>
                <p className="text-sm text-ink-muted">
                  {admin.username}
                  {admin.phone ? ` · ${formatPhoneLocal(admin.phone)}` : ""}
                </p>
                <p className="text-sm text-ink-muted">
                  {admin.has_authenticator ? "Authenticator app set up" : "No authenticator app yet"} ·{" "}
                  {admin.last_sign_in ? `last signed in ${formatDateTime(admin.last_sign_in)}` : "not signed in yet"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => resetPassword(admin)} aria-label={`Reset password for ${admin.name}`}>
                  Reset password
                </Button>
                {admin.has_authenticator && (
                  <Button
                    variant="outline"
                    onClick={() => resetAuthenticator(admin)}
                    aria-label={`Reset authenticator app for ${admin.name}`}
                  >
                    Reset authenticator
                  </Button>
                )}
              </div>
            </div>
            {revealed?.id === admin.id && <OneTimePasswordNote password={revealed.password} />}
          </li>
        ))}
      </ul>
      {revealed?.id === "new" && <OneTimePasswordNote password={revealed.password} />}
      {adding ? (
        <AddAdministrator
          base={base}
          onAdded={async (password) => {
            setRevealed({ id: "new", password });
            setAdding(false);
            await onChanged();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button variant="outline" className="mt-4" onClick={() => setAdding(true)}>
          Add an Administrator
        </Button>
      )}
    </section>
  );
}

type AdminValues = Record<"first_name" | "surname" | "username" | "phone", string>;

function AddAdministrator({
  base,
  onAdded,
  onCancel,
}: {
  base: string;
  onAdded: (password: OneTimePassword) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<AdminValues>({ first_name: "", surname: "", username: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing = Object.fromEntries(
      Object.entries(values)
        .filter(([, value]) => !value.trim())
        .map(([name]) => [name, "Fill this in."]),
    );
    if (Object.keys(missing).length > 0) {
      setError(CHECK_FORM);
      setErrors(missing);
      setAttempt((count) => count + 1);
      return;
    }
    setBusy(true);
    try {
      await onAdded(await postJson<OneTimePassword>(base, values));
    } catch (caught) {
      setError(errorMessage(caught));
      setErrors(fieldErrors(caught));
      setAttempt((count) => count + 1);
    } finally {
      setBusy(false);
    }
  }

  const fields: [keyof AdminValues, string, "text" | "tel"][] = [
    ["first_name", "First name", "text"],
    ["surname", "Surname", "text"],
    ["username", "Username", "text"],
    ["phone", "Mobile number", "tel"],
  ];
  return (
    <form noValidate onSubmit={onSubmit} className="mt-4 max-w-md space-y-5">
      <h3 className="text-lg font-semibold">Add an Administrator</h3>
      <FormAlert message={error} focusKey={attempt} />
      {fields.map(([name, label, type]) => (
        <Field key={name} id={`add-admin-${name}`} label={label} required error={errors[name]}>
          {(props) => (
            <input
              {...props}
              type={type}
              value={values[name]}
              onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
              autoComplete="off"
              className={inputClasses}
            />
          )}
        </Field>
      ))}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Adding…" : "Add"}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

type StatusFormProps = {
  school: SchoolDetail;
  notice: string | null;
  onChanged: (school: SchoolDetail) => void;
};

function StatusForm({ school, notice, onChanged }: StatusFormProps) {
  const choices = (Object.keys(STATUS_LABEL) as SchoolStatus[]).filter((status) => status !== school.status);
  const [status, setStatus] = useState<SchoolStatus>(choices.includes("suspended") ? "suspended" : choices[0]);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim()) {
      setError(CHECK_FORM);
      setErrors({ reason: "Give a reason. It goes in the audit log." });
      setAttempt((count) => count + 1);
      return;
    }
    setBusy(true);
    try {
      onChanged(await postJson<SchoolDetail>(`/api/platform/schools/${school.slug}/status`, { status, reason }));
    } catch (caught) {
      setError(errorMessage(caught));
      setErrors(fieldErrors(caught));
      setAttempt((count) => count + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="status-heading" className="surface rounded-card p-6">
      <h2 id="status-heading" className="text-xl font-semibold">
        Status
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Suspending signs the school&apos;s users out and takes its website offline.
      </p>
      {notice && (
        <p role="status" className="mt-4 rounded-control bg-success/10 p-4">
          {notice}
        </p>
      )}
      <form noValidate onSubmit={onSubmit} className="mt-5 max-w-md space-y-5">
        <FormAlert message={error} focusKey={attempt} />
        <Field id="status-new" label="New status" required>
          {(props) => (
            <select
              {...props}
              value={status}
              onChange={(event) => setStatus(event.target.value as SchoolStatus)}
              className={inputClasses}
            >
              {choices.map((choice) => (
                <option key={choice} value={choice}>
                  {STATUS_LABEL[choice]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field id="status-reason" label="Reason" required error={errors.reason}>
          {(props) => (
            <textarea
              {...props}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className={inputClasses}
            />
          )}
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Change status"}
        </Button>
      </form>
    </section>
  );
}
```

- [ ] **Step 5: Add the routes**

`frontend/src/app/platform-admin/(portal)/schools/new/page.tsx`:
```tsx
import type { Metadata } from "next";
import { NewSchoolForm } from "@/components/platform-admin/new-school-form";

export const metadata: Metadata = { title: "Add a school" };

export default function NewSchoolPage() {
  return <NewSchoolForm />;
}
```

`frontend/src/app/platform-admin/(portal)/schools/[slug]/page.tsx`:
```tsx
import type { Metadata } from "next";
import { SchoolDetailView } from "@/components/platform-admin/school-detail";

export const metadata: Metadata = { title: "School" };

export default async function SchoolPage({ params }: { params: Promise<{ slug: string }> }) {
  return <SchoolDetailView slug={(await params).slug} />;
}
```

- [ ] **Step 6: Run the tests and checks**

Run: `cd frontend && npm test && npm run lint && npm run typecheck`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "Add the platform admin screens for adding a school and managing one"
```

---

### Task 7: Frontend: the leads inbox and the audit log

**Files:**
- Create: `frontend/src/components/platform-admin/leads-view.tsx`, `frontend/src/components/platform-admin/audit-view.tsx`, `frontend/src/app/platform-admin/(portal)/leads/page.tsx`, `frontend/src/app/platform-admin/(portal)/audit/page.tsx`
- Test: `frontend/src/components/platform-admin/leads-view.test.tsx`, `frontend/src/components/platform-admin/audit-view.test.tsx`

**Interfaces:**
- Consumes: the Task 4 endpoints, `patchJson`, and the types `Lead`, `LeadStatus` and `AuditEntry` (Task 5).
- Produces: `<LeadsView />`, `<AuditView />`, `describeAction(action)`, and the routes `/leads` and `/audit` at the admin address.

- [ ] **Step 1: Write the failing tests**

`frontend/src/components/platform-admin/leads-view.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { LeadsView } from "./leads-view";

const LEAD = {
  id: 3, school_name: "Hope Academy", contact_name: "Yaw Asante", phone: "+233241234567",
  email: "yaw@hope.example", town: "Tema", message: "About 200 pupils.", status: "new", staff_notes: "",
  created_at: "2026-10-10T09:00:00Z",
};

describe("leads inbox", () => {
  it("lists leads and saves a status change with notes", async () => {
    const fetchMock = mockApi([
      ["GET", "/api/platform/leads", 200, [LEAD]],
      ["PATCH", "/api/platform/leads/3", 200, { ...LEAD, status: "contacted", staff_notes: "Visiting Monday" }],
    ]);
    const user = userEvent.setup();
    render(<LeadsView />);
    expect(await screen.findByRole("heading", { name: /Hope Academy/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "024 123 4567" })).toHaveAttribute("href", "tel:+233241234567");
    await user.selectOptions(screen.getByLabelText(/^status/i), "contacted");
    await user.type(screen.getByLabelText(/^notes/i), "Visiting Monday");
    await user.click(screen.getByRole("button", { name: "Save Hope Academy" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "PATCH", "/api/platform/leads/3")).toEqual({
      status: "contacted",
      staff_notes: "Visiting Monday",
    });
  });
});
```

`frontend/src/components/platform-admin/audit-view.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockApi } from "@/test/http";
import { AuditView, describeAction } from "./audit-view";

const ENTRIES = [
  {
    id: 2, created_at: "2026-10-10T09:00:00Z", actor_name: "Kojo Ops", action: "STATUS_CHANGED",
    entity_type: "school.school", entity_id: "1", school: "AD Smart School", reason: "Signed up",
  },
  {
    id: 1, created_at: "2026-10-10T08:00:00Z", actor_name: "", action: "SIGN_IN_FAILED",
    entity_type: "", entity_id: "", school: null, reason: "",
  },
];

describe("audit log", () => {
  it("names actions in plain words", () => {
    expect(describeAction("STATUS_CHANGED")).toBe("Status changed");
  });

  it("shows who did what, and where", async () => {
    mockApi([["GET", "/api/platform/audit", 200, ENTRIES]]);
    render(<AuditView />);
    expect(await screen.findByRole("cell", { name: "Status changed" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "AD Smart School" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Platform" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Signed up" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Not signed in" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend && npx vitest run src/components/platform-admin`
Expected: FAIL. `./leads-view` and `./audit-view` cannot be resolved.

- [ ] **Step 3: Write the views and routes**

`frontend/src/components/platform-admin/leads-view.tsx`:
```tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { errorMessage, getJson, patchJson } from "@/lib/client-api";
import { formatDateTime } from "@/lib/dates";
import { formatPhoneLocal } from "@/lib/identifiers";
import type { Lead, LeadStatus } from "@/lib/types";

const LEAD_STATUS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  onboarded: "Onboarded",
  closed: "Closed",
};

/** "Get your school online" requests from the platform site (amendment §5, §6). */
export function LeadsView() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<Lead[]>("/api/platform/leads").then(
      (rows) => {
        if (!cancelled) setLeads(rows);
      },
      (caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Leads</h1>
        <p className="mt-1 text-ink-muted">Requests from the &ldquo;Get your school online&rdquo; form, newest first.</p>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {leads === null && !error && <p className="text-ink-muted">Loading…</p>}
      {leads?.length === 0 && <p className="text-ink-muted">No requests yet.</p>}
      {leads && leads.length > 0 && (
        <ul className="grid gap-4">
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onSaved={(saved) => setLeads((rows) => rows?.map((row) => (row.id === saved.id ? saved : row)) ?? null)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function LeadCard({ lead, onSaved }: { lead: Lead; onSaved: (lead: Lead) => void }) {
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [notes, setNotes] = useState(lead.staff_notes);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      onSaved(await patchJson<Lead>(`/api/platform/leads/${lead.id}`, { status, staff_notes: notes }));
      setMessage("Saved.");
    } catch (caught) {
      setMessage(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="surface rounded-card p-5">
      <h2 className="text-lg font-semibold">
        {lead.school_name} <span className="font-normal text-ink-muted">· {lead.town}</span>
      </h2>
      <p className="text-sm text-ink-muted">{formatDateTime(lead.created_at)}</p>
      <p className="mt-2">
        {lead.contact_name} ·{" "}
        <a href={`tel:${lead.phone}`} className="link">
          {formatPhoneLocal(lead.phone)}
        </a>
        {lead.email && (
          <>
            {" · "}
            <a href={`mailto:${lead.email}`} className="link">
              {lead.email}
            </a>
          </>
        )}
      </p>
      {lead.message && <p className="mt-2 whitespace-pre-line">{lead.message}</p>}
      <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
        <Field id={`lead-${lead.id}-status`} label="Status" required>
          {(props) => (
            <select
              {...props}
              value={status}
              onChange={(event) => setStatus(event.target.value as LeadStatus)}
              className={inputClasses}
            >
              {(Object.keys(LEAD_STATUS) as LeadStatus[]).map((value) => (
                <option key={value} value={value}>
                  {LEAD_STATUS[value]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field id={`lead-${lead.id}-notes`} label="Notes">
          {(props) => (
            <textarea
              {...props}
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={inputClasses}
            />
          )}
        </Field>
        <Button type="submit" variant="outline" disabled={busy} aria-label={`Save ${lead.school_name}`}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </form>
      {message && (
        <p role="status" className="mt-2 text-sm">
          {message}
        </p>
      )}
    </li>
  );
}
```

`frontend/src/components/platform-admin/audit-view.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { errorMessage, getJson } from "@/lib/client-api";
import { formatDateTime } from "@/lib/dates";
import type { AuditEntry } from "@/lib/types";

/** STATUS_CHANGED → "Status changed". */
export function describeAction(action: string): string {
  const words = action.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Platform events, and everything the platform team did in any school (amendment §4). */
export function AuditView() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<AuditEntry[]>("/api/platform/audit").then(
      (rows) => {
        if (!cancelled) setEntries(rows);
      },
      (caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Audit log</h1>
        <p className="mt-1 text-ink-muted">
          Platform events, and everything the platform team did in a school. The latest 200.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {entries === null && !error && <p className="text-ink-muted">Loading…</p>}
      {entries?.length === 0 && <p className="text-ink-muted">Nothing recorded yet.</p>}
      {entries && entries.length > 0 && (
        // Focusable so keyboard users can scroll it sideways on a phone.
        <div role="region" aria-label="Audit entries" tabIndex={0} className="surface overflow-x-auto rounded-card">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Platform audit log</caption>
            <thead className="bg-ink/5">
              <tr>
                {["When", "Who", "What", "School", "Details"].map((heading) => (
                  <th key={heading} scope="col" className="px-4 py-3 font-semibold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-line">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(entry.created_at)}</td>
                  <td className="px-4 py-3">{entry.actor_name || "Not signed in"}</td>
                  <td className="px-4 py-3">{describeAction(entry.action)}</td>
                  <td className="px-4 py-3">{entry.school ?? "Platform"}</td>
                  <td className="px-4 py-3">{entry.reason || `${entry.entity_type} ${entry.entity_id}`.trim()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

`frontend/src/app/platform-admin/(portal)/leads/page.tsx`:
```tsx
import type { Metadata } from "next";
import { LeadsView } from "@/components/platform-admin/leads-view";

export const metadata: Metadata = { title: "Leads" };

export default function LeadsPage() {
  return <LeadsView />;
}
```

`frontend/src/app/platform-admin/(portal)/audit/page.tsx`:
```tsx
import type { Metadata } from "next";
import { AuditView } from "@/components/platform-admin/audit-view";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage() {
  return <AuditView />;
}
```

- [ ] **Step 4: Run the tests and checks**

Run: `cd frontend && npm test && npm run lint && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "Add the leads inbox and the audit log to the platform admin area"
```

---

### Task 8: Browser tests for the platform admin area, plus docs

**Files:**
- Create: `frontend/e2e/helpers.ts`, `frontend/e2e/platform-admin.spec.ts`
- Rewrite: `frontend/e2e/sign-in.spec.ts` (uses the shared helpers; the admin address now opens on Schools)
- Modify: `frontend/e2e/accounts.json`, `frontend/e2e/serve.mjs`, `README.md`

**Interfaces:**
- Consumes: everything above, through the real Next.js proxy.
- Produces: `e2e/helpers.ts` with `ADMIN`, `expectAccessibleInBothThemes`, `openHydrated`, `signIn` and `setUpAuthenticator`. Callers assert where the page lands.

- [ ] **Step 1: Share the sign-in helpers**

`frontend/e2e/helpers.ts`:
```ts
import { expect, type Page } from "@playwright/test";
import { expectNoAccessibilityViolations } from "./axe";
import { totp } from "./totp";

export const ADMIN = "http://admin.localhost:3100";

export async function expectAccessibleInBothThemes(page: Page) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await expectNoAccessibilityViolations(page);
  }
}

/** Opens a page once React runs on it: the sign-in forms ask for /api/auth/me as they mount. */
export async function openHydrated(page: Page, url: string) {
  await Promise.all([page.waitForResponse((response) => response.url().endsWith("/api/auth/me")), page.goto(url)]);
}

export async function signIn(page: Page, tab: string | null, username: string, password: string) {
  if (tab) await page.getByRole("tab", { name: tab }).click();
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** First sign-in for a role that needs the second factor: set up the app, save the codes. */
export async function setUpAuthenticator(page: Page) {
  await expect(page.getByRole("heading", { name: "Set up your authenticator app" })).toBeVisible();
  const secret = (await page.getByTestId("manual-key").textContent())?.trim() ?? "";
  await page.getByLabel(/6-digit code/i).fill(totp(secret));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Save your backup codes" })).toBeVisible();
  await page.getByRole("button", { name: /saved them/i }).click();
}
```

`frontend/e2e/sign-in.spec.ts`:
```ts
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import accounts from "./accounts.json";
import { ADMIN, expectAccessibleInBothThemes, openHydrated, setUpAuthenticator, signIn } from "./helpers";

type Project = keyof typeof accounts.staff;
const OUTBOX = path.resolve(process.cwd(), "../backend/e2e-sms.jsonl");
const OTHER_SCHOOL = "http://brightfuture.localhost:3100";

function lastCodeTo(e164: string): string {
  const messages = fs
    .readFileSync(OUTBOX, "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { to: string; body: string });
  const message = messages.reverse().find((item) => item.to === e164);
  return message?.body.match(/\d{6}/)?.[0] ?? "";
}

/** The form's own message; Next.js keeps a second, empty alert for announcing page changes. */
const formAlert = (page: Page) => page.getByRole("main").getByRole("alert");

test("each school's sign-in page names that school and is accessible in light and dark", async ({ page }) => {
  await openHydrated(page, "/sign-in");
  await expect(page.getByText("For parents, pupils and staff of AD Smart School.")).toBeVisible();
  await expectAccessibleInBothThemes(page);
  await openHydrated(page, `${OTHER_SCHOOL}/sign-in`);
  await expect(page.getByText("For parents, pupils and staff of Bright Future Academy.")).toBeVisible();
});

test("a wrong password gets the one generic message", async ({ page }) => {
  await openHydrated(page, "/sign-in");
  await signIn(page, "Staff", "nobody.here", "not the password");
  await expect(formAlert(page)).toHaveText("Incorrect username or password.");
});

test("an account from one school cannot sign in at another", async ({ page }, testInfo) => {
  await openHydrated(page, `${OTHER_SCHOOL}/sign-in`);
  await signIn(page, "Staff", accounts.staff[testInfo.project.name as Project], accounts.password);
  await expect(formAlert(page)).toHaveText("Incorrect username or password.");
});

test("an administrator sets up the second factor at first sign-in", async ({ page }, testInfo) => {
  await openHydrated(page, "/sign-in");
  await signIn(page, "Staff", accounts.staff[testInfo.project.name as Project], accounts.password);
  await setUpAuthenticator(page);
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expectAccessibleInBothThemes(page);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in/);
});

test("a parent activates their account with an SMS code from their school", async ({ page }, testInfo) => {
  const local = accounts.parents[testInfo.project.name as Project];
  await openHydrated(page, "/sign-in");
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/auth/me")),
    page.getByRole("link", { name: /first time/i }).click(),
  ]);
  await page.getByLabel(/mobile number/i).fill(local);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("If this number is registered, a code has been sent.")).toBeVisible();

  await page.getByLabel(/code from the sms/i).fill(lastCodeTo(`+233${local.slice(1)}`));
  await page.getByLabel(/^new password/i).fill(accounts.password);
  await page.getByLabel(/type it again/i).fill(accounts.password);
  await page.getByRole("button", { name: /set password/i }).click();

  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.getByText(`${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`)).toBeVisible();
  await expectAccessibleInBothThemes(page);
});

test("platform staff sign in at the admin address with a second factor", async ({ page }, testInfo) => {
  await page.goto(`${ADMIN}/`);
  await expect(page).toHaveURL(`${ADMIN}/sign-in?next=%2Fschools`);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await signIn(page, null, accounts.platform[testInfo.project.name as Project], accounts.password);
  await setUpAuthenticator(page);
  await expect(page.getByRole("heading", { name: "Schools" })).toBeVisible();
});
```

- [ ] **Step 2: Write the platform admin browser test**

In `frontend/e2e/accounts.json`, add `"platform_admins": { "phone": "e2e-boss-phone", "desktop": "e2e-boss-desktop" }`. These are separate platform accounts, because each first sign-in sets up a new authenticator app.

In `frontend/e2e/serve.mjs`, after the `accounts.platform` loop, add:
```js
for (const [project, username] of Object.entries(accounts.platform_admins)) {
  await createUser("--kind", "platform", "--username", username, "--name", `Ama Boss ${project}`,
    "--password", accounts.password);
}
```

`frontend/e2e/platform-admin.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import accounts from "./accounts.json";
import { ADMIN, expectAccessibleInBothThemes, openHydrated, setUpAuthenticator, signIn } from "./helpers";

type Project = keyof typeof accounts.platform_admins;
const ADMIN_MOBILE: Record<Project, string> = { phone: "024 555 0101", desktop: "024 555 0102" };
const NEW_PASSWORD = "a fresh school passphrase";

test("the platform team adds a school, and its Administrator signs in", async ({ page }, testInfo) => {
  const project = testInfo.project.name as Project;
  const name = `E2E School ${project}`;
  const site = `http://e2e-school-${project}.localhost:3100`;

  await page.goto(`${ADMIN}/`);
  await expect(page).toHaveURL(`${ADMIN}/sign-in?next=%2Fschools`);
  await signIn(page, null, accounts.platform_admins[project], accounts.password);
  await setUpAuthenticator(page);
  await expect(page.getByRole("heading", { name: "Schools" })).toBeVisible();
  await expect(page.getByRole("link", { name: /AD Smart School/ })).toBeVisible();
  await expectAccessibleInBothThemes(page);

  await page.getByRole("link", { name: "Add a school" }).click();
  await page.getByLabel(/^school name/i).fill(name);
  await expect(page.getByLabel(/^web address/i)).toHaveValue(`e2e-school-${project}`);
  await page.getByLabel(/^town/i).fill("Ejisu");
  await page.getByLabel(/^region/i).fill("Ashanti Region");
  await page.getByLabel(/^school phone/i).fill("020 111 2233");
  await page.getByLabel(/^school email/i).fill(`office@${project}.example`);
  await page.getByLabel(/^first name/i).fill("Abena");
  await page.getByLabel(/^surname/i).fill("Darko");
  await page.getByLabel(/^username/i).fill("head");
  await page.getByLabel(/^mobile number/i).fill(ADMIN_MOBILE[project]);
  await page.getByRole("button", { name: "Add the school" }).click();
  await expect(page.getByRole("heading", { name: `${name} is set up` })).toBeVisible();
  const password = (await page.getByTestId("one-time-password").textContent())?.trim() ?? "";

  await page.goto(`${site}/`);
  await expect(page).toHaveTitle(new RegExp(name));

  await openHydrated(page, `${site}/sign-in`);
  await signIn(page, "Staff", "head", password);
  await setUpAuthenticator(page);
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.getByText(/choose your own password/i)).toBeVisible();
  await page.getByLabel(/current password/i).fill(password);
  await page.getByLabel(/^new password/i).fill(NEW_PASSWORD);
  await page.getByLabel(/type it again/i).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText(/password changed/i)).toBeVisible();
});
```

- [ ] **Step 3: Run the browser tests**

Run: `cd frontend && npm run e2e`
Expected: every spec passes in both projects, including the new platform admin test.

- [ ] **Step 4: Document the platform admin area**

In `README.md`, in "One platform, many schools", replace the **Add a school** bullet with:
```markdown
- **The platform admin area:** `http://admin.localhost:3000`. Sign in with a platform account
  (`manage.py create_user --kind platform --username yourname --name "Your Name"`) and set up an
  authenticator app. There you can:
  - Add a school with its first Administrator. The one-time password is shown once; they change it
    and set up their own authenticator app at first sign-in.
  - Open a school's page for counts, the go-live list and its Administrators. You can reset an
    Administrator's password or authenticator app; they are told by SMS.
  - Suspend or reactivate a school, with a reason.
  - Work through the "Get your school online" leads, and read the platform audit log.
- **Adding a school from the command line** still works:
  `.venv/Scripts/python manage.py create_school --slug brightfuture --name "Bright Future Academy"
  --town Ejisu --region "Ashanti Region" --phone 0201234567 --email office@brightfuture.example
  --levels kg,lower_primary,upper_primary`.
```

- [ ] **Step 5: Run every check and commit**

Run: `scripts/check.sh` and then `WITH_E2E=1 scripts/check.sh`.
Expected: "All checks passed."

```bash
git add frontend/e2e README.md
git commit -m "Add browser tests for adding a school and its Administrator's first sign-in"
```
