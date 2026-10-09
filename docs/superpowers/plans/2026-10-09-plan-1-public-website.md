# Plan 1 — Public Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship AD Smart School's public website — Django content API + Next.js site with the Warm Authority glass design system, light/dark themes, swipe and swing interactions, and a working admissions enquiry form — running locally and fully tested.

**Architecture:** A Django REST API (`backend/`) owns all website content, placeholder photos (with WebP renditions made by Pillow), the go-live gate and admissions enquiries. A Next.js App Router frontend (`frontend/`) pre-renders the public pages from that API (ISR, 5-minute revalidation) and forwards `/api/*` and `/media/*` to Django so the browser only ever talks to one origin.

**Tech Stack:** Python 3.14, Django 6.1.2, Django REST Framework 3.18.3, Pillow, phonenumbers, SQLite (Plan 1 only) · Node 24, Next.js 16.4 (React 19, TypeScript), Tailwind CSS 4.3, Motion 14, Embla Carousel 8.6, Radix Dialog, React Hook Form + Zod 4, Lucide icons · pytest, Vitest + Testing Library, Playwright + axe, Lighthouse CI.

**Spec:** `docs/superpowers/specs/2026-10-09-ad-smart-school-website-phase1-design.md` (read §1, §2, §3.6, §6, §8, §10–§13 before starting).

This is **Plan 1 of 5**. Later plans: 2) sign-in & security (switches to PostgreSQL), 3) school & people records + demo data, 4) portal screens (incl. website content editing and the enquiry inbox), 5) deploy readiness (Caddy, CSP, production settings).

**Deliberately deferred from the spec's website sections** (each lands with the plan that provides what it needs):
- "Key dates" on the home page (spec §6.2 item 7) → Plan 3, which creates the school calendar. Until then the section shows news only.
- Content editing screens, enquiry inbox, go-live checklist and **Mark site live** switch (§7.2), on-demand revalidation when content is saved (§2.2) → Plan 4. Until then content is edited in the development-only Django admin, and pages refresh within 5 minutes.
- Portal sign-in button (§6.2 item 1) → appears automatically once Plan 2 sets `NEXT_PUBLIC_PORTAL_URL`.
- Route slide transitions (§8.6 "Pages") → Plan 4, with the portal's navigation.
- Content Security Policy and other security headers (§11.1) → Plan 5 (set at the Caddy layer).

## Global Constraints

- Repository root: `C:\Dev\ad-smart-school` (outside OneDrive). Shell commands below are **Git Bash**; the backend Python is `backend/.venv/Scripts/python` (Windows venv layout).
- Python **3.14** (`py -3.14`), Django **6.1.2**, DRF **3.18.3**, Node **24**, Next.js **16.4.0**, Tailwind **4.3**. Pin Python packages exactly (versions below); npm lockfile pins the frontend.
- Plan 1 database: **SQLite** when `DATABASE_URL` is unset. Nothing may depend on SQLite-specific behaviour (Plan 2 switches to PostgreSQL and re-runs every test).
- Time zone **Africa/Accra**; display dates as `9 October 2026` (en-GB); phone numbers stored E.164 (`+233545875881`), displayed `054 587 5881`.
- API: public endpoints live under `/api/public/` with **no trailing slash**; every error body is `{"code", "message", "fields"}` (spec §10).
- Colours come only from the CSS tokens of spec §8.1 (`--paper`, `--ink`, `--accent-indigo`, `--brand-amber`, …). **No raw hex in components** — the logo SVG (a brand asset) is the only exception.
- Font: **Poppins** 400/500/600/700, subsets `latin` + `latin-ext`, via `next/font/google`.
- Glass: clear glass is **dark-tinted** (`rgba(11,10,31,0.38)` light / `0.45` dark) for white text over photos; frosted glass for everything read or typed in; **Lite mode** (`data-lite` on `<html>`) removes all `backdrop-filter` (spec §8.2).
- Motion: animate only `transform`/`opacity`; at most 1–2 featured animations per screen; everything honours `prefers-reduced-motion` (spec §8.6).
- Every swipe has a visible button/keyboard alternative and swipes never start within **24 px** of the screen edge (spec §8.5).
- Touch targets ≥ **44 × 44 px**; WCAG 2.2 AA in **both** themes (spec §8.7).
- Performance: first mobile load ≈ **≤ 500 KB**; Lighthouse mobile Performance, Accessibility, Best Practices ≥ **0.9** (SEO is asserted at launch in Plan 5, because preview pages are deliberately `noindex`).
- Honesty rules: no invented statistics; "For parents" feature blocks are **off by default**; placeholder photos, provisional text and a draft privacy notice keep the site in **Preview** (`noindex` + ribbon) — spec §6.5.
- Copy is plain British English ("colour", "enrol", "programme").
- Commit after every task with an imperative message; never commit `backend/.env`, databases, `media/`, `node_modules/` or `.next/`.

## Review Focus

Inputs the spec implies but would be easy to get wrong — each has a test in the owning task:

1. **Ghanaian letters in names** (`Ɛsi Ɔwusu-Ansah`): enquiries must accept and email them intact, and the font must render them (latin-ext subset). → Task 8 test `test_accepts_ghanaian_letters_in_names`; Task 11 font subsets.
2. **Shared mobile IPs (carrier-grade NAT)**: many Ghanaian parents share one public IP, so the per-IP enquiry throttle must be generous (30/hour) while the per-phone limit (3/day) stops repeats. → Task 8 tests `test_ip_throttle_allows_thirty_per_hour` and `test_fourth_enquiry_from_same_phone_in_a_day_is_refused`.
3. **Missing optional content** (no gallery photos, no news, no enabled features, empty motto, no hero photo): sections disappear cleanly, nothing crashes. → Task 7 `test_site_payload_with_no_photos`; Task 15 tests `ForParents renders nothing without features` and `Hero falls back to the brand gradient`.
4. **Backend unreachable from the browser** (form token fails, network drops on submit): the form explains what happened and offers the school's phone number. → Task 16 test `shows a helpful message when the form token cannot be loaded`.
5. **Tiny or portrait placeholder photos** (one source image is only 235 px wide): renditions must never upscale and must keep the aspect ratio. → Task 3 test `test_tiny_images_get_one_rendition_at_their_own_width`.

---

## File Structure

```
.gitattributes / .gitignore / .editorconfig / README.md
scripts/check.sh                         one command for lint + types + tests + audits (+ e2e)
docs/brand/ad-smart-school-logo.png      owner-supplied logo (source of truth for the SVG)
backend/
  requirements.txt, requirements-dev.txt, pyproject.toml, manage.py, .env.example
  config/settings.py, settings_test.py, urls.py, wsgi.py, asgi.py
  apps/core/       exceptions.py (error shape), images.py (WebP renditions), models.py
                   (ImageRenditionsMixin), phones.py (Ghana numbers), views.py (health)
  apps/school/     models.py (SchoolProfile), admin.py
  apps/consent/    models.py (PrivacyNotice), admin.py
  apps/website/    models.py (SiteSettings, ContentBlock, PhotoSlot, Fact, FeatureBlock,
                   NewsPost, Enquiry), services.py (go-live gate, site payload),
                   enquiries.py (form token, limits, email), serializers.py, views.py,
                   urls.py, admin.py, seed_data.py, seeding.py,
                   management/commands/seed_website.py
  seed/placeholder_photos/*.jpg          14 placeholder photos (renamed by slot key)
  tests/ ...                             pytest suite mirroring apps/
frontend/
  next.config.ts, vitest.config.mts, vitest.setup.ts, playwright.config.ts, lighthouserc.json
  e2e/serve.mjs, e2e/lighthouse.mjs, e2e/*.spec.ts
  src/app/layout.tsx, globals.css, not-found.tsx, sitemap.ts, robots.ts, opengraph-image.tsx
  src/app/(public)/layout.tsx, page.tsx, about/, levels/, admissions/, news/, news/[slug]/,
                   contact/, privacy/
  src/lib/         cn.ts, theme.ts, boot-script.ts, motion.ts, types.ts, api.ts, client-api.ts,
                   rich-text.ts, levels.ts, dates.ts, enquiry-schema.ts, edge-drag.ts,
                   use-swipe-down.ts
  src/components/ui/      button.tsx, container.tsx, section-heading.tsx, category-badge.tsx,
                          responsive-image.tsx, rich-text.tsx
  src/components/brand/   logo-mark.tsx, brand-link.tsx
  src/components/motion/  swing-in.tsx
  src/components/site/    header.tsx, mobile-menu.tsx, theme-toggle.tsx, nav.ts, footer.tsx,
                          preview-ribbon.tsx, skip-link.tsx, school-json-ld.tsx, page-hero.tsx,
                          card-rail.tsx, news-cards.tsx, map-embed.tsx, enquiry-form.tsx,
                          field.tsx
  src/components/site/home/  hero.tsx, proof-strip.tsx, levels-section.tsx, for-parents.tsx,
                             gallery.tsx, lightbox.tsx, admissions-cta.tsx
```

---

## Task 0: Repository hygiene and source assets

**Files:**
- Create: `.gitignore`, `.gitattributes`, `.editorconfig`
- Create: `backend/seed/placeholder_photos/*.jpg` (14 files), `docs/brand/ad-smart-school-logo.png`

**Interfaces:**
- Produces: placeholder photo files named `hero.jpg`, `about.jpg`, `gallery_01.jpg` … `gallery_12.jpg` (used by Task 9's seed data).

- [ ] **Step 1: Write `.gitignore`**

```gitignore
# Python
backend/.venv/
__pycache__/
*.pyc
backend/.env
backend/db.sqlite3
backend/e2e.sqlite3
backend/media/
backend/e2e-media/
backend/staticfiles/
.pytest_cache/
.ruff_cache/

# Node / Next.js
frontend/node_modules/
frontend/.next/
frontend/out/
frontend/.env*.local
frontend/test-results/
frontend/playwright-report/
frontend/.lighthouseci/
frontend/next-env.d.ts
*.tsbuildinfo

# OS / editors
.DS_Store
Thumbs.db
.vscode/
.idea/
```

- [ ] **Step 2: Write `.gitattributes` and `.editorconfig`**

`.gitattributes`:
```gitattributes
* text=auto eol=lf
*.jpg binary
*.jpeg binary
*.png binary
*.webp binary
*.ico binary
*.woff2 binary
```

`.editorconfig`:
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.py]
indent_size = 4

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 3: Copy the placeholder photos and the logo**

```bash
SRC="/c/Users/kofia/OneDrive/Desktop/Codes"
DST="/c/Dev/ad-smart-school/backend/seed/placeholder_photos"
mkdir -p "$DST" /c/Dev/ad-smart-school/docs/brand
cp "$SRC/download - 2026-10-09T010130.450.jpg" "$DST/hero.jpg"
cp "$SRC"/Okul*.jpg "$DST/about.jpg"
cp "$SRC/10 Sequenced Block Activities for Early Number Skills.jpg" "$DST/gallery_01.jpg"
cp "$SRC/download - 2026-10-09T010108.829.jpg" "$DST/gallery_02.jpg"
cp "$SRC"/12\ Stories*.jpg "$DST/gallery_03.jpg"
cp "$SRC/Computer.jpg" "$DST/gallery_04.jpg"
cp "$SRC/Library interior.jpg" "$DST/gallery_05.jpg"
cp "$SRC/Sports Build Future Leaders.jpg" "$DST/gallery_06.jpg"
cp "$SRC/download - 2026-10-09T005537.401.jpg" "$DST/gallery_07.jpg"
cp "$SRC"/Lab\ Facilities*.jpg "$DST/gallery_08.jpg"
cp "$SRC"/Students\ from\ Central*.jpg "$DST/gallery_09.jpg"
cp "$SRC/download - 2026-10-09T010047.522.jpg" "$DST/gallery_10.jpg"
cp "$SRC"/Too\ Many*.jpg "$DST/gallery_11.jpg"
cp "$SRC"/⚡*.jpg "$DST/gallery_12.jpg"
cp "/c/Users/kofia/AppData/Local/Temp/claude/C--Users-kofia-OneDrive-Desktop-Codes/2aead5f9-d522-468b-ad35-9de0f9cadc00/images/1.png" /c/Dev/ad-smart-school/docs/brand/ad-smart-school-logo.png
ls "$DST" | wc -l
```
Expected: `14`.

- [ ] **Step 4: Renormalise line endings and commit**

```bash
cd /c/Dev/ad-smart-school
git add --renormalize .
git add .gitignore .gitattributes .editorconfig backend/seed docs/brand
git commit -m "Add repository hygiene files and placeholder photo assets"
```

---

## Task 1: Backend skeleton with health endpoint

**Files:**
- Create: `backend/requirements.txt`, `backend/requirements-dev.txt`, `backend/pyproject.toml`, `backend/manage.py`, `backend/.env.example`
- Create: `backend/config/__init__.py`, `settings.py`, `settings_test.py`, `urls.py`, `wsgi.py`, `asgi.py`
- Create: `backend/apps/__init__.py`, `backend/apps/core/__init__.py`, `apps.py`, `views.py`
- Test: `backend/tests/__init__.py`, `backend/tests/conftest.py`, `backend/tests/test_health.py`

**Interfaces:**
- Produces: `GET /api/health` → `200 {"status": "ok"}`; pytest fixtures `api` (DRF `APIClient`) and an autouse fixture that points `MEDIA_ROOT` at a temp dir and clears the cache.

- [ ] **Step 1: Create the virtual environment and requirement files**

`backend/requirements.txt`:
```text
Django==6.1.2
djangorestframework==3.18.3
django-environ==0.14.0
phonenumbers==9.0.41
Pillow==12.3.0
tzdata==2026.5
```

`backend/requirements-dev.txt`:
```text
-r requirements.txt
pytest==9.1.1
pytest-django==4.14.0
ruff==0.16.10
pip-audit==2.10.1
```

```bash
cd /c/Dev/ad-smart-school/backend
py -3.14 -m venv .venv
.venv/Scripts/python -m pip install --upgrade pip
.venv/Scripts/python -m pip install -r requirements-dev.txt
```
Expected: installs without errors (`tzdata` is required on Windows for `Africa/Accra`).

- [ ] **Step 2: Write the failing test**

`backend/tests/__init__.py`: empty file.

`backend/tests/conftest.py`:
```python
import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _isolated_media_and_cache(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / "media"
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api():
    from rest_framework.test import APIClient

    return APIClient()
```

`backend/tests/test_health.py`:
```python
def test_health_returns_ok(api):
    response = api.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

`backend/pyproject.toml`:
```toml
[tool.pytest.ini_options]
DJANGO_SETTINGS_MODULE = "config.settings_test"
testpaths = ["tests"]
python_files = ["test_*.py"]
addopts = "-q"

[tool.ruff]
line-length = 100
target-version = "py314"
extend-exclude = ["**/migrations/*"]

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "DJ"]
```

Run: `.venv/Scripts/python -m pytest`
Expected: FAIL / error — `config.settings_test` cannot be imported.

- [ ] **Step 3: Write the Django project**

`backend/manage.py`:
```python
#!/usr/bin/env python
import os
import sys


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
```

`backend/config/__init__.py`, `backend/apps/__init__.py`, `backend/apps/core/__init__.py`: empty files.

`backend/config/settings.py`:
```python
"""Settings for the AD Smart School backend.

Every value that differs between environments comes from environment
variables; backend/.env.example lists them all.
"""

from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env()
if (BASE_DIR / ".env").exists():
    env.read_env(str(BASE_DIR / ".env"))

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "apps.core",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Plan 1 runs on SQLite while DATABASE_URL is unset; Plan 2 switches to PostgreSQL.
if env("DATABASE_URL", default=""):
    DATABASES = {"default": env.db("DATABASE_URL")}
else:
    DATABASES = {
        "default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}
    }

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Shared by every process without extra services. Create with: manage.py createcachetable
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache",
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-gb"
TIME_ZONE = "Africa/Accra"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = Path(env("DJANGO_MEDIA_ROOT", default=str(BASE_DIR / "media")))

# API paths have no trailing slash; Next.js forwards them unchanged.
APPEND_SLASH = False

EMAIL_BACKEND = env(
    "DJANGO_EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend"
)
DEFAULT_FROM_EMAIL = env(
    "DJANGO_DEFAULT_FROM_EMAIL", default="AD Smart School <no-reply@localhost>"
)

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    # Reverse proxies in front of Django: Next.js in development (1); Caddy + Next.js later (2).
    "NUM_PROXIES": env.int("DJANGO_NUM_PROXIES", default=1),
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
```

`backend/config/settings_test.py`:
```python
"""Test settings: fast hashing, in-memory email and cache, no real secrets."""

import os

os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-secret-key-not-used-anywhere-else-0123456789")

from config.settings import *  # noqa: E402,F403

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
```

`backend/config/urls.py`:
```python
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path

from apps.core.views import health

urlpatterns = [
    path("api/health", health, name="health"),
]

if settings.DEBUG:
    # Development only: Django admin and media files. Production edits content in the
    # portal (Plan 4) and serves media through Caddy (Plan 5).
    urlpatterns += [path("django-admin/", admin.site.urls)]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
```

`backend/config/wsgi.py`:
```python
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

application = get_wsgi_application()
```

`backend/config/asgi.py`:
```python
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

application = get_asgi_application()
```

`backend/apps/core/apps.py`:
```python
from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = "apps.core"
    label = "core"
```

`backend/apps/core/views.py`:
```python
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok"})
```

`backend/.env.example`:
```dotenv
# Copy to backend/.env and adjust. Never commit the real .env.
DJANGO_SECRET_KEY=replace-with-the-output-of-py-c-import-secrets-print-secrets.token_urlsafe-50
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
# Leave DATABASE_URL unset to use backend/db.sqlite3 (Plan 1). Plan 2 switches to PostgreSQL:
# DATABASE_URL=postgres://adss:CHANGE_ME@127.0.0.1:5432/adss
DJANGO_EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
DJANGO_DEFAULT_FROM_EMAIL=AD Smart School <no-reply@localhost>
DJANGO_NUM_PROXIES=1
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/Scripts/python -m pytest`
Expected: `1 passed`.

- [ ] **Step 5: Create the local `.env`, migrate, and lint**

```bash
cd /c/Dev/ad-smart-school/backend
cp .env.example .env
SECRET=$(.venv/Scripts/python -c "import secrets; print(secrets.token_urlsafe(50))")
sed -i "s|^DJANGO_SECRET_KEY=.*|DJANGO_SECRET_KEY=$SECRET|" .env
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py createcachetable
.venv/Scripts/python -m ruff check . && .venv/Scripts/python -m ruff format --check .
```
Expected: migrations apply; ruff reports no issues (run `ruff format .` first if it reports formatting).

- [ ] **Step 6: Commit**

```bash
cd /c/Dev/ad-smart-school
git add backend
git commit -m "Add Django backend skeleton with health endpoint"
```

---

## Task 2: One error shape for every API response

**Files:**
- Create: `backend/apps/core/exceptions.py`
- Modify: `backend/config/settings.py` (`REST_FRAMEWORK`)
- Test: `backend/tests/core/__init__.py`, `backend/tests/core/test_exceptions.py`

**Interfaces:**
- Produces: `apps.core.exceptions.api_exception_handler(exc, context)`; `ApiError(code: str, message: str, status_code: int = 400)` — raise it anywhere in a view to return `{"code": code, "message": message, "fields": {}}`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/core/__init__.py`: empty file.

`backend/tests/core/test_exceptions.py`:
```python
from django.http import Http404
from rest_framework import exceptions

from apps.core.exceptions import ApiError, api_exception_handler


def test_validation_errors_are_flattened_per_field():
    exc = exceptions.ValidationError(
        {"phone": ["Enter a valid Ghana mobile number."], "non_field_errors": ["Bad request."]}
    )

    response = api_exception_handler(exc, {})

    assert response.status_code == 400
    assert response.data == {
        "code": "validation_error",
        "message": "Please check the highlighted fields.",
        "fields": {"phone": ["Enter a valid Ghana mobile number."], "form": ["Bad request."]},
    }


def test_nested_validation_errors_use_dotted_names():
    exc = exceptions.ValidationError({"guardian": {"phone": ["Required."]}})

    assert api_exception_handler(exc, {}).data["fields"] == {"guardian.phone": ["Required."]}


def test_throttled_requests_get_a_friendly_message():
    response = api_exception_handler(exceptions.Throttled(wait=3600), {})

    assert response.status_code == 429
    assert response.data == {
        "code": "throttled",
        "message": "Too many attempts. Please try again later.",
        "fields": {},
    }


def test_api_error_carries_its_code_message_and_status():
    response = api_exception_handler(ApiError("too_fast", "Please slow down.", 400), {})

    assert response.status_code == 400
    assert response.data == {"code": "too_fast", "message": "Please slow down.", "fields": {}}


def test_not_found_uses_the_same_shape():
    response = api_exception_handler(Http404(), {})

    assert response.status_code == 404
    assert response.data["code"] == "not_found"
    assert response.data["fields"] == {}


def test_unexpected_exceptions_are_left_to_django():
    assert api_exception_handler(ValueError("boom"), {}) is None
```

Run: `.venv/Scripts/python -m pytest tests/core/test_exceptions.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'apps.core.exceptions'`.

- [ ] **Step 2: Implement the handler**

`backend/apps/core/exceptions.py`:
```python
"""Every API error has the same shape: {"code", "message", "fields"} (spec §10)."""

from rest_framework import exceptions
from rest_framework.views import exception_handler

VALIDATION_MESSAGE = "Please check the highlighted fields."
THROTTLED_MESSAGE = "Too many attempts. Please try again later."


class ApiError(exceptions.APIException):
    """A user-facing error with its own code, e.g. ApiError("too_fast", "…", 400)."""

    def __init__(self, code: str, message: str, status_code: int = 400):
        self.status_code = status_code
        super().__init__(detail=message, code=code)


def _flatten(data, prefix: str = "") -> dict[str, list[str]]:
    fields: dict[str, list[str]] = {}
    if isinstance(data, dict):
        for key, value in data.items():
            name = "form" if key in ("non_field_errors", "detail") else str(key)
            fields.update(_flatten(value, f"{prefix}.{name}" if prefix else name))
    elif isinstance(data, list) and all(not isinstance(item, dict | list) for item in data):
        fields[prefix or "form"] = [str(item) for item in data]
    elif isinstance(data, list):
        for index, item in enumerate(data):
            fields.update(_flatten(item, f"{prefix}.{index}" if prefix else str(index)))
    else:
        fields[prefix or "form"] = [str(data)]
    return fields


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(exc, exceptions.ValidationError):
        body = {
            "code": "validation_error",
            "message": VALIDATION_MESSAGE,
            "fields": _flatten(response.data),
        }
    elif isinstance(exc, exceptions.Throttled):
        body = {"code": "throttled", "message": THROTTLED_MESSAGE, "fields": {}}
    else:
        detail = getattr(exc, "detail", None)
        code = getattr(detail, "code", None) or getattr(exc, "default_code", "error")
        message = str(detail) if detail else "Something went wrong."
        body = {"code": str(code), "message": message, "fields": {}}

    response.data = body
    return response
```

In `backend/config/settings.py`, add this key inside `REST_FRAMEWORK`:
```python
    "EXCEPTION_HANDLER": "apps.core.exceptions.api_exception_handler",
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `.venv/Scripts/python -m pytest`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add backend
git commit -m "Return one JSON error shape from the API"
```

---

## Task 3: WebP image renditions

**Files:**
- Create: `backend/apps/core/images.py`
- Test: `backend/tests/helpers.py`, `backend/tests/core/test_images.py`

**Interfaces:**
- Produces:
  - `build_renditions(source_name: str) -> list[dict]` — reads a file from `default_storage`, writes WebP copies at 480/960/1600 px wide (never wider than the source; the source width itself is always included, capped at 1600) and returns `[{"width": int, "height": int, "name": str}, …]` sorted by width.
  - `image_payload(renditions: list[dict], alt: str) -> dict | None` — `{"src", "srcset", "width", "height", "alt"}` using the largest rendition, or `None` when there are no renditions.
  - `tests.helpers.jpeg_bytes(size=(800, 600)) -> bytes` and `jpeg_upload(name="photo.jpg", size=(800, 600)) -> SimpleUploadedFile`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/helpers.py`:
```python
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image


def jpeg_bytes(size=(800, 600)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, (16, 120, 190)).save(buffer, "JPEG")
    return buffer.getvalue()


def jpeg_upload(name="photo.jpg", size=(800, 600)) -> SimpleUploadedFile:
    return SimpleUploadedFile(name, jpeg_bytes(size), content_type="image/jpeg")
```

`backend/tests/core/test_images.py`:
```python
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image

from apps.core.images import build_renditions, image_payload
from tests.helpers import jpeg_bytes


def _store(name, size):
    return default_storage.save(name, ContentFile(jpeg_bytes(size)))


def test_renditions_never_upscale_and_include_the_source_width():
    name = _store("t/playground.jpg", (626, 408))

    renditions = build_renditions(name)

    assert [(r["width"], r["height"]) for r in renditions] == [(480, 313), (626, 408)]
    for rendition in renditions:
        assert rendition["name"].endswith(".webp")
        with default_storage.open(rendition["name"], "rb") as handle:
            assert Image.open(handle).format == "WEBP"


def test_large_images_get_all_three_widths():
    name = _store("t/big.jpg", (2400, 1200))

    renditions = build_renditions(name)

    assert [(r["width"], r["height"]) for r in renditions] == [(480, 240), (960, 480), (1600, 800)]


def test_tiny_images_get_one_rendition_at_their_own_width():
    name = _store("t/tiny.jpg", (235, 141))

    renditions = build_renditions(name)

    assert [(r["width"], r["height"]) for r in renditions] == [(235, 141)]


def test_rebuilding_replaces_old_renditions_instead_of_duplicating():
    name = _store("t/again.jpg", (900, 600))

    first = build_renditions(name)
    second = build_renditions(name)

    assert [r["name"] for r in first] == [r["name"] for r in second]


def test_image_payload_builds_a_srcset_from_the_renditions():
    renditions = [
        {"width": 480, "height": 240, "name": "a-480w.webp"},
        {"width": 960, "height": 480, "name": "a-960w.webp"},
    ]

    assert image_payload(renditions, "Children reading") == {
        "src": "/media/a-960w.webp",
        "srcset": "/media/a-480w.webp 480w, /media/a-960w.webp 960w",
        "width": 960,
        "height": 480,
        "alt": "Children reading",
    }


def test_image_payload_is_none_without_renditions():
    assert image_payload([], "anything") is None
```

Run: `.venv/Scripts/python -m pytest tests/core/test_images.py`
Expected: FAIL — `No module named 'apps.core.images'`.

- [ ] **Step 2: Implement renditions**

`backend/apps/core/images.py`:
```python
"""Responsive WebP renditions for uploaded photos (spec §2.3)."""

from io import BytesIO

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image, ImageOps

RENDITION_WIDTHS = (480, 960, 1600)
WEBP_QUALITY = 78


def _target_widths(source_width: int) -> list[int]:
    widths = {width for width in RENDITION_WIDTHS if width < source_width}
    widths.add(min(source_width, RENDITION_WIDTHS[-1]))
    return sorted(widths)


def build_renditions(source_name: str) -> list[dict]:
    with default_storage.open(source_name, "rb") as handle:
        image = ImageOps.exif_transpose(Image.open(handle))
        image.load()
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGB")

    source_width, source_height = image.size
    stem = source_name.rsplit(".", 1)[0]
    renditions = []
    for width in _target_widths(source_width):
        height = round(source_height * width / source_width)
        resized = (
            image
            if width == source_width
            else image.resize((width, height), Image.Resampling.LANCZOS)
        )
        buffer = BytesIO()
        resized.save(buffer, "WEBP", quality=WEBP_QUALITY, method=6)
        name = f"{stem}-{width}w.webp"
        if default_storage.exists(name):
            default_storage.delete(name)
        saved_name = default_storage.save(name, ContentFile(buffer.getvalue()))
        renditions.append({"width": width, "height": height, "name": saved_name})
    return renditions


def image_payload(renditions: list[dict], alt: str) -> dict | None:
    if not renditions:
        return None
    largest = renditions[-1]
    return {
        "src": default_storage.url(largest["name"]),
        "srcset": ", ".join(f"{default_storage.url(r['name'])} {r['width']}w" for r in renditions),
        "width": largest["width"],
        "height": largest["height"],
        "alt": alt,
    }
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `.venv/Scripts/python -m pytest`
Expected: all pass. (626×408 → 480 wide is 313 high: `round(408*480/626) = 313`.)

- [ ] **Step 4: Commit**

```bash
git add backend
git commit -m "Generate responsive WebP renditions for photos"
```

---

## Task 4: Ghana phone numbers

**Files:**
- Create: `backend/apps/core/phones.py`
- Test: `backend/tests/core/test_phones.py`

**Interfaces:**
- Produces:
  - `normalise_gh_phone(raw: str, *, mobile_only: bool = True) -> str` — returns E.164 (`+233…`), raises `ValueError` with a user-facing message otherwise.
  - `format_gh_local(e164: str) -> str` — `"054 587 5881"`.
  - `whatsapp_link(e164: str) -> str` — `"https://wa.me/233545875881"`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/core/test_phones.py`:
```python
import pytest

from apps.core.phones import format_gh_local, normalise_gh_phone, whatsapp_link


@pytest.mark.parametrize(
    "raw",
    [
        "0545875881",
        "054 587 5881",
        "054-587-5881",
        "+233545875881",
        "+233 54 587 5881",
        "233545875881",
    ],
)
def test_accepts_common_ghana_mobile_formats(raw):
    assert normalise_gh_phone(raw) == "+233545875881"


@pytest.mark.parametrize(
    "raw", ["", "   ", "12345", "05458758811", "+447700900123", "not a number", "0302123456"]
)
def test_rejects_invalid_foreign_or_landline_numbers_for_mobiles(raw):
    with pytest.raises(ValueError, match="Ghana"):
        normalise_gh_phone(raw)


def test_landlines_are_allowed_when_not_mobile_only():
    assert normalise_gh_phone("030 212 3456", mobile_only=False) == "+233302123456"


def test_formats_numbers_for_display():
    assert format_gh_local("+233545875881") == "054 587 5881"


def test_builds_whatsapp_links():
    assert whatsapp_link("+233545875881") == "https://wa.me/233545875881"
```

Run: `.venv/Scripts/python -m pytest tests/core/test_phones.py`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement**

`backend/apps/core/phones.py`:
```python
"""Ghana phone numbers: stored as E.164 (+233…), shown as 054 587 5881 (spec §3.4)."""

import phonenumbers
from phonenumbers import NumberParseException, PhoneNumberFormat, PhoneNumberType

MOBILE_TYPES = {PhoneNumberType.MOBILE, PhoneNumberType.FIXED_LINE_OR_MOBILE}
MOBILE_MESSAGE = "Enter a Ghana mobile number, e.g. 024 123 4567."
ANY_MESSAGE = "Enter a valid Ghana phone number, e.g. 024 123 4567."


def normalise_gh_phone(raw: str, *, mobile_only: bool = True) -> str:
    message = MOBILE_MESSAGE if mobile_only else ANY_MESSAGE
    try:
        number = phonenumbers.parse((raw or "").strip(), "GH")
    except NumberParseException as exc:
        raise ValueError(message) from exc
    if number.country_code != 233 or not phonenumbers.is_valid_number(number):
        raise ValueError(message)
    if mobile_only and phonenumbers.number_type(number) not in MOBILE_TYPES:
        raise ValueError(message)
    return phonenumbers.format_number(number, PhoneNumberFormat.E164)


def format_gh_local(e164: str) -> str:
    return phonenumbers.format_number(phonenumbers.parse(e164, "GH"), PhoneNumberFormat.NATIONAL)


def whatsapp_link(e164: str) -> str:
    return f"https://wa.me/{e164.lstrip('+')}"
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `.venv/Scripts/python -m pytest`
Expected: all pass. If `format_gh_local` returns a different spacing than `054 587 5881`, keep the test's expectation and post-process the NATIONAL format: `digits = re.sub(r"\D", "", national)` → `f"{digits[:3]} {digits[3:6]} {digits[6:]}"`.

- [ ] **Step 4: Commit**

```bash
git add backend
git commit -m "Validate and format Ghana phone numbers"
```

---

## Task 5: School profile and privacy notice

**Files:**
- Create: `backend/apps/school/__init__.py`, `apps.py`, `models.py`, `admin.py`, `migrations/__init__.py`
- Create: `backend/apps/consent/__init__.py`, `apps.py`, `models.py`, `admin.py`, `migrations/__init__.py`
- Modify: `backend/config/settings.py` (`INSTALLED_APPS`)
- Test: `backend/tests/school/__init__.py`, `test_profile.py`; `backend/tests/consent/__init__.py`, `test_privacy_notice.py`

**Interfaces:**
- Produces:
  - `SchoolProfile` (single row, pk=1): fields `name, motto, founded_year, address, town, region, ghana_post_gps, phone, whatsapp, email, map_query`; `SchoolProfile.load() -> SchoolProfile | None`; `.years_since_founding(today: date | None = None) -> int`. `clean()` normalises `phone` (any GH number) and `whatsapp` (mobile only).
  - `PrivacyNotice`: fields `version, title, body, effective_from, is_draft`; `PrivacyNotice.current(today: date | None = None) -> PrivacyNotice | None`.
  - `apps.consent.models.FORMAT_HELP` — the help text describing the plain-text format (reused by website models).

- [ ] **Step 1: Write the failing tests**

`backend/tests/school/__init__.py`, `backend/tests/consent/__init__.py`: empty files.

`backend/tests/school/test_profile.py`:
```python
from datetime import date

import pytest
from django.core.exceptions import ValidationError

from apps.school.models import SchoolProfile

pytestmark = pytest.mark.django_db


def make_profile(**overrides):
    data = {
        "name": "AD Smart School",
        "founded_year": 2001,
        "town": "Kronom, Kumasi",
        "region": "Ashanti",
        "phone": "+233545875881",
        "email": "school@example.com",
    }
    data.update(overrides)
    return SchoolProfile(**data)


def test_load_is_none_before_setup():
    assert SchoolProfile.load() is None


def test_the_profile_is_always_a_single_row():
    make_profile().save()
    make_profile(name="AD Smart School (renamed)").save()

    assert SchoolProfile.objects.count() == 1
    assert SchoolProfile.load().name == "AD Smart School (renamed)"


def test_years_since_founding():
    assert make_profile().years_since_founding(date(2026, 10, 9)) == 25


def test_clean_normalises_phone_numbers():
    profile = make_profile(phone="030 212 3456", whatsapp="054 587 5881")

    profile.full_clean()

    assert profile.phone == "+233302123456"
    assert profile.whatsapp == "+233545875881"


def test_clean_rejects_a_landline_for_whatsapp():
    with pytest.raises(ValidationError) as error:
        make_profile(whatsapp="030 212 3456").full_clean()

    assert "whatsapp" in error.value.message_dict
```

`backend/tests/consent/test_privacy_notice.py`:
```python
from datetime import date

import pytest

from apps.consent.models import PrivacyNotice

pytestmark = pytest.mark.django_db


def test_current_is_the_latest_notice_already_in_effect():
    PrivacyNotice.objects.create(version="1", body="Old.", effective_from=date(2026, 1, 1))
    PrivacyNotice.objects.create(version="2", body="Current.", effective_from=date(2026, 9, 1))
    PrivacyNotice.objects.create(version="3", body="Future.", effective_from=date(2027, 1, 1))

    assert PrivacyNotice.current(date(2026, 10, 9)).version == "2"


def test_current_is_none_when_nothing_is_in_effect():
    PrivacyNotice.objects.create(version="1", body="Future.", effective_from=date(2027, 1, 1))

    assert PrivacyNotice.current(date(2026, 10, 9)) is None


def test_new_notices_start_as_drafts():
    notice = PrivacyNotice.objects.create(version="1", body="x", effective_from=date(2026, 1, 1))

    assert notice.is_draft is True
```

Run: `.venv/Scripts/python -m pytest tests/school tests/consent`
Expected: FAIL — modules not found.

- [ ] **Step 2: Implement the `school` app**

`backend/apps/school/__init__.py`, `backend/apps/school/migrations/__init__.py`: empty files.

`backend/apps/school/apps.py`:
```python
from django.apps import AppConfig


class SchoolConfig(AppConfig):
    name = "apps.school"
    label = "school"
```

`backend/apps/school/models.py`:
```python
from datetime import date

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.core.phones import normalise_gh_phone


class SchoolProfile(models.Model):
    """The school's identity and contact details. There is exactly one row (pk=1)."""

    name = models.CharField(max_length=120)
    motto = models.CharField(max_length=200, blank=True)
    founded_year = models.PositiveSmallIntegerField()
    address = models.CharField(max_length=200, blank=True)
    town = models.CharField(max_length=80)
    region = models.CharField(max_length=80)
    ghana_post_gps = models.CharField("GhanaPost GPS", max_length=20, blank=True)
    phone = models.CharField(max_length=16, help_text="Any Ghana number, stored as +233…")
    whatsapp = models.CharField(max_length=16, blank=True, help_text="A Ghana mobile number")
    email = models.EmailField()
    map_query = models.CharField(
        max_length=200, blank=True, help_text="What the map searches for, e.g. Kronom, Kumasi"
    )

    class Meta:
        verbose_name = "school profile"

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def clean(self):
        errors = {}
        for field, mobile_only in (("phone", False), ("whatsapp", True)):
            value = getattr(self, field)
            if not value:
                continue
            try:
                setattr(self, field, normalise_gh_phone(value, mobile_only=mobile_only))
            except ValueError as exc:
                errors[field] = str(exc)
        if errors:
            raise ValidationError(errors)

    @classmethod
    def load(cls) -> "SchoolProfile | None":
        return cls.objects.filter(pk=1).first()

    def years_since_founding(self, today: date | None = None) -> int:
        return (today or timezone.localdate()).year - self.founded_year
```

`backend/apps/school/admin.py`:
```python
from django.contrib import admin

from apps.school.models import SchoolProfile

admin.site.register(SchoolProfile)
```

- [ ] **Step 3: Implement the `consent` app**

`backend/apps/consent/__init__.py`, `backend/apps/consent/migrations/__init__.py`: empty files.

`backend/apps/consent/apps.py`:
```python
from django.apps import AppConfig


class ConsentConfig(AppConfig):
    name = "apps.consent"
    label = "consent"
```

`backend/apps/consent/models.py`:
```python
from datetime import date

from django.db import models
from django.utils import timezone

FORMAT_HELP = (
    "Separate paragraphs with a blank line. Start a line with '## ' for a heading "
    "or '- ' for a list item."
)


class PrivacyNotice(models.Model):
    """A versioned privacy notice (Data Protection Act 2012, Act 843)."""

    version = models.CharField(max_length=20, unique=True)
    title = models.CharField(max_length=120, default="Privacy notice")
    body = models.TextField(help_text=FORMAT_HELP)
    effective_from = models.DateField()
    is_draft = models.BooleanField(
        default=True,
        help_text="Untick once the wording has been reviewed. Drafts keep the site in preview.",
    )

    class Meta:
        ordering = ["-effective_from", "-id"]

    def __str__(self) -> str:
        return f"{self.title} v{self.version}"

    @classmethod
    def current(cls, today: date | None = None) -> "PrivacyNotice | None":
        return cls.objects.filter(effective_from__lte=today or timezone.localdate()).first()
```

`backend/apps/consent/admin.py`:
```python
from django.contrib import admin

from apps.consent.models import PrivacyNotice

admin.site.register(PrivacyNotice)
```

In `backend/config/settings.py`, extend `INSTALLED_APPS` after `"apps.core",`:
```python
    "apps.school",
    "apps.consent",
```

- [ ] **Step 4: Make migrations and run the tests**

```bash
.venv/Scripts/python manage.py makemigrations school consent
.venv/Scripts/python -m pytest
```
Expected: migrations `0001_initial` created for both apps; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "Add school profile and versioned privacy notice"
```

---

## Task 6: Website content models and the go-live gate

**Files:**
- Create: `backend/apps/core/models.py` (`ImageRenditionsMixin`)
- Create: `backend/apps/website/__init__.py`, `apps.py`, `models.py`, `services.py`, `admin.py`, `migrations/__init__.py`
- Modify: `backend/config/settings.py` (`INSTALLED_APPS`)
- Test: `backend/tests/website/__init__.py`, `conftest.py`, `test_models.py`, `test_publication.py`

**Interfaces:**
- Consumes: `build_renditions` (Task 3), `PrivacyNotice.current()`, `FORMAT_HELP` (Task 5), `SchoolProfile` (Task 5).
- Produces:
  - `ImageRenditionsMixin` (abstract): `renditions` JSON list; set class attr `rendition_source_field`.
  - Models `SiteSettings` (`load()`, `is_live`, `went_live_at`), `ContentBlock(key, text, help_text, needs_review)`, `PhotoSlot(key, image, alt_text, caption, is_placeholder, order, renditions)`, `Fact(label, value, order, visible, display_value(years))`, `FeatureBlock(key, title, text, icon, enabled, order)` with `FeatureBlock.Icon` choices `message|phone|care|shield`, `NewsPost(title, slug, summary, body, cover, cover_alt, status, published_at, renditions)` with `NewsPost.objects.published()`.
  - `apps.website.services.publication_blockers() -> list[str]` and `is_site_public() -> bool`.
  - Test fixtures (in `tests/website/conftest.py`): `school`, `ready_site`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/website/__init__.py`: empty file.

`backend/tests/website/conftest.py`:
```python
from datetime import date

import pytest

from apps.consent.models import PrivacyNotice
from apps.school.models import SchoolProfile
from apps.website.models import ContentBlock, PhotoSlot, SiteSettings
from tests.helpers import jpeg_upload


@pytest.fixture
def school(db):
    profile = SchoolProfile(
        name="AD Smart School",
        founded_year=2001,
        town="Kronom, Kumasi",
        region="Ashanti",
        phone="+233545875881",
        whatsapp="+233545875881",
        email="school@example.com",
        map_query="Kronom, Kumasi, Ghana",
    )
    profile.save()
    return profile


@pytest.fixture
def ready_site(school):
    """Everything reviewed, real and live: the site should be public."""
    ContentBlock.objects.create(key="hero_headline", text="Bright beginnings", needs_review=False)
    PhotoSlot.objects.create(
        key="hero", image=jpeg_upload(), alt_text="Children playing", is_placeholder=False
    )
    PrivacyNotice.objects.create(
        version="1", body="We protect your data.", effective_from=date(2026, 1, 1), is_draft=False
    )
    SiteSettings.objects.update_or_create(pk=1, defaults={"is_live": True})
    return school
```

`backend/tests/website/test_models.py`:
```python
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.website.models import Fact, NewsPost, PhotoSlot
from tests.helpers import jpeg_upload

pytestmark = pytest.mark.django_db


def test_photo_slot_builds_renditions_when_created():
    slot = PhotoSlot.objects.create(key="hero", image=jpeg_upload(size=(1200, 800)), alt_text="x")

    slot.refresh_from_db()
    assert [r["width"] for r in slot.renditions] == [480, 960, 1200]


def test_photo_slot_rebuilds_only_when_the_image_changes(monkeypatch):
    slot = PhotoSlot.objects.create(key="hero", image=jpeg_upload(), alt_text="x")
    calls = []
    monkeypatch.setattr("apps.core.models.build_renditions", lambda name: calls.append(name) or [])

    slot.alt_text = "Better alt text"
    slot.save()
    assert calls == []

    slot.image = jpeg_upload(name="replacement.jpg")
    slot.save()
    assert len(calls) == 1


def test_news_cover_is_optional_and_has_no_renditions_without_it():
    post = NewsPost.objects.create(title="Hello", slug="hello", summary="s", body="b")

    assert post.renditions == []


def test_published_news_excludes_drafts_and_future_posts():
    now = timezone.now()
    NewsPost.objects.create(
        title="Live",
        slug="live",
        summary="s",
        body="b",
        status=NewsPost.Status.PUBLISHED,
        published_at=now - timedelta(hours=1),
    )
    NewsPost.objects.create(title="Draft", slug="draft", summary="s", body="b")
    NewsPost.objects.create(
        title="Later",
        slug="later",
        summary="s",
        body="b",
        status=NewsPost.Status.PUBLISHED,
        published_at=now + timedelta(days=1),
    )

    assert [p.slug for p in NewsPost.objects.published()] == ["live"]


def test_fact_values_can_show_years_since_founding():
    fact = Fact(label="years serving Kronom", value="{years}")

    assert fact.display_value(25) == "25"
```

`backend/tests/website/test_publication.py`:
```python
import pytest

from apps.consent.models import PrivacyNotice
from apps.website.models import ContentBlock, PhotoSlot, SiteSettings
from apps.website.services import is_site_public, publication_blockers

pytestmark = pytest.mark.django_db


def test_a_new_site_is_not_public(school):
    assert is_site_public() is False
    assert "The site has not been marked live" in publication_blockers()
    assert "The privacy notice has not been reviewed" in publication_blockers()


def test_the_site_is_public_when_everything_is_ready(ready_site):
    assert publication_blockers() == []
    assert is_site_public() is True


@pytest.mark.parametrize("spoiler", ["placeholder_photo", "draft_text", "draft_notice", "not_live"])
def test_each_blocker_keeps_the_site_in_preview(ready_site, spoiler):
    if spoiler == "placeholder_photo":
        PhotoSlot.objects.update(is_placeholder=True)
    elif spoiler == "draft_text":
        ContentBlock.objects.update(needs_review=True)
    elif spoiler == "draft_notice":
        PrivacyNotice.objects.update(is_draft=True)
    else:
        SiteSettings.objects.update(is_live=False)

    assert is_site_public() is False
    assert len(publication_blockers()) == 1
```

Run: `.venv/Scripts/python -m pytest tests/website`
Expected: FAIL — `apps.website` not found.

- [ ] **Step 2: Implement the renditions mixin**

`backend/apps/core/models.py`:
```python
from django.db import models

from apps.core.images import build_renditions


class ImageRenditionsMixin(models.Model):
    """Keeps WebP renditions of one image field in step with that field.

    Renditions are rebuilt whenever the stored file changes and cleared when the
    file is removed. Set ``rendition_source_field`` to the image field's name.
    """

    rendition_source_field = "image"
    renditions = models.JSONField(default=list, blank=True, editable=False)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        name_before_save = self._source_name()
        changed = bool(name_before_save) and (
            self._state.adding or name_before_save != self._rendered_name
        )
        cleared = not name_before_save and bool(self._rendered_name)
        super().save(*args, **kwargs)
        if changed or cleared:
            self.renditions = build_renditions(self._source_name()) if changed else []
            type(self).objects.filter(pk=self.pk).update(renditions=self.renditions)
        self._rendered_name = self._source_name()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._rendered_name = self._source_name()

    def _source_name(self) -> str | None:
        field_file = getattr(self, self.rendition_source_field)
        return field_file.name if field_file else None
```

- [ ] **Step 3: Implement the website models**

`backend/apps/website/__init__.py`, `backend/apps/website/migrations/__init__.py`: empty files.

`backend/apps/website/apps.py`:
```python
from django.apps import AppConfig


class WebsiteConfig(AppConfig):
    name = "apps.website"
    label = "website"
```

`backend/apps/website/models.py`:
```python
from django.db import models
from django.utils import timezone

from apps.consent.models import FORMAT_HELP
from apps.core.models import ImageRenditionsMixin


class SiteSettings(models.Model):
    """Whether the public website is live. There is exactly one row (pk=1)."""

    is_live = models.BooleanField(default=False)
    went_live_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = verbose_name_plural = "site settings"

    def __str__(self) -> str:
        return "Live" if self.is_live else "Preview"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "SiteSettings":
        settings_row, _ = cls.objects.get_or_create(pk=1)
        return settings_row


class ContentBlock(models.Model):
    """One editable piece of website text, looked up by key."""

    key = models.SlugField(max_length=60, unique=True)
    text = models.TextField(help_text=FORMAT_HELP)
    help_text = models.CharField(max_length=200, blank=True)
    needs_review = models.BooleanField(
        default=True,
        help_text="Ticked while the text is provisional. The site stays in preview until "
        "every block is reviewed.",
    )

    class Meta:
        ordering = ["key"]

    def __str__(self) -> str:
        return self.key


class PhotoSlot(ImageRenditionsMixin):
    key = models.SlugField(max_length=40, unique=True)
    image = models.ImageField(upload_to="site/photos/")
    alt_text = models.CharField(max_length=200)
    caption = models.CharField(max_length=120, blank=True)
    is_placeholder = models.BooleanField(
        default=True, help_text="Ticked while this is not a real AD Smart School photo."
    )
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "key"]

    def __str__(self) -> str:
        return self.key


class Fact(models.Model):
    YEARS_TOKEN = "{years}"

    label = models.CharField(max_length=80)
    value = models.CharField(max_length=40, help_text="Use {years} for years since founding.")
    order = models.PositiveSmallIntegerField(default=0)
    visible = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return f"{self.value} {self.label}"

    def display_value(self, years: int) -> str:
        return self.value.replace(self.YEARS_TOKEN, str(years))


class FeatureBlock(models.Model):
    """A 'For parents' promise. Off by default: switch on only once the feature is live."""

    class Icon(models.TextChoices):
        MESSAGE = "message", "Message"
        PHONE = "phone", "Phone"
        CARE = "care", "Care"
        SHIELD = "shield", "Shield"

    key = models.SlugField(max_length=40, unique=True)
    title = models.CharField(max_length=80)
    text = models.CharField(max_length=240)
    icon = models.CharField(max_length=20, choices=Icon.choices)
    enabled = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "key"]

    def __str__(self) -> str:
        return self.title


class NewsPostQuerySet(models.QuerySet):
    def published(self):
        return self.filter(status=NewsPost.Status.PUBLISHED, published_at__lte=timezone.now())


class NewsPost(ImageRenditionsMixin):
    rendition_source_field = "cover"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"

    title = models.CharField(max_length=160)
    slug = models.SlugField(max_length=170, unique=True)
    summary = models.CharField(max_length=240)
    body = models.TextField(help_text=FORMAT_HELP)
    cover = models.ImageField(upload_to="site/news/", blank=True)
    cover_alt = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)

    objects = NewsPostQuerySet.as_manager()

    class Meta:
        ordering = ["-published_at", "-id"]

    def __str__(self) -> str:
        return self.title
```

`backend/apps/website/services.py`:
```python
"""Website rules that span several models."""

from apps.consent.models import PrivacyNotice
from apps.website.models import ContentBlock, PhotoSlot, SiteSettings


def publication_blockers() -> list[str]:
    """Everything still keeping the site in preview (spec §6.5). Empty means public."""
    blockers = []
    placeholders = PhotoSlot.objects.filter(is_placeholder=True).count()
    if placeholders:
        blockers.append(f"{placeholders} photo slot(s) still use placeholder photos")
    provisional = ContentBlock.objects.filter(needs_review=True).count()
    if provisional:
        blockers.append(f"{provisional} text block(s) still need review")
    notice = PrivacyNotice.current()
    if notice is None or notice.is_draft:
        blockers.append("The privacy notice has not been reviewed")
    if not SiteSettings.load().is_live:
        blockers.append("The site has not been marked live")
    return blockers


def is_site_public() -> bool:
    return not publication_blockers()
```

`backend/apps/website/admin.py`:
```python
from django.contrib import admin

from apps.website.models import ContentBlock, Fact, FeatureBlock, NewsPost, PhotoSlot, SiteSettings


@admin.register(ContentBlock)
class ContentBlockAdmin(admin.ModelAdmin):
    list_display = ["key", "needs_review", "help_text"]
    list_filter = ["needs_review"]
    search_fields = ["key", "text"]


@admin.register(PhotoSlot)
class PhotoSlotAdmin(admin.ModelAdmin):
    list_display = ["key", "caption", "is_placeholder", "order"]
    list_filter = ["is_placeholder"]


@admin.register(NewsPost)
class NewsPostAdmin(admin.ModelAdmin):
    list_display = ["title", "status", "published_at"]
    prepopulated_fields = {"slug": ["title"]}


admin.site.register(SiteSettings)
admin.site.register(Fact)
admin.site.register(FeatureBlock)
```

In `backend/config/settings.py`, extend `INSTALLED_APPS` after `"apps.consent",`:
```python
    "apps.website",
```

- [ ] **Step 4: Make migrations and run the tests**

```bash
.venv/Scripts/python manage.py makemigrations website
.venv/Scripts/python -m pytest
```
Expected: `website/migrations/0001_initial.py` created; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "Add website content models and the go-live gate"
```

---

## Task 7: Public content API

**Files:**
- Modify: `backend/apps/website/services.py` (add `build_site_payload`, `news_summary`)
- Create: `backend/apps/website/views.py`, `backend/apps/website/urls.py`
- Modify: `backend/config/urls.py`
- Test: `backend/tests/website/test_public_api.py`

**Interfaces:**
- Consumes: `image_payload` (Task 3), `format_gh_local`, `whatsapp_link` (Task 4), `ApiError` (Task 2), models from Tasks 5–6.
- Produces (all `AllowAny`, no authentication, under `/api/public/`):
  - `GET site` → `{"school": {...}, "is_public": bool, "content": {key: text}, "facts": [{"label","value"}], "features": [{"key","title","text","icon"}], "photos": {key: Photo|None}, "gallery": [Photo]}` where `Photo = {"src","srcset","width","height","alt","caption","is_placeholder"}`; `photos` holds every non-`gallery_*` slot; `gallery` holds `gallery_*` slots in `order`. `school` = `{"name","motto","founded_year","years_since_founding","address","town","region","ghana_post_gps","phone","phone_display","whatsapp_link","email","map_query"}`. `503 not_configured` when there is no `SchoolProfile`.
  - `GET news?limit=N` (1–50, default 20) → `[{"title","slug","summary","published_at","cover"}]`.
  - `GET news/<slug>` → summary fields + `"body"`; `404 not_found` unless published.
  - `GET privacy-notice` → `{"version","title","body","effective_from","is_draft"}`; `404` when none is in effect.
  - `apps.website.views.PublicView` — base `APIView` with `authentication_classes = []`, `permission_classes = [AllowAny]`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/website/test_public_api.py`:
```python
from datetime import date, timedelta

import pytest
from django.utils import timezone

from apps.consent.models import PrivacyNotice
from apps.website.models import ContentBlock, Fact, FeatureBlock, NewsPost, PhotoSlot
from tests.helpers import jpeg_upload

pytestmark = pytest.mark.django_db


def test_site_payload_describes_the_school(api, school):
    ContentBlock.objects.create(key="hero_headline", text="Bright beginnings")
    Fact.objects.create(label="years serving Kronom", value="{years}", order=1)
    Fact.objects.create(label="hidden", value="x", visible=False)
    FeatureBlock.objects.create(key="sms", title="SMS", text="t", icon="message", enabled=True)
    FeatureBlock.objects.create(key="momo", title="MoMo", text="t", icon="phone")
    years = timezone.localdate().year - 2001

    body = api.get("/api/public/site").json()

    assert body["school"]["name"] == "AD Smart School"
    assert body["school"]["phone_display"] == "054 587 5881"
    assert body["school"]["whatsapp_link"] == "https://wa.me/233545875881"
    assert body["school"]["years_since_founding"] == years
    assert body["content"] == {"hero_headline": "Bright beginnings"}
    assert body["facts"] == [{"label": "years serving Kronom", "value": str(years)}]
    assert [f["key"] for f in body["features"]] == ["sms"]
    assert body["is_public"] is False


def test_site_payload_splits_gallery_photos_from_named_slots(api, school):
    PhotoSlot.objects.create(key="hero", image=jpeg_upload(), alt_text="Hero", order=0)
    PhotoSlot.objects.create(
        key="gallery_02", image=jpeg_upload(), alt_text="B", caption="Two", order=2
    )
    PhotoSlot.objects.create(
        key="gallery_01", image=jpeg_upload(), alt_text="A", caption="One", order=1
    )

    body = api.get("/api/public/site").json()

    assert set(body["photos"]) == {"hero"}
    assert body["photos"]["hero"]["alt"] == "Hero"
    assert body["photos"]["hero"]["src"].startswith("/media/site/photos/")
    assert body["photos"]["hero"]["is_placeholder"] is True
    assert [p["caption"] for p in body["gallery"]] == ["One", "Two"]


def test_site_payload_with_no_photos(api, school):
    body = api.get("/api/public/site").json()

    assert body["photos"] == {}
    assert body["gallery"] == []


def test_site_returns_503_before_the_school_is_set_up(api, db):
    response = api.get("/api/public/site")

    assert response.status_code == 503
    assert response.json()["code"] == "not_configured"


def _post(slug, *, published=True, hours_ago=1):
    return NewsPost.objects.create(
        title=slug.title(),
        slug=slug,
        summary=f"About {slug}",
        body=f"Body of {slug}",
        status=NewsPost.Status.PUBLISHED if published else NewsPost.Status.DRAFT,
        published_at=timezone.now() - timedelta(hours=hours_ago),
    )


def test_news_lists_published_posts_newest_first_with_a_limit(api, db):
    _post("older", hours_ago=5)
    _post("newer", hours_ago=1)
    _post("draft", published=False)

    body = api.get("/api/public/news?limit=1").json()

    assert [p["slug"] for p in body] == ["newer"]
    assert body[0]["cover"] is None
    assert "body" not in body[0]


def test_news_limit_falls_back_on_nonsense(api, db):
    _post("only")

    assert len(api.get("/api/public/news?limit=abc").json()) == 1


def test_news_detail_includes_the_body(api, db):
    _post("hello")

    body = api.get("/api/public/news/hello").json()

    assert body["body"] == "Body of hello"


def test_draft_news_is_not_found(api, db):
    _post("secret", published=False)

    response = api.get("/api/public/news/secret")

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_privacy_notice_returns_the_current_version(api, db):
    PrivacyNotice.objects.create(version="2026-1", body="Text", effective_from=date(2026, 1, 1))

    body = api.get("/api/public/privacy-notice").json()

    assert body == {
        "version": "2026-1",
        "title": "Privacy notice",
        "body": "Text",
        "effective_from": "2026-01-01",
        "is_draft": True,
    }


def test_privacy_notice_404_when_none_is_in_effect(api, db):
    assert api.get("/api/public/privacy-notice").status_code == 404
```

Run: `.venv/Scripts/python -m pytest tests/website/test_public_api.py`
Expected: FAIL — 404s for every route.

- [ ] **Step 2: Add the payload builders**

Replace `backend/apps/website/services.py` with:
```python
"""Website rules that span several models."""

from apps.consent.models import PrivacyNotice
from apps.core.exceptions import ApiError
from apps.core.images import image_payload
from apps.core.phones import format_gh_local, whatsapp_link
from apps.school.models import SchoolProfile
from apps.website.models import ContentBlock, Fact, FeatureBlock, NewsPost, PhotoSlot, SiteSettings


def publication_blockers() -> list[str]:
    """Everything still keeping the site in preview (spec §6.5). Empty means public."""
    blockers = []
    placeholders = PhotoSlot.objects.filter(is_placeholder=True).count()
    if placeholders:
        blockers.append(f"{placeholders} photo slot(s) still use placeholder photos")
    provisional = ContentBlock.objects.filter(needs_review=True).count()
    if provisional:
        blockers.append(f"{provisional} text block(s) still need review")
    notice = PrivacyNotice.current()
    if notice is None or notice.is_draft:
        blockers.append("The privacy notice has not been reviewed")
    if not SiteSettings.load().is_live:
        blockers.append("The site has not been marked live")
    return blockers


def is_site_public() -> bool:
    return not publication_blockers()


def _photo(slot: PhotoSlot) -> dict | None:
    payload = image_payload(slot.renditions, slot.alt_text)
    if payload is None:
        return None
    return {**payload, "caption": slot.caption, "is_placeholder": slot.is_placeholder}


def build_site_payload() -> dict:
    school = SchoolProfile.load()
    if school is None:
        raise ApiError("not_configured", "The school profile has not been set up yet.", 503)
    years = school.years_since_founding()
    slots = list(PhotoSlot.objects.all())
    return {
        "school": {
            "name": school.name,
            "motto": school.motto,
            "founded_year": school.founded_year,
            "years_since_founding": years,
            "address": school.address,
            "town": school.town,
            "region": school.region,
            "ghana_post_gps": school.ghana_post_gps,
            "phone": school.phone,
            "phone_display": format_gh_local(school.phone),
            "whatsapp_link": whatsapp_link(school.whatsapp) if school.whatsapp else "",
            "email": school.email,
            "map_query": school.map_query,
        },
        "is_public": is_site_public(),
        "content": {block.key: block.text for block in ContentBlock.objects.all()},
        "facts": [
            {"label": fact.label, "value": fact.display_value(years)}
            for fact in Fact.objects.filter(visible=True)
        ],
        "features": [
            {"key": f.key, "title": f.title, "text": f.text, "icon": f.icon}
            for f in FeatureBlock.objects.filter(enabled=True)
        ],
        "photos": {s.key: _photo(s) for s in slots if not s.key.startswith("gallery_")},
        "gallery": [
            photo for s in slots if s.key.startswith("gallery_") and (photo := _photo(s))
        ],
    }


def news_summary(post: NewsPost) -> dict:
    return {
        "title": post.title,
        "slug": post.slug,
        "summary": post.summary,
        "published_at": post.published_at.isoformat(),
        "cover": image_payload(post.renditions, post.cover_alt),
    }
```

- [ ] **Step 3: Add the views and routes**

`backend/apps/website/views.py`:
```python
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.consent.models import PrivacyNotice
from apps.website.models import NewsPost
from apps.website.services import build_site_payload, news_summary

DEFAULT_NEWS_LIMIT = 20
MAX_NEWS_LIMIT = 50


class PublicView(APIView):
    """Anonymous endpoints for the public website."""

    authentication_classes = []
    permission_classes = [AllowAny]


class SiteView(PublicView):
    def get(self, request):
        return Response(build_site_payload())


class NewsListView(PublicView):
    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", DEFAULT_NEWS_LIMIT))
        except ValueError:
            limit = DEFAULT_NEWS_LIMIT
        limit = max(1, min(limit, MAX_NEWS_LIMIT))
        return Response([news_summary(post) for post in NewsPost.objects.published()[:limit]])


class NewsDetailView(PublicView):
    def get(self, request, slug):
        post = get_object_or_404(NewsPost.objects.published(), slug=slug)
        return Response({**news_summary(post), "body": post.body})


class PrivacyNoticeView(PublicView):
    def get(self, request):
        notice = PrivacyNotice.current()
        if notice is None:
            raise NotFound("No privacy notice has been published yet.")
        return Response(
            {
                "version": notice.version,
                "title": notice.title,
                "body": notice.body,
                "effective_from": notice.effective_from.isoformat(),
                "is_draft": notice.is_draft,
            }
        )
```

`backend/apps/website/urls.py`:
```python
from django.urls import path

from apps.website import views

urlpatterns = [
    path("site", views.SiteView.as_view(), name="public-site"),
    path("news", views.NewsListView.as_view(), name="public-news"),
    path("news/<slug:slug>", views.NewsDetailView.as_view(), name="public-news-detail"),
    path("privacy-notice", views.PrivacyNoticeView.as_view(), name="public-privacy-notice"),
]
```

Replace `backend/config/urls.py` with:
```python
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from apps.core.views import health

urlpatterns = [
    path("api/health", health, name="health"),
    path("api/public/", include("apps.website.urls")),
]

if settings.DEBUG:
    # Development only: Django admin and media files. Production edits content in the
    # portal (Plan 4) and serves media through Caddy (Plan 5).
    urlpatterns += [path("django-admin/", admin.site.urls)]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/Scripts/python -m pytest`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "Serve website content, news and privacy notice from the public API"
```

---

## Task 8: Admissions enquiries

**Files:**
- Modify: `backend/apps/website/models.py` (add `Enquiry`), `backend/apps/website/admin.py`
- Create: `backend/apps/website/enquiries.py`, `backend/apps/website/serializers.py`
- Modify: `backend/apps/website/views.py`, `backend/apps/website/urls.py`, `backend/config/settings.py`
- Test: `backend/tests/website/test_enquiries.py`

**Interfaces:**
- Consumes: `ApiError` (Task 2), `normalise_gh_phone`, `format_gh_local` (Task 4), `SchoolProfile` (Task 5), `PublicView` (Task 7).
- Produces:
  - `Enquiry` model with `Enquiry.Level` values `creche, nursery, kg, lower_primary, upper_primary, jhs` and `Enquiry.Status` values `new, contacted, visited, enrolled, closed`.
  - `GET /api/public/enquiries/form-token` → `{"token": str}` (throttle 60/hour/IP).
  - `POST /api/public/enquiries` with JSON `{parent_name, phone, email?, child_name, child_date_of_birth (YYYY-MM-DD), level_wanted, preferred_visit_date (YYYY-MM-DD|null), message?, data_consent: true, form_token, website (honeypot, must be empty)}` → `201 {"status": "received"}`. Errors: `400 validation_error` (per field), `400 form_expired`, `400 too_fast` (< 3 s after the token was issued), `429 too_many_enquiries` (≥ 3 from one phone in 24 h), `429 throttled` (> 30/hour/IP). A filled honeypot returns `201` and stores nothing.
  - `apps.website.enquiries.issue_form_token(now: float | None = None) -> str`; module constant `FORM_TOKEN_MAX_AGE`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/website/test_enquiries.py`:
```python
import time
from datetime import timedelta

import pytest
from django.core import mail
from django.utils import timezone

from apps.website import enquiries
from apps.website.enquiries import issue_form_token
from apps.website.models import Enquiry

pytestmark = pytest.mark.django_db
URL = "/api/public/enquiries"


@pytest.fixture
def payload():
    today = timezone.localdate()
    return {
        "parent_name": "Akua Mensah",
        "phone": "024 123 4567",
        "email": "akua@example.com",
        "child_name": "Ama Mensah",
        "child_date_of_birth": (today - timedelta(days=365 * 6)).isoformat(),
        "level_wanted": "lower_primary",
        "preferred_visit_date": (today + timedelta(days=7)).isoformat(),
        "message": "We live in Kronom.",
        "data_consent": True,
        "form_token": issue_form_token(now=time.time() - 10),
        "website": "",
    }


def test_form_token_endpoint_issues_a_token(api):
    response = api.get("/api/public/enquiries/form-token")

    assert response.status_code == 200
    assert response.json()["token"]


def test_a_valid_enquiry_is_saved_and_emailed_to_the_school(api, school, payload):
    response = api.post(URL, payload, format="json")

    assert response.status_code == 201
    assert response.json() == {"status": "received"}
    enquiry = Enquiry.objects.get()
    assert enquiry.phone == "+233241234567"
    assert enquiry.status == Enquiry.Status.NEW
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["school@example.com"]
    assert mail.outbox[0].subject == "New admission enquiry: Lower Primary (Basic 1–3)"
    assert "Ama Mensah" in mail.outbox[0].body
    assert "024 123 4567" in mail.outbox[0].body


def test_accepts_ghanaian_letters_in_names(api, school, payload):
    payload["parent_name"] = "Ɛsi Ɔwusu-Ansah"

    assert api.post(URL, payload, format="json").status_code == 201
    assert Enquiry.objects.get().parent_name == "Ɛsi Ɔwusu-Ansah"
    assert "Ɛsi Ɔwusu-Ansah" in mail.outbox[0].body


def test_optional_fields_can_be_left_empty(api, school, payload):
    payload.update(email="", message="", preferred_visit_date=None)

    assert api.post(URL, payload, format="json").status_code == 201


def test_a_filled_honeypot_pretends_success_but_stores_nothing(api, school, payload):
    payload["website"] = "http://spam.example"

    response = api.post(URL, payload, format="json")

    assert response.status_code == 201
    assert Enquiry.objects.count() == 0
    assert mail.outbox == []


def test_submitting_too_fast_is_refused(api, school, payload):
    payload["form_token"] = issue_form_token()

    response = api.post(URL, payload, format="json")

    assert response.status_code == 400
    assert response.json()["code"] == "too_fast"
    assert Enquiry.objects.count() == 0


def test_a_tampered_token_is_refused(api, school, payload):
    payload["form_token"] = "not-a-real-token"

    assert api.post(URL, payload, format="json").json()["code"] == "form_expired"


def test_an_expired_token_is_refused(api, school, payload, monkeypatch):
    monkeypatch.setattr(enquiries, "FORM_TOKEN_MAX_AGE", -1)

    assert api.post(URL, payload, format="json").json()["code"] == "form_expired"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("phone", "0302123456"),
        ("child_date_of_birth", (timezone.localdate() + timedelta(days=1)).isoformat()),
        ("child_date_of_birth", (timezone.localdate() - timedelta(days=365 * 19)).isoformat()),
        ("preferred_visit_date", (timezone.localdate() - timedelta(days=1)).isoformat()),
        ("preferred_visit_date", (timezone.localdate() + timedelta(days=200)).isoformat()),
        ("level_wanted", "university"),
        ("data_consent", False),
        ("parent_name", " "),
        ("message", "x" * 1001),
    ],
)
def test_invalid_fields_are_reported_by_name(api, school, payload, field, value):
    payload[field] = value

    response = api.post(URL, payload, format="json")

    assert response.status_code == 400
    assert response.json()["code"] == "validation_error"
    assert field in response.json()["fields"]


def test_fourth_enquiry_from_same_phone_in_a_day_is_refused(api, school, payload):
    for _ in range(3):
        assert api.post(URL, payload, format="json").status_code == 201

    response = api.post(URL, payload, format="json")

    assert response.status_code == 429
    assert response.json()["code"] == "too_many_enquiries"


def test_ip_throttle_allows_thirty_per_hour(api, school, payload):
    payload["data_consent"] = False  # quick 400s still count towards the throttle
    statuses = [api.post(URL, payload, format="json").status_code for _ in range(31)]

    assert statuses[:30] == [400] * 30
    assert statuses[30] == 429


def test_email_failure_does_not_lose_the_enquiry(api, school, payload, monkeypatch):
    def broken_send_mail(*args, **kwargs):
        raise OSError("SMTP down")

    monkeypatch.setattr(enquiries, "send_mail", broken_send_mail)

    assert api.post(URL, payload, format="json").status_code == 201
    assert Enquiry.objects.count() == 1
```

Run: `.venv/Scripts/python -m pytest tests/website/test_enquiries.py`
Expected: FAIL — `cannot import name 'enquiries'`.

- [ ] **Step 2: Add the `Enquiry` model**

Append to `backend/apps/website/models.py`:
```python
class Enquiry(models.Model):
    """An admissions enquiry from the public website (spec §6.4)."""

    class Level(models.TextChoices):
        CRECHE = "creche", "Crèche"
        NURSERY = "nursery", "Nursery"
        KG = "kg", "Kindergarten (KG)"
        LOWER_PRIMARY = "lower_primary", "Lower Primary (Basic 1–3)"
        UPPER_PRIMARY = "upper_primary", "Upper Primary (Basic 4–6)"
        JHS = "jhs", "Junior High School (JHS)"

    class Status(models.TextChoices):
        NEW = "new", "New"
        CONTACTED = "contacted", "Contacted"
        VISITED = "visited", "Visited"
        ENROLLED = "enrolled", "Enrolled"
        CLOSED = "closed", "Closed"

    parent_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=16)
    email = models.EmailField(blank=True)
    child_name = models.CharField(max_length=120)
    child_date_of_birth = models.DateField()
    level_wanted = models.CharField(max_length=20, choices=Level.choices)
    preferred_visit_date = models.DateField(null=True, blank=True)
    message = models.TextField(max_length=1000, blank=True)
    data_consent = models.BooleanField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.NEW)
    staff_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "enquiries"

    def __str__(self) -> str:
        return f"{self.child_name} ({self.get_level_wanted_display()})"
```

In `backend/apps/website/admin.py`, add `Enquiry` to the model import and append:
```python
@admin.register(Enquiry)
class EnquiryAdmin(admin.ModelAdmin):
    list_display = ["child_name", "level_wanted", "parent_name", "phone", "status", "created_at"]
    list_filter = ["status", "level_wanted"]
```

- [ ] **Step 3: Implement the enquiry rules and serializer**

`backend/apps/website/enquiries.py`:
```python
"""Admissions enquiry rules: form tokens, repeat limits and the school notification."""

import logging
import time
from datetime import timedelta

from django.core import signing
from django.core.mail import send_mail
from django.utils import timezone

from apps.core.exceptions import ApiError
from apps.core.phones import format_gh_local
from apps.school.models import SchoolProfile
from apps.website.models import Enquiry

logger = logging.getLogger(__name__)

FORM_TOKEN_SALT = "website.enquiry-form"
FORM_TOKEN_MAX_AGE = 60 * 60 * 24
MIN_FILL_SECONDS = 3
MAX_PER_PHONE_PER_DAY = 3


def issue_form_token(now: float | None = None) -> str:
    return signing.dumps({"t": time.time() if now is None else now}, salt=FORM_TOKEN_SALT)


def check_form_token(token: str) -> None:
    try:
        data = signing.loads(token, salt=FORM_TOKEN_SALT, max_age=FORM_TOKEN_MAX_AGE)
    except signing.BadSignature as exc:  # includes SignatureExpired
        raise ApiError(
            "form_expired", "This form has expired. Please press Send again.", 400
        ) from exc
    if time.time() - float(data.get("t", 0)) < MIN_FILL_SECONDS:
        raise ApiError(
            "too_fast", "That was quick! Please check your details and press Send again.", 400
        )


def phone_limit_reached(phone_e164: str) -> bool:
    since = timezone.now() - timedelta(days=1)
    recent = Enquiry.objects.filter(phone=phone_e164, created_at__gte=since).count()
    return recent >= MAX_PER_PHONE_PER_DAY


def _format_date(value) -> str:
    return f"{value.day} {value:%B %Y}" if value else "—"


def notify_school(enquiry: Enquiry) -> None:
    school = SchoolProfile.load()
    if school is None or not school.email:
        logger.warning("Enquiry %s saved but no school email is set", enquiry.pk)
        return
    body = "\n".join(
        [
            f"Parent or guardian: {enquiry.parent_name}",
            f"Phone: {format_gh_local(enquiry.phone)}",
            f"Email: {enquiry.email or '—'}",
            f"Child: {enquiry.child_name} (born {_format_date(enquiry.child_date_of_birth)})",
            f"Level wanted: {enquiry.get_level_wanted_display()}",
            f"Preferred visit date: {_format_date(enquiry.preferred_visit_date)}",
            "",
            "Message:",
            enquiry.message or "—",
            "",
            "Follow up from the enquiry inbox.",
        ]
    )
    try:
        send_mail(
            f"New admission enquiry: {enquiry.get_level_wanted_display()}",
            body,
            None,
            [school.email],
        )
    except Exception:
        logger.exception("Could not email the school about enquiry %s", enquiry.pk)
```

`backend/apps/website/serializers.py`:
```python
from datetime import date, timedelta

from django.utils import timezone
from rest_framework import serializers

from apps.core.phones import normalise_gh_phone
from apps.website.models import Enquiry

MAX_CHILD_AGE_YEARS = 18
MAX_VISIT_DAYS_AHEAD = 180


def _years_ago(today: date, years: int) -> date:
    try:
        return today.replace(year=today.year - years)
    except ValueError:  # 29 February
        return today.replace(year=today.year - years, day=28)


class EnquirySerializer(serializers.ModelSerializer):
    data_consent = serializers.BooleanField()

    class Meta:
        model = Enquiry
        fields = [
            "parent_name",
            "phone",
            "email",
            "child_name",
            "child_date_of_birth",
            "level_wanted",
            "preferred_visit_date",
            "message",
            "data_consent",
        ]
        extra_kwargs = {
            "email": {"required": False, "allow_blank": True},
            "message": {"required": False, "allow_blank": True},
            "preferred_visit_date": {"required": False, "allow_null": True},
        }

    def validate_parent_name(self, value: str) -> str:
        if len(value.strip()) < 2:
            raise serializers.ValidationError("Enter your full name.")
        return value.strip()

    def validate_child_name(self, value: str) -> str:
        if len(value.strip()) < 2:
            raise serializers.ValidationError("Enter your child's full name.")
        return value.strip()

    def validate_phone(self, value: str) -> str:
        try:
            return normalise_gh_phone(value, mobile_only=True)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate_child_date_of_birth(self, value: date) -> date:
        today = timezone.localdate()
        if value > today:
            raise serializers.ValidationError("Date of birth can't be in the future.")
        if value < _years_ago(today, MAX_CHILD_AGE_YEARS):
            raise serializers.ValidationError(
                "Please check the date of birth: we teach children up to JHS."
            )
        return value

    def validate_preferred_visit_date(self, value: date | None) -> date | None:
        if value is None:
            return value
        today = timezone.localdate()
        if value < today:
            raise serializers.ValidationError("Choose today or a later date.")
        if value > today + timedelta(days=MAX_VISIT_DAYS_AHEAD):
            raise serializers.ValidationError("Choose a date within the next six months.")
        return value

    def validate_data_consent(self, value: bool) -> bool:
        if value is not True:
            raise serializers.ValidationError(
                "Please agree so we can use these details to reply to you."
            )
        return value
```

Note: `parent_name: " "` fails DRF's own `CharField` (blank not allowed after trimming) before reaching `validate_parent_name` — both produce a `parent_name` field error, which is what the test asserts.

- [ ] **Step 4: Add the views, routes and throttle rates**

Replace `backend/apps/website/views.py` with:
```python
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.consent.models import PrivacyNotice
from apps.core.exceptions import ApiError
from apps.website.enquiries import (
    check_form_token,
    issue_form_token,
    notify_school,
    phone_limit_reached,
)
from apps.website.models import Enquiry, NewsPost
from apps.website.serializers import EnquirySerializer
from apps.website.services import build_site_payload, news_summary

DEFAULT_NEWS_LIMIT = 20
MAX_NEWS_LIMIT = 50


class PublicView(APIView):
    """Anonymous endpoints for the public website."""

    authentication_classes = []
    permission_classes = [AllowAny]


class SiteView(PublicView):
    def get(self, request):
        return Response(build_site_payload())


class NewsListView(PublicView):
    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", DEFAULT_NEWS_LIMIT))
        except ValueError:
            limit = DEFAULT_NEWS_LIMIT
        limit = max(1, min(limit, MAX_NEWS_LIMIT))
        return Response([news_summary(post) for post in NewsPost.objects.published()[:limit]])


class NewsDetailView(PublicView):
    def get(self, request, slug):
        post = get_object_or_404(NewsPost.objects.published(), slug=slug)
        return Response({**news_summary(post), "body": post.body})


class PrivacyNoticeView(PublicView):
    def get(self, request):
        notice = PrivacyNotice.current()
        if notice is None:
            raise NotFound("No privacy notice has been published yet.")
        return Response(
            {
                "version": notice.version,
                "title": notice.title,
                "body": notice.body,
                "effective_from": notice.effective_from.isoformat(),
                "is_draft": notice.is_draft,
            }
        )


class EnquiryIpThrottle(AnonRateThrottle):
    scope = "enquiry_ip"


class EnquiryTokenThrottle(AnonRateThrottle):
    scope = "enquiry_token"


class EnquiryFormTokenView(PublicView):
    throttle_classes = [EnquiryTokenThrottle]

    def get(self, request):
        return Response({"token": issue_form_token()})


class EnquiryCreateView(PublicView):
    throttle_classes = [EnquiryIpThrottle]

    def post(self, request):
        if request.data.get("website"):  # honeypot: pretend success, keep nothing
            return Response({"status": "received"}, status=201)
        check_form_token(str(request.data.get("form_token", "")))
        serializer = EnquirySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if phone_limit_reached(serializer.validated_data["phone"]):
            raise ApiError(
                "too_many_enquiries",
                "We already have your recent enquiries and will call you soon.",
                429,
            )
        enquiry = Enquiry.objects.create(**serializer.validated_data)
        notify_school(enquiry)
        return Response({"status": "received"}, status=201)
```

Add to `backend/apps/website/urls.py` `urlpatterns`:
```python
    path("enquiries/form-token", views.EnquiryFormTokenView.as_view(), name="enquiry-token"),
    path("enquiries", views.EnquiryCreateView.as_view(), name="enquiry-create"),
```

In `backend/config/settings.py`, add inside `REST_FRAMEWORK`:
```python
    # Generous per-IP limits: many Ghanaian mobile users share one public IP (carrier NAT).
    "DEFAULT_THROTTLE_RATES": {"enquiry_ip": "30/hour", "enquiry_token": "60/hour"},
```

- [ ] **Step 5: Migrate and run the tests**

```bash
.venv/Scripts/python manage.py makemigrations website
.venv/Scripts/python -m pytest
```
Expected: migration `0002_enquiry` created; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "Accept admissions enquiries with spam protection and email notice"
```

---

## Task 9: Seed the website content

**Files:**
- Create: `backend/apps/website/seed_data.py`, `backend/apps/website/seeding.py`
- Create: `backend/apps/website/management/__init__.py`, `management/commands/__init__.py`, `management/commands/seed_website.py`
- Test: `backend/tests/website/test_seeding.py`

**Interfaces:**
- Consumes: every model from Tasks 5–8; photos from Task 0.
- Produces: `apps.website.seeding.seed_website() -> int` (rows created; idempotent — never overwrites existing rows); `manage.py seed_website`; `apps.website.seed_data.LEVEL_CODES`.
- Content block keys the frontend relies on (Tasks 15–16): `hero_headline, hero_subline, hero_intro, levels_intro, level_<code>_ages, level_<code>_summary, level_<code>_detail` (codes: `creche, nursery, kg, lower_primary, upper_primary, jhs`), `for_parents_intro, gallery_intro, admissions_cta_heading, admissions_cta_text, about_history, head_teacher_welcome, head_teacher_name, admissions_intro, admissions_steps, admissions_requirements, contact_hours, footer_tagline`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/website/test_seeding.py`:
```python
import pytest

from apps.consent.models import PrivacyNotice
from apps.school.models import SchoolProfile
from apps.website.models import ContentBlock, FeatureBlock, NewsPost, PhotoSlot
from apps.website.seed_data import LEVEL_CODES
from apps.website.seeding import seed_website
from apps.website.services import is_site_public

pytestmark = pytest.mark.django_db


def test_seed_creates_a_complete_preview_site():
    created = seed_website()

    assert created > 0
    assert SchoolProfile.load().phone == "+233545875881"
    assert PhotoSlot.objects.count() == 14
    assert PhotoSlot.objects.filter(is_placeholder=False).count() == 0
    assert all(slot.renditions for slot in PhotoSlot.objects.all())
    assert FeatureBlock.objects.filter(enabled=True).count() == 0
    assert NewsPost.objects.published().count() == 1
    assert PrivacyNotice.current().is_draft is True
    assert is_site_public() is False


def test_seed_provides_every_level_block():
    seed_website()
    keys = set(ContentBlock.objects.values_list("key", flat=True))

    for code in LEVEL_CODES:
        assert {f"level_{code}_ages", f"level_{code}_summary", f"level_{code}_detail"} <= keys


def test_seeding_twice_creates_nothing_new_and_keeps_edits():
    seed_website()
    ContentBlock.objects.filter(key="hero_headline").update(text="Edited by the admin")

    assert seed_website() == 0
    assert ContentBlock.objects.get(key="hero_headline").text == "Edited by the admin"
```

Run: `.venv/Scripts/python -m pytest tests/website/test_seeding.py`
Expected: FAIL — `No module named 'apps.website.seed_data'`.

- [ ] **Step 2: Write the seed content**

`backend/apps/website/seed_data.py`:
```python
"""Default website content. Everything here is provisional (needs_review / is_placeholder /
is_draft) until the school confirms it, so the site stays in preview (spec §6.5)."""

from dataclasses import dataclass

SCHOOL = {
    "name": "AD Smart School",
    "motto": "",
    "founded_year": 2001,
    "address": "",
    "town": "Kronom, Kumasi",
    "region": "Ashanti Region",
    "ghana_post_gps": "",
    "phone": "+233545875881",
    "whatsapp": "+233545875881",
    "email": "kofiadutwumjnr881@gmail.com",
    "map_query": "Kronom, Kumasi, Ghana",
}

LEVEL_CODES = ("creche", "nursery", "kg", "lower_primary", "upper_primary", "jhs")

# code: (ages, one-line summary, longer detail)
_LEVELS = {
    "creche": (
        "Under 2 years",
        "Gentle, loving care for our youngest, with play, rest and routine at the heart "
        "of the day.",
        "Small groups, familiar carers and a calm daily rhythm help babies and toddlers "
        "feel safe while they explore.",
    ),
    "nursery": (
        "2 to 4 years",
        "Learning through play, songs and stories that build confidence, language and "
        "early number skills.",
        "Children learn to share, take turns and express themselves, through activities "
        "that feel like play.",
    ),
    "kg": (
        "4 to 6 years",
        "Hands-on discovery that gets children ready to read, write and count.",
        "KG1 and KG2 follow the national kindergarten curriculum, with progress shared "
        "through descriptive reports.",
    ),
    "lower_primary": (
        "6 to 9 years",
        "Strong foundations in literacy, numeracy and creative thinking.",
        "Basic 1 to 3 follow the standards-based curriculum, with plenty of reading, "
        "writing and practical maths.",
    ),
    "upper_primary": (
        "9 to 12 years",
        "Growing independence and a wider range of subjects.",
        "In Basic 4 to 6 pupils take more ownership of their learning and begin to use "
        "their own school login.",
    ),
    "jhs": (
        "12 to 15 years",
        "The Common Core Programme, steady preparation for the BECE and guidance for the "
        "next step.",
        "JHS 1 to 3 combine core subjects with practical skills, mock examinations and "
        "support in choosing a senior high school.",
    ),
}

_LEVEL_BLOCKS = [
    item
    for code, (ages, summary, detail) in _LEVELS.items()
    for item in (
        (f"level_{code}_ages", ages, f"Levels: age range for {code}"),
        (f"level_{code}_summary", summary, f"Levels: one-line summary for {code}"),
        (f"level_{code}_detail", detail, f"Levels page: longer description for {code}"),
    )
]

# (key, text, where it appears)
CONTENT_BLOCKS: list[tuple[str, str, str]] = [
    ("hero_headline", "Bright beginnings, from Crèche to JHS", "Home: main headline"),
    ("hero_subline", "Kronom, Kumasi · Since 2001", "Home: small line above the headline"),
    (
        "hero_intro",
        "A caring school for children from Crèche to Junior High in Kronom, Kumasi. Come "
        "and see where your child will learn, play and grow.",
        "Home: introduction under the headline",
    ),
    (
        "levels_intro",
        "One school for every stage of childhood, so your child can grow with friends and "
        "teachers who know them.",
        "Home: introduction to the levels",
    ),
    *_LEVEL_BLOCKS,
    (
        "for_parents_intro",
        "Staying close to your child's school day, even on a basic phone.",
        "Home: introduction to the 'For parents' features",
    ),
    (
        "gallery_intro",
        "A look around our classrooms, library, labs and playing fields.",
        "Home: introduction to the photo gallery",
    ),
    ("admissions_cta_heading", "Come and visit us", "Home: closing call to action heading"),
    (
        "admissions_cta_text",
        "Walk through our classrooms, meet our teachers and ask us anything. We'd love to "
        "show you around.",
        "Home: closing call to action text",
    ),
    (
        "about_history",
        "AD Smart School opened its doors in Kronom, Kumasi in 2001.\n\nToday we teach "
        "children from Crèche through Junior High School, so families can stay with us "
        "from their child's first steps to the BECE.",
        "About: the school's story",
    ),
    (
        "head_teacher_welcome",
        "Welcome to AD Smart School. Our teachers work hard to make every child feel safe, "
        "valued and excited to learn. We look forward to meeting you and your family.",
        "About: replace with the head teacher's own welcome",
    ),
    ("head_teacher_name", "The Head Teacher", "About: the head teacher's name and title"),
    (
        "admissions_intro",
        "We welcome enquiries all year round. Tell us a little about your child and we will "
        "call you to arrange a visit.",
        "Admissions: introduction",
    ),
    (
        "admissions_steps",
        "- Send an enquiry using the form below, or call us.\n"
        "- Visit the school and meet the head teacher.\n"
        "- Complete the admission form and provide the documents listed.\n"
        "- Receive your child's Student ID and start date.",
        "Admissions: steps (one '- ' line each)",
    ),
    (
        "admissions_requirements",
        "- Your child's birth certificate (or weighing card for the youngest)\n"
        "- Two recent passport-size photographs of your child\n"
        "- The last report card and a transfer letter, if your child is changing schools\n"
        "- The parent or guardian's Ghana Card",
        "Admissions: documents to bring (one '- ' line each)",
    ),
    ("contact_hours", "Monday to Friday, 7:00 am to 4:00 pm", "Contact: office hours"),
    ("footer_tagline", "Bright beginnings, from Crèche to JHS.", "Footer: short tagline"),
]

# (label, value)
FACTS = [
    ("years serving Kronom", "{years}"),
    ("every stage of basic education", "Crèche–JHS"),
]

# (key, title, text, icon) — all switched off until the feature is live
FEATURES = [
    (
        "sms_updates",
        "Updates by SMS",
        "Absence alerts, receipts and reminders reach you on any phone. No smartphone needed.",
        "message",
    ),
    (
        "momo_ussd",
        "Pay by MoMo or shortcode",
        "Pay fees, canteen and books by mobile money, card or a USSD shortcode on any phone.",
        "phone",
    ),
    (
        "daily_care",
        "Daily care reports",
        "For Crèche to KG: meals, naps and activities shared with you every day.",
        "care",
    ),
    (
        "safe_pickup",
        "Safe pick-up",
        "Children are released only to the people you have authorised.",
        "shield",
    ),
]


@dataclass(frozen=True)
class SeedPhoto:
    key: str
    filename: str
    alt_text: str
    caption: str


PHOTOS = [
    SeedPhoto(
        "hero",
        "hero.jpg",
        "Smiling children playing together on a colourful playground climbing frame",
        "",
    ),
    SeedPhoto(
        "about",
        "about.jpg",
        "Aerial view of a school building with a courtyard and a sports court",
        "",
    ),
    SeedPhoto(
        "gallery_01",
        "gallery_01.jpg",
        "Two young children building a tower of colourful wooden blocks on a classroom rug",
        "Early years play",
    ),
    SeedPhoto(
        "gallery_02",
        "gallery_02.jpg",
        "Four pupils in school uniform smiling as they share picture books by a bookshelf",
        "Reading together",
    ),
    SeedPhoto(
        "gallery_03",
        "gallery_03.jpg",
        "A teacher smiling as pupils raise their hands to answer in class",
        "Lessons that invite questions",
    ),
    SeedPhoto(
        "gallery_04",
        "gallery_04.jpg",
        "Pupils in uniform working at desktop computers in a computer lab",
        "Computer lab",
    ),
    SeedPhoto(
        "gallery_05",
        "gallery_05.jpg",
        "Students reading at tables in a bright library lined with bookshelves",
        "Library",
    ),
    SeedPhoto(
        "gallery_06",
        "gallery_06.jpg",
        "Pupils in sports kit playing football and basketball on a school field",
        "Sports",
    ),
    SeedPhoto(
        "gallery_07",
        "gallery_07.jpg",
        "A teacher leaning over to help a boy with his written work",
        "One-to-one support",
    ),
    SeedPhoto(
        "gallery_08",
        "gallery_08.jpg",
        "Rows of pupils using computers in an ICT room",
        "ICT lessons",
    ),
    SeedPhoto(
        "gallery_09",
        "gallery_09.jpg",
        "A metal competition robot on a play field while young people with controllers look on",
        "Robotics",
    ),
    SeedPhoto(
        "gallery_10",
        "gallery_10.jpg",
        "A teacher presenting on a large screen to students with laptops",
        "Digital skills",
    ),
    SeedPhoto(
        "gallery_11",
        "gallery_11.jpg",
        "Pupils in white uniform raising their hands in a classroom",
        "Class participation",
    ),
    SeedPhoto(
        "gallery_12",
        "gallery_12.jpg",
        "A technician with braided hair connecting network cables in a server rack",
        "Technology",
    ),
]

NEWS = [
    {
        "slug": "welcome-to-our-new-website",
        "title": "Welcome to our new website",
        "summary": "School news, key dates and admissions information, together in one place.",
        "body": "We are building a new website and school system for AD Smart School.\n\n"
        "Soon you will find school news, key dates and admissions information here, and "
        "parents will be able to follow their children's progress online.",
    },
]

PRIVACY_NOTICE = {
    "version": "2026-draft-1",
    "title": "Privacy notice",
    "body": "\n\n".join(
        [
            "## Who we are",
            "AD Smart School, Kronom, Kumasi, is responsible for the personal information "
            "described in this notice.",
            "## What we collect through this website",
            "When you send an admissions enquiry we collect your name, phone number and (if "
            "you give it) email address, your child's name and date of birth, the level you "
            "are interested in, your preferred visit date and your message.",
            "## Why we use it",
            "We use these details only to reply to your enquiry and to arrange a visit. We do "
            "not sell them or share them with anyone outside the school.",
            "## Who can see it",
            "Only the school staff who handle admissions.",
            "## How long we keep it",
            "If your child does not join the school, we delete the enquiry within 12 months.",
            "## Your rights",
            "You can ask us for a copy of the information we hold about you, ask us to "
            "correct it, or ask us to delete it. Contact the school office to do so.",
            "## The law",
            "We handle personal information in line with Ghana's Data Protection Act, 2012 "
            "(Act 843).",
        ]
    ),
}
```

- [ ] **Step 3: Write the seeding function and command**

`backend/apps/website/seeding.py`:
```python
from django.conf import settings
from django.core.files import File
from django.utils import timezone

from apps.consent.models import PrivacyNotice
from apps.school.models import SchoolProfile
from apps.website import seed_data
from apps.website.models import ContentBlock, Fact, FeatureBlock, NewsPost, PhotoSlot, SiteSettings

SEED_PHOTO_DIR = settings.BASE_DIR / "seed" / "placeholder_photos"


def seed_website() -> int:
    """Create any missing default content. Existing rows are never changed."""
    created = 0

    if SchoolProfile.load() is None:
        SchoolProfile(**seed_data.SCHOOL).save()
        created += 1

    for key, text, help_text in seed_data.CONTENT_BLOCKS:
        _, made = ContentBlock.objects.get_or_create(
            key=key, defaults={"text": text, "help_text": help_text}
        )
        created += made

    for order, (label, value) in enumerate(seed_data.FACTS):
        _, made = Fact.objects.get_or_create(label=label, defaults={"value": value, "order": order})
        created += made

    for order, (key, title, text, icon) in enumerate(seed_data.FEATURES):
        _, made = FeatureBlock.objects.get_or_create(
            key=key, defaults={"title": title, "text": text, "icon": icon, "order": order}
        )
        created += made

    for order, photo in enumerate(seed_data.PHOTOS):
        if PhotoSlot.objects.filter(key=photo.key).exists():
            continue
        slot = PhotoSlot(
            key=photo.key,
            alt_text=photo.alt_text,
            caption=photo.caption,
            order=order,
            is_placeholder=True,
        )
        with open(SEED_PHOTO_DIR / photo.filename, "rb") as handle:
            slot.image.save(photo.filename, File(handle), save=False)
        slot.save()
        created += 1

    for post in seed_data.NEWS:
        _, made = NewsPost.objects.get_or_create(
            slug=post["slug"],
            defaults={
                "title": post["title"],
                "summary": post["summary"],
                "body": post["body"],
                "status": NewsPost.Status.PUBLISHED,
                "published_at": timezone.now(),
            },
        )
        created += made

    _, made = PrivacyNotice.objects.get_or_create(
        version=seed_data.PRIVACY_NOTICE["version"],
        defaults={
            "title": seed_data.PRIVACY_NOTICE["title"],
            "body": seed_data.PRIVACY_NOTICE["body"],
            "effective_from": timezone.localdate(),
        },
    )
    created += made

    SiteSettings.load()
    return created
```

`backend/apps/website/management/__init__.py`, `backend/apps/website/management/commands/__init__.py`: empty files.

`backend/apps/website/management/commands/seed_website.py`:
```python
from django.core.management.base import BaseCommand

from apps.website.seeding import seed_website


class Command(BaseCommand):
    help = "Create the default website content. Existing rows are never changed."

    def handle(self, *args, **options):
        created = seed_website()
        self.stdout.write(self.style.SUCCESS(f"Website seed complete: {created} new item(s)."))
```

- [ ] **Step 4: Run the tests, then seed the development database**

```bash
.venv/Scripts/python -m pytest
.venv/Scripts/python manage.py seed_website
.venv/Scripts/python -m ruff check . && .venv/Scripts/python -m ruff format --check .
```
Expected: all tests pass; the command prints `Website seed complete: … new item(s).`; ruff is clean (run `ruff format .` first if it reports formatting).

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "Seed default website content and placeholder photos"
```

---

## Task 10: Frontend scaffold

**Files:**
- Create (generator): `frontend/` via `create-next-app@16.4.0`
- Create: `frontend/vitest.config.mts`, `frontend/vitest.setup.ts`, `frontend/.env.local.example`
- Modify: `frontend/next.config.ts`, `frontend/package.json` (scripts)
- Create: `frontend/src/lib/cn.ts`
- Test: `frontend/src/lib/cn.test.ts`

**Interfaces:**
- Produces: `cn(...parts: Array<string | false | null | undefined>): string`; npm scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `e2e`, `lighthouse`; Next rewrites `/api/:path*` and `/media/:path*` → `DJANGO_ORIGIN`; global test mocks for `next/link`, `next/navigation` (`usePathname` is a `vi.fn` returning `"/"`), `matchMedia`, `IntersectionObserver`, `ResizeObserver`, `Element.scrollBy`.

- [ ] **Step 1: Generate the app**

```bash
cd /c/Dev/ad-smart-school
npx --yes create-next-app@16.4.0 frontend --ts --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm --yes
cd frontend
rm -f public/*.svg src/app/favicon.ico
ls src/app
```
Expected: `globals.css  layout.tsx  page.tsx` (plus possibly `page.module.css`). If the generator created its own `.git` folder inside `frontend/`, delete it (`rm -rf frontend/.git`) — the repository root owns git.

- [ ] **Step 2: Install dependencies**

```bash
npm install motion embla-carousel-react lucide-react @radix-ui/react-dialog react-hook-form @hookform/resolvers zod
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @playwright/test @axe-core/playwright @lhci/cli
npm pkg set scripts.typecheck="next typegen && tsc --noEmit"
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:watch="vitest"
npm pkg set scripts.e2e="playwright test"
npm pkg set scripts.lighthouse="node e2e/lighthouse.mjs"
```

- [ ] **Step 3: Configure Next.js**

Replace `frontend/next.config.ts`:
```ts
import type { NextConfig } from "next";

const djangoOrigin = process.env.DJANGO_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The browser only talks to this origin; Next forwards API and media requests to Django.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${djangoOrigin}/api/:path*` },
      { source: "/media/:path*", destination: `${djangoOrigin}/media/:path*` },
    ];
  },
};

export default nextConfig;
```

`frontend/.env.local.example`:
```dotenv
# Copy to .env.local. Server-side only unless prefixed NEXT_PUBLIC_.
DJANGO_ORIGIN=http://127.0.0.1:8000
SITE_URL=http://localhost:3000
# Set when the portal exists (Plan 2); until then the sign-in button stays hidden.
# NEXT_PUBLIC_PORTAL_URL=/sign-in
```

```bash
cp .env.local.example .env.local
```

- [ ] **Step 4: Configure Vitest**

`frontend/vitest.config.mts`:
```ts
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
```

`frontend/vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

function mediaQueryList(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
}

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  configurable: true,
  value: vi.fn(mediaQueryList),
});
Object.defineProperty(window, "IntersectionObserver", { writable: true, value: NoopObserver });
Object.defineProperty(window, "ResizeObserver", { writable: true, value: NoopObserver });
Element.prototype.scrollBy = vi.fn();

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-lite");
  document.documentElement.style.colorScheme = "";
  vi.mocked(window.matchMedia).mockImplementation(mediaQueryList);
});
```

- [ ] **Step 5: Write the failing test**

`frontend/src/lib/cn.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins truthy class names with single spaces", () => {
    expect(cn("a", false, "b", null, undefined, "", "c")).toBe("a b c");
  });
});
```

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./cn"`.

- [ ] **Step 6: Implement**

`frontend/src/lib/cn.ts`:
```ts
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
```

- [ ] **Step 7: Run all frontend checks**

```bash
npm test
npm run lint
npm run typecheck
```
Expected: 1 test passes; lint and typecheck clean.

- [ ] **Step 8: Commit**

```bash
cd /c/Dev/ad-smart-school
git add frontend
git commit -m "Scaffold the Next.js frontend with Vitest"
```

---

## Task 11: Design tokens, light/dark themes, glass and the root layout

**Files:**
- Create: `frontend/src/lib/theme.ts`, `frontend/src/lib/boot-script.ts`
- Replace: `frontend/src/app/globals.css`, `frontend/src/app/layout.tsx`
- Delete: `frontend/src/app/page.tsx` (and `page.module.css` if present) — the home page arrives in Task 15
- Test: `frontend/src/lib/theme.test.ts`, `frontend/src/lib/boot-script.test.ts`

**Interfaces:**
- Produces:
  - `theme.ts`: types `ThemeChoice = "light" | "dark" | "system"`, `Theme = "light" | "dark"`; `THEME_STORAGE_KEY = "adss-theme"`; `THEME_COLORS`; `parseChoice(value)`, `resolveTheme(choice, prefersDark)`, `readStoredChoice()`, `storeChoice(choice)` (also notifies subscribers), `subscribeToChoice(listener) → unsubscribe`, `systemPrefersDark()`, `applyTheme(theme)`.
  - `boot-script.ts`: `LiteEnvironment` type, `shouldUseLite(env)`, `BOOT_SCRIPT` (inline `<head>` script: sets `data-theme` + `color-scheme` before paint, and `data-lite` when Lite mode applies; `?lite=1` forces Lite mode for testing).
  - CSS: tokens per spec §8.1 (light on `:root`, dark on `[data-theme="dark"]` with a `prefers-color-scheme` fallback); Tailwind colours `paper, card, ink, ink-muted, indigo, primary, amber, on-amber, cerulean, violet, copper, danger, success, line`; radii `rounded-control` (12 px) and `rounded-card` (16 px); shadows `shadow-elev-1`, `shadow-elev-2`; classes `glass-clear`, `glass-frosted`, `surface` (frosted look without blur), `bg-brand-mesh`, `scrim`, `press`, `link`, `logo-tile`, `on-dark`, `animate-rise`, `animate-pop`, `animate-sheet-in`, `animate-fade-in`; Tailwind variants `dark:` and `lite:`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/theme.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  parseChoice,
  readStoredChoice,
  resolveTheme,
  storeChoice,
  subscribeToChoice,
  THEME_STORAGE_KEY,
} from "./theme";

describe("theme", () => {
  it("treats anything but light or dark as system", () => {
    expect(parseChoice("light")).toBe("light");
    expect(parseChoice("dark")).toBe("dark");
    expect(parseChoice(null)).toBe("system");
    expect(parseChoice("purple")).toBe("system");
  });

  it("resolves system to the device preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("stores explicit choices and forgets system", () => {
    storeChoice("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(readStoredChoice()).toBe("dark");

    storeChoice("system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("falls back to system when storage is unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readStoredChoice()).toBe("system");
    spy.mockRestore();
  });

  it("notifies subscribers when the choice changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToChoice(listener);

    storeChoice("light");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    storeChoice("dark");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("applies the theme to the document and the theme-color meta tag", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);

    applyTheme("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(meta.content).toBe("#0b0a1f");
    meta.remove();
  });
});
```

`frontend/src/lib/boot-script.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { BOOT_SCRIPT, shouldUseLite } from "./boot-script";
import { THEME_STORAGE_KEY } from "./theme";

const capable = {
  forced: false,
  saveData: false,
  deviceMemory: 8,
  supportsBackdrop: true,
  prefersReducedTransparency: false,
};

describe("shouldUseLite", () => {
  it("is off on a capable device", () => {
    expect(shouldUseLite(capable)).toBe(false);
  });

  it.each([
    ["it is forced", { forced: true }],
    ["Data Saver is on", { saveData: true }],
    ["memory is low", { deviceMemory: 2 }],
    ["blur is unsupported", { supportsBackdrop: false }],
    ["reduced transparency is requested", { prefersReducedTransparency: true }],
  ])("turns on when %s", (_reason, override) => {
    expect(shouldUseLite({ ...capable, ...override })).toBe(true);
  });

  it("ignores unknown device memory", () => {
    expect(shouldUseLite({ ...capable, deviceMemory: undefined })).toBe(false);
  });
});

describe("BOOT_SCRIPT", () => {
  it("applies a stored dark choice before paint", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    new Function(BOOT_SCRIPT)();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("follows the device when nothing is stored", () => {
    vi.mocked(window.matchMedia).mockImplementation(
      (query: string) =>
        ({
          matches: query === "(prefers-color-scheme: dark)",
          media: query,
          addEventListener() {},
          removeEventListener() {},
        }) as unknown as MediaQueryList,
    );

    new Function(BOOT_SCRIPT)();

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("uses Lite mode when the browser cannot blur", () => {
    new Function(BOOT_SCRIPT)(); // jsdom has no backdrop-filter support

    expect(document.documentElement.hasAttribute("data-lite")).toBe(true);
  });
});
```

Run: `npm test`
Expected: FAIL — cannot resolve `./theme` and `./boot-script`.

- [ ] **Step 2: Implement the theme helpers**

`frontend/src/lib/theme.ts`:
```ts
export type ThemeChoice = "light" | "dark" | "system";
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "adss-theme";
const CHANGE_EVENT = "adss-theme-change";

/** Browser chrome colours; keep in step with --paper in globals.css. */
export const THEME_COLORS: Record<Theme, string> = { light: "#faf9f6", dark: "#0b0a1f" };

export function parseChoice(value: string | null | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): Theme {
  if (choice === "system") return prefersDark ? "dark" : "light";
  return choice;
}

export function readStoredChoice(): ThemeChoice {
  try {
    return parseChoice(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function storeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Private browsing: the choice applies until the page reloads.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeToChoice(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = THEME_COLORS[theme];
  });
}
```

`frontend/src/lib/boot-script.ts`:
```ts
import { THEME_STORAGE_KEY } from "./theme";

export type LiteEnvironment = {
  forced: boolean;
  saveData: boolean;
  deviceMemory?: number;
  supportsBackdrop: boolean;
  prefersReducedTransparency: boolean;
};

/** Lite mode swaps blur for solid surfaces on weak or data-saving devices (spec §8.2). */
export function shouldUseLite(env: LiteEnvironment): boolean {
  return (
    env.forced ||
    env.saveData ||
    (env.deviceMemory !== undefined && env.deviceMemory <= 2) ||
    !env.supportsBackdrop ||
    env.prefersReducedTransparency
  );
}

/**
 * Runs in <head> before first paint so the page never flashes the wrong theme.
 * Mirrors resolveTheme() and shouldUseLite(); boot-script.test.ts executes it.
 */
export const BOOT_SCRIPT = `(function(){var d=document.documentElement;
try{var c=null;try{c=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}
var dark=c==="dark"||(c!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);
d.dataset.theme=dark?"dark":"light";d.style.colorScheme=dark?"dark":"light";}catch(e){}
try{var n=navigator,k=n.connection,css=window.CSS&&CSS.supports;
var lite=/[?&]lite=1(&|$)/.test(location.search)||!!(k&&k.saveData)
||(typeof n.deviceMemory==="number"&&n.deviceMemory<=2)
||!(css&&(CSS.supports("backdrop-filter","blur(1px)")||CSS.supports("-webkit-backdrop-filter","blur(1px)")))
||matchMedia("(prefers-reduced-transparency: reduce)").matches;
if(lite)d.setAttribute("data-lite","");}catch(e){}})();`;
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Write the design tokens**

Replace `frontend/src/app/globals.css`:
```css
@import "tailwindcss";

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
@custom-variant lite (&:where([data-lite], [data-lite] *));

/* ---------- Tokens (spec §8.1). Light theme ---------- */
:root {
  --paper: #faf9f6;
  --card: #ffffff;
  --ink: #14123a;
  --ink-muted: #4a4e69;
  --accent-indigo: #0f1a9e;
  --btn-primary: #0f1a9e;
  --brand-amber: #f0ad1c;
  --on-amber: #14123a;
  --accent-cerulean: #0277bd;
  --accent-violet: #8806a8;
  --accent-copper: #c4601f;
  --danger: #dc2626;
  --success: #15803d;
  --line: rgb(20 18 58 / 0.12);
  --logo-tile: #ffffff;

  --glass-clear-bg: rgb(11 10 31 / 0.38);
  --glass-clear-border: rgb(255 255 255 / 0.22);
  --glass-clear-lite-bg: rgb(15 26 158 / 0.88);
  --glass-frosted-bg: rgb(255 255 255 / 0.85);
  --glass-frosted-border: rgb(15 26 158 / 0.08);

  --mesh-a: #0f1a9e;
  --mesh-b: #0277bd;
  --mesh-c: #8806a8;
  --mesh-glow: rgb(240 173 28 / 0.35);
  --scrim: linear-gradient(
    180deg,
    rgb(11 10 31 / 0.35) 0%,
    rgb(15 26 158 / 0.55) 55%,
    rgb(11 10 31 / 0.85) 100%
  );

  --elev-1: 0 1px 2px rgb(20 18 58 / 0.06), 0 4px 12px rgb(20 18 58 / 0.06);
  --elev-2: 0 2px 6px rgb(20 18 58 / 0.08), 0 16px 40px rgb(20 18 58 / 0.14);

  color-scheme: light;
}

/* ---------- Dark theme ---------- */
[data-theme="dark"] {
  --paper: #0b0a1f;
  --card: #15133a;
  --ink: #ecebfa;
  --ink-muted: #b4b3d6;
  --accent-indigo: #9aa2ff;
  --btn-primary: #3b46d9;
  --accent-cerulean: #5bb8f5;
  --accent-violet: #d58bf0;
  --accent-copper: #e08a4f;
  --danger: #f87171;
  --success: #4ade80;
  --line: rgb(236 235 250 / 0.12);

  --glass-clear-bg: rgb(11 10 31 / 0.45);
  --glass-clear-border: rgb(255 255 255 / 0.14);
  --glass-clear-lite-bg: rgb(27 31 107 / 0.92);
  --glass-frosted-bg: rgb(21 19 58 / 0.8);
  --glass-frosted-border: rgb(154 162 255 / 0.14);

  --mesh-a: #0b0a1f;
  --mesh-b: #1b1f6b;
  --mesh-c: #3a1450;
  --mesh-glow: rgb(240 173 28 / 0.14);

  --elev-1: 0 1px 2px rgb(0 0 0 / 0.4);
  --elev-2: 0 16px 40px rgb(0 0 0 / 0.45);

  color-scheme: dark;
}

/* Fallback for the rare case where the boot script cannot run. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --paper: #0b0a1f;
    --card: #15133a;
    --ink: #ecebfa;
    --ink-muted: #b4b3d6;
    --accent-indigo: #9aa2ff;
    --btn-primary: #3b46d9;
    --accent-cerulean: #5bb8f5;
    --accent-violet: #d58bf0;
    --accent-copper: #e08a4f;
    --danger: #f87171;
    --success: #4ade80;
    --line: rgb(236 235 250 / 0.12);
    --glass-clear-bg: rgb(11 10 31 / 0.45);
    --glass-clear-border: rgb(255 255 255 / 0.14);
    --glass-clear-lite-bg: rgb(27 31 107 / 0.92);
    --glass-frosted-bg: rgb(21 19 58 / 0.8);
    --glass-frosted-border: rgb(154 162 255 / 0.14);
    --mesh-a: #0b0a1f;
    --mesh-b: #1b1f6b;
    --mesh-c: #3a1450;
    --mesh-glow: rgb(240 173 28 / 0.14);
    --elev-1: 0 1px 2px rgb(0 0 0 / 0.4);
    --elev-2: 0 16px 40px rgb(0 0 0 / 0.45);
    color-scheme: dark;
  }
}

/* ---------- Tailwind theme ---------- */
@theme inline {
  --font-sans:
    var(--font-poppins), ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial, sans-serif;
  --color-paper: var(--paper);
  --color-card: var(--card);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-indigo: var(--accent-indigo);
  --color-primary: var(--btn-primary);
  --color-amber: var(--brand-amber);
  --color-on-amber: var(--on-amber);
  --color-cerulean: var(--accent-cerulean);
  --color-violet: var(--accent-violet);
  --color-copper: var(--accent-copper);
  --color-danger: var(--danger);
  --color-success: var(--success);
  --color-line: var(--line);
  --radius-control: 12px;
  --radius-card: 16px;
  --shadow-elev-1: var(--elev-1);
  --shadow-elev-2: var(--elev-2);
}

/* ---------- Base ---------- */
@layer base {
  html {
    scroll-padding-top: 6rem;
    -webkit-text-size-adjust: 100%;
    background-color: var(--paper);
  }
  body {
    line-height: 1.65;
  }
  h1,
  h2,
  h3 {
    letter-spacing: -0.01em;
    line-height: 1.2;
    text-wrap: balance;
  }
  :focus-visible {
    outline: 2px solid var(--accent-indigo);
    outline-offset: 2px;
  }
  .on-dark :focus-visible {
    outline-color: var(--brand-amber);
  }
}

/* ---------- Components ---------- */
@layer components {
  .glass-clear {
    background: var(--glass-clear-bg);
    border: 1px solid var(--glass-clear-border);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.18);
    -webkit-backdrop-filter: blur(16px) saturate(140%);
    backdrop-filter: blur(16px) saturate(140%);
  }
  .glass-frosted {
    background: var(--glass-frosted-bg);
    border: 1px solid var(--glass-frosted-border);
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
  }
  /* Frosted look without blur: for long lists and large areas (spec §8.2). */
  .surface {
    background: var(--glass-frosted-bg);
    border: 1px solid var(--glass-frosted-border);
  }
  [data-lite] .glass-clear {
    background: var(--glass-clear-lite-bg);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
  [data-lite] .glass-frosted,
  [data-lite] .surface {
    background: var(--card);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }

  .bg-brand-mesh {
    background:
      radial-gradient(60% 50% at 12% 18%, var(--mesh-glow), transparent 70%),
      radial-gradient(50% 60% at 90% 8%, color-mix(in srgb, var(--mesh-c) 70%, transparent), transparent 70%),
      linear-gradient(135deg, var(--mesh-a) 0%, var(--mesh-b) 55%, var(--mesh-c) 100%);
  }
  .scrim {
    background: var(--scrim);
  }

  .press {
    transition-property: transform, filter, background-color, color, box-shadow;
    transition-duration: 160ms;
    transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .press:active {
    transform: scale(0.97);
  }

  .link {
    color: var(--accent-indigo);
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }
  .on-dark .link {
    color: #ffffff;
  }

  .logo-tile {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: var(--logo-tile);
    padding: 4px 6px;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
  }

  .animate-rise {
    animation: rise 480ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .animate-pop {
    animation: pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .animate-sheet-in {
    animation: sheet-in 320ms cubic-bezier(0.34, 1.3, 0.64, 1) both;
  }
  .animate-fade-in {
    animation: fade-in 200ms ease-out both;
  }
}

@keyframes sheet-in {
  from {
    transform: translateX(100%);
  }
  to {
    transform: none;
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes pop {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Theme switch cross-fade (View Transitions API). */
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 200ms;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 5: Write the root layout**

Replace `frontend/src/app/layout.tsx`:
```tsx
import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import type { ReactNode } from "react";
import { BOOT_SCRIPT } from "@/lib/boot-script";
import { THEME_COLORS } from "@/lib/theme";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: { default: "AD Smart School · Kronom, Kumasi", template: "%s · AD Smart School" },
  description:
    "AD Smart School in Kronom, Kumasi: Crèche, Nursery, KG, Primary and Junior High School since 2001.",
  applicationName: "AD Smart School",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GH" className={poppins.variable} suppressHydrationWarning>
      <head>
        {/* Sets theme and Lite mode before first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
```

```bash
rm -f src/app/page.tsx src/app/page.module.css
```

- [ ] **Step 6: Run checks**

```bash
npm test && npm run lint && npm run typecheck
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
cd /c/Dev/ad-smart-school
git add frontend
git commit -m "Add design tokens, light and dark themes, glass and Lite mode"
```

---

## Task 12: Brand, motion and UI primitives

**Files:**
- Create: `frontend/src/lib/motion.ts`, `frontend/src/lib/types.ts`, `frontend/src/lib/levels.ts`, `frontend/src/lib/rich-text.ts`
- Create: `frontend/src/components/motion/swing-in.tsx`
- Create: `frontend/src/components/ui/button.tsx`, `container.tsx`, `section-heading.tsx`, `category-badge.tsx`, `responsive-image.tsx`, `rich-text.tsx`
- Create: `frontend/src/components/brand/logo-mark.tsx`, `brand-link.tsx`
- Create: `frontend/src/app/icon.svg`
- Test: `frontend/src/lib/rich-text.test.ts`, `frontend/src/components/ui/ui.test.tsx`, `frontend/src/components/motion/swing-in.test.tsx`, `frontend/src/components/brand/brand-link.test.tsx`

**Interfaces:**
- Consumes: `cn` (Task 10); CSS classes from Task 11.
- Produces:
  - `springs` (`snappy`, `gentle`, `swing`) and `prefersReducedMotion(): boolean`.
  - Types (`types.ts`): `ImageData`, `Photo`, `SchoolInfo`, `Fact`, `FeatureIcon`, `Feature`, `SiteData`, `NewsSummary`, `NewsPost`, `PrivacyNotice`, `ApiErrorBody` — exactly mirroring the Task 7/8 API shapes.
  - `levels.ts`: `Category`, `CATEGORY_LABEL`, `LevelCode`, `LEVELS: {code, name, shortName, category}[]`.
  - `parseRichText(source): RichBlock[]`; `<RichText text headingLevel? className? />`.
  - `<SwingIn index? className?>` — content that starts below the fold swings in from its top edge when scrolled into view; content already visible is never hidden.
  - `<Button variant? size? …>`, `<ButtonLink href variant? size? …>`, `buttonClasses(variant, size, className)`; variants `amber | primary | glass | outline`, sizes `md | lg`.
  - `<Container>`, `<SectionHeading eyebrow? title intro? id? align?>`, `<CategoryBadge category>`, `<ResponsiveImage image sizes priority? className?>`.
  - `<LogoMark gemRef? className? />` (decorative SVG), `<BrandLink name className? />` (link home; the gem swings on load, hover and focus).

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/rich-text.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseRichText } from "./rich-text";

describe("parseRichText", () => {
  it("splits paragraphs on blank lines and joins wrapped lines", () => {
    expect(parseRichText("First line\ncontinues.\n\nSecond.")).toEqual([
      { type: "paragraph", text: "First line continues." },
      { type: "paragraph", text: "Second." },
    ]);
  });

  it("reads headings and lists", () => {
    expect(parseRichText("## Your rights\n\n- Ask for a copy\n- Correct it")).toEqual([
      { type: "heading", text: "Your rights" },
      { type: "list", items: ["Ask for a copy", "Correct it"] },
    ]);
  });

  it("copes with Windows line endings and empty input", () => {
    expect(parseRichText("One\r\n\r\nTwo")).toHaveLength(2);
    expect(parseRichText("  \n\n ")).toEqual([]);
  });
});
```

`frontend/src/components/ui/ui.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ButtonLink } from "./button";
import { CategoryBadge } from "./category-badge";
import { ResponsiveImage } from "./responsive-image";
import { RichText } from "./rich-text";

const image = { src: "/media/a-960w.webp", srcset: "/media/a-480w.webp 480w", width: 960, height: 640, alt: "Pupils reading" };

describe("ui primitives", () => {
  it("renders internal and phone links as anchors with large tap targets", () => {
    render(
      <>
        <ButtonLink href="/admissions">Apply</ButtonLink>
        <ButtonLink href="tel:+233545875881" variant="outline">Call</ButtonLink>
      </>,
    );
    expect(screen.getByRole("link", { name: "Apply" })).toHaveAttribute("href", "/admissions");
    expect(screen.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+233545875881");
    expect(screen.getByRole("link", { name: "Apply" }).className).toContain("min-h-11");
  });

  it("lazy-loads images unless they are the priority image", () => {
    const { rerender } = render(<ResponsiveImage image={image} sizes="100vw" />);
    expect(screen.getByRole("img", { name: "Pupils reading" })).toHaveAttribute("loading", "lazy");

    rerender(<ResponsiveImage image={image} sizes="100vw" priority />);
    const img = screen.getByRole("img", { name: "Pupils reading" });
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("fetchpriority", "high");
    expect(img).toHaveAttribute("width", "960");
  });

  it("labels categories in words, not colour alone", () => {
    render(<CategoryBadge category="jhs" />);
    expect(screen.getByText("JHS")).toBeInTheDocument();
  });

  it("renders rich text blocks with the requested heading level", () => {
    render(<RichText text={"## Who we are\n\nA school.\n\n- One\n- Two"} headingLevel={3} />);
    expect(screen.getByRole("heading", { level: 3, name: "Who we are" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
```

`frontend/src/components/motion/swing-in.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SwingIn } from "./swing-in";

afterEach(() => vi.restoreAllMocks());

describe("SwingIn", () => {
  it("never hides content that is already on screen", () => {
    render(<SwingIn><p>Visible card</p></SwingIn>);
    expect(screen.getByText("Visible card").parentElement).not.toHaveStyle({ opacity: "0" });
  });

  it("hides content below the fold until it scrolls into view", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: 5000, bottom: 5200, left: 0, right: 100, width: 100, height: 200, x: 0, y: 5000, toJSON: () => ({}),
    });
    render(<SwingIn><p>Later card</p></SwingIn>);
    expect(screen.getByText("Later card").parentElement).toHaveStyle({ opacity: "0" });
  });
});
```

`frontend/src/components/brand/brand-link.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLink } from "./brand-link";

describe("BrandLink", () => {
  it("links home with the school name as its accessible name", () => {
    render(<BrandLink name="AD Smart School" />);
    const link = screen.getByRole("link", { name: "AD Smart School" });
    expect(link).toHaveAttribute("href", "/");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
```

Run: `npm test`
Expected: FAIL — modules not found.

- [ ] **Step 2: Shared libraries**

`frontend/src/lib/motion.ts`:
```ts
/** Spring presets (spec §8.6). */
export const springs = {
  snappy: { type: "spring", stiffness: 400, damping: 30 },
  gentle: { type: "spring", stiffness: 170, damping: 22 },
  swing: { type: "spring", stiffness: 120, damping: 8 },
} as const;

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
```

`frontend/src/lib/types.ts`:
```ts
/** Shapes returned by the Django public API (backend Tasks 7–8). */

export type ImageData = { src: string; srcset: string; width: number; height: number; alt: string };

export type Photo = ImageData & { caption: string; is_placeholder: boolean };

export type SchoolInfo = {
  name: string;
  motto: string;
  founded_year: number;
  years_since_founding: number;
  address: string;
  town: string;
  region: string;
  ghana_post_gps: string;
  phone: string;
  phone_display: string;
  whatsapp_link: string;
  email: string;
  map_query: string;
};

export type Fact = { label: string; value: string };

export type FeatureIcon = "message" | "phone" | "care" | "shield";

export type Feature = { key: string; title: string; text: string; icon: FeatureIcon };

export type SiteData = {
  school: SchoolInfo;
  is_public: boolean;
  content: Record<string, string>;
  facts: Fact[];
  features: Feature[];
  photos: Record<string, Photo | null>;
  gallery: Photo[];
};

export type NewsSummary = {
  title: string;
  slug: string;
  summary: string;
  published_at: string;
  cover: ImageData | null;
};

export type NewsPost = NewsSummary & { body: string };

export type PrivacyNotice = {
  version: string;
  title: string;
  body: string;
  effective_from: string;
  is_draft: boolean;
};

export type ApiErrorBody = { code: string; message: string; fields: Record<string, string[]> };
```

`frontend/src/lib/levels.ts`:
```ts
export type Category = "early_years" | "primary" | "jhs";

export const CATEGORY_LABEL: Record<Category, string> = {
  early_years: "Early Years",
  primary: "Primary",
  jhs: "JHS",
};

/** Same codes as the backend's Enquiry.Level and level_<code>_* content blocks. */
export type LevelCode = "creche" | "nursery" | "kg" | "lower_primary" | "upper_primary" | "jhs";

export const LEVELS: { code: LevelCode; name: string; shortName: string; category: Category }[] = [
  { code: "creche", name: "Crèche", shortName: "Crèche", category: "early_years" },
  { code: "nursery", name: "Nursery", shortName: "Nursery", category: "early_years" },
  { code: "kg", name: "Kindergarten (KG1–KG2)", shortName: "KG", category: "early_years" },
  { code: "lower_primary", name: "Lower Primary (Basic 1–3)", shortName: "Basic 1–3", category: "primary" },
  { code: "upper_primary", name: "Upper Primary (Basic 4–6)", shortName: "Basic 4–6", category: "primary" },
  { code: "jhs", name: "Junior High School (JHS 1–3)", shortName: "JHS", category: "jhs" },
];
```

`frontend/src/lib/rich-text.ts`:
```ts
/** The plain-text format the admin writes in (see FORMAT_HELP in the backend). */
export type RichBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

export function parseRichText(source: string): RichBlock[] {
  return source
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk): RichBlock => {
      if (chunk.startsWith("## ")) return { type: "heading", text: chunk.slice(3).trim() };
      const lines = chunk.split("\n").map((line) => line.trim());
      if (lines.every((line) => line.startsWith("- "))) {
        return { type: "list", items: lines.map((line) => line.slice(2).trim()) };
      }
      return { type: "paragraph", text: lines.join(" ") };
    });
}
```

- [ ] **Step 3: UI primitives**

`frontend/src/components/ui/button.tsx`:
```tsx
import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const BASE =
  "press inline-flex cursor-pointer items-center justify-center gap-2 rounded-control font-semibold disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS = {
  amber: "bg-amber text-on-amber hover:brightness-105",
  primary: "bg-primary text-white hover:brightness-110",
  glass: "glass-clear text-white hover:brightness-125",
  outline: "border border-line text-ink hover:bg-ink/5",
} as const;

const SIZES = { md: "min-h-11 px-5 text-base", lg: "min-h-12 px-6 text-lg" } as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const EXTERNAL = /^(https?:|tel:|mailto:)/;

export function ButtonLink({ href, variant, size, className, ...props }: ButtonLinkProps) {
  const classes = buttonClasses(variant, size, className);
  if (EXTERNAL.test(href)) return <a href={href} className={classes} {...props} />;
  return <Link href={href} className={classes} {...props} />;
}
```

`frontend/src/components/ui/container.tsx`:
```tsx
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)} {...props} />;
}
```

`frontend/src/components/ui/section-heading.tsx`:
```tsx
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  eyebrow?: string;
  intro?: string;
  id?: string;
  align?: "start" | "center";
  className?: string;
};

export function SectionHeading({ title, eyebrow, intro, id, align = "start", className }: Props) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && (
        <p className="text-sm font-semibold tracking-wider text-indigo uppercase">{eyebrow}</p>
      )}
      <h2 id={id} className="mt-2 text-3xl font-bold sm:text-4xl">
        {title}
      </h2>
      {intro && <p className="mt-4 text-lg text-ink-muted">{intro}</p>}
    </div>
  );
}
```

`frontend/src/components/ui/category-badge.tsx`:
```tsx
import { cn } from "@/lib/cn";
import { CATEGORY_LABEL, type Category } from "@/lib/levels";

const DOT: Record<Category, string> = {
  early_years: "bg-amber",
  primary: "bg-cerulean",
  jhs: "bg-violet",
};

export function CategoryBadge({ category, className }: { category: Category; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-sm font-medium text-ink",
        className,
      )}
    >
      <span aria-hidden className={cn("size-2.5 rounded-full", DOT[category])} />
      {CATEGORY_LABEL[category]}
    </span>
  );
}
```

`frontend/src/components/ui/responsive-image.tsx`:
```tsx
import type { ImageData } from "@/lib/types";

type Props = { image: ImageData; sizes: string; priority?: boolean; className?: string };

/** Renditions are generated by Django (spec §2.3), so a plain <img srcset> is enough. */
export function ResponsiveImage({ image, sizes, priority = false, className }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.src}
      srcSet={image.srcset}
      sizes={sizes}
      width={image.width}
      height={image.height}
      alt={image.alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      className={className}
    />
  );
}
```

`frontend/src/components/ui/rich-text.tsx`:
```tsx
import { cn } from "@/lib/cn";
import { parseRichText } from "@/lib/rich-text";

type Props = { text: string; headingLevel?: 2 | 3; className?: string };

export function RichText({ text, headingLevel = 2, className }: Props) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={cn("space-y-4", className)}>
      {parseRichText(text).map((block, index) => {
        if (block.type === "heading") {
          return (
            <Heading key={index} className="pt-2 text-xl font-semibold">
              {block.text}
            </Heading>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={index} className="list-disc space-y-1 pl-6 marker:text-indigo">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{block.text}</p>;
      })}
    </div>
  );
}
```

- [ ] **Step 4: Motion**

`frontend/src/components/motion/swing-in.tsx`:
```tsx
"use client";

import { useAnimate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { springs } from "@/lib/motion";

type Props = { children: ReactNode; index?: number; className?: string };

/**
 * Swings content into place from its top edge the first time it scrolls into view
 * (spec §8.6). Content already on screen at load is never hidden, so a slow phone
 * never shows empty space while JavaScript loads.
 */
export function SwingIn({ children, index = 0, className }: Props) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const inView = useInView(scope, { once: true, amount: 0.2 });
  const reduceMotion = useReducedMotion();
  const armed = useRef(false);

  useLayoutEffect(() => {
    const element = scope.current;
    if (!element || reduceMotion) return;
    if (element.getBoundingClientRect().top > window.innerHeight) {
      armed.current = true;
      element.style.opacity = "0";
      element.style.transformOrigin = "50% 0%";
      element.style.transform = "rotate(-6deg)";
    }
  }, [scope, reduceMotion]);

  useEffect(() => {
    if (!inView || !armed.current) return;
    armed.current = false;
    animate(
      scope.current,
      { opacity: [0, 1], rotate: [-6, 0] },
      { ...springs.swing, delay: Math.min(index, 10) * 0.03 },
    );
  }, [inView, animate, scope, index]);

  return (
    <div ref={scope} className={className}>
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Logo and favicon**

The SVG reproduces `docs/brand/ad-smart-school-logo.png` (1800 × 1800 source) with the same geometry: an "a" ring and a "d" bowl of radius 292 drawn as 140-unit strokes, the gem as eight triangles, and the amber dot. The gem is a separate group so it can swing.

`frontend/src/components/brand/logo-mark.tsx`:
```tsx
import type { Ref } from "react";

type Props = { gemRef?: Ref<SVGGElement>; className?: string };

/** AD Smart School logo (brand asset: the only place raw colours are allowed). */
export function LogoMark({ gemRef, className }: Props) {
  return (
    <svg
      viewBox="195 365 1360 1035"
      className={className}
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="adss-blue" gradientUnits="userSpaceOnUse" x1="560" y1="0" x2="1545" y2="0">
          <stop offset="0" stopColor="#0230A6" />
          <stop offset="1" stopColor="#0A78B8" />
        </linearGradient>
        <linearGradient id="adss-indigo" gradientUnits="userSpaceOnUse" x1="210" y1="0" x2="540" y2="0">
          <stop offset="0" stopColor="#0C0898" />
          <stop offset="1" stopColor="#0A26A4" />
        </linearGradient>
      </defs>
      {/* d: violet top, blue bottom, violet stem, amber dot */}
      <g fill="none" strokeWidth="140">
        <path d="M907.6 929.1 A292 292 0 0 1 1469.6 1079.7" stroke="#8806A8" />
        <path d="M1458.1 1124.1 A292 292 0 0 1 890 1029" stroke="url(#adss-blue)" />
      </g>
      <rect x="1404" y="557" width="141" height="523" fill="#8806A8" />
      <rect x="1404" y="373" width="141" height="145" fill="#F0AD1C" />
      {/* a: indigo, amber and blue arcs with the blue stem */}
      <g fill="none" strokeWidth="140">
        <path d="M283.2 985.8 A292 292 0 0 1 481.8 751.3" stroke="url(#adss-indigo)" />
        <path d="M617.7 1317.4 A292 292 0 0 1 280.1 1022.4" stroke="#F0AD1C" />
        <path d="M713.6 773.6 A292 292 0 0 1 642.6 1312.3" stroke="url(#adss-blue)" />
      </g>
      <rect x="794" y="1029" width="140" height="363" fill="url(#adss-blue)" />
      {/* gem: swings from its top centre */}
      <g ref={gemRef} style={{ transformBox: "fill-box", transformOrigin: "50% 0%" }}>
        <polygon points="367,512 440,388 508,512" fill="#0A12A0" />
        <polygon points="451,383 600,383 518,507" fill="#F0AD1C" />
        <polygon points="527,512 607,392 697,512" fill="#C4601F" />
        <polygon points="614,383 765,383 708,507" fill="#F0AD1C" />
        <polygon points="716,512 774,388 849,512" fill="#0A76B8" />
        <polygon points="369,522 512,522 599,806" fill="#8806A8" />
        <polygon points="522,522 700,522 608,816" fill="#8806A8" />
        <polygon points="710,522 848,522 618,806" fill="#8806A8" />
      </g>
    </svg>
  );
}
```

`frontend/src/components/brand/brand-link.tsx`:
```tsx
"use client";

import { useAnimate, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect } from "react";
import { cn } from "@/lib/cn";
import { springs } from "@/lib/motion";
import { LogoMark } from "./logo-mark";

export function BrandLink({ name, className }: { name: string; className?: string }) {
  const [gemRef, animate] = useAnimate<SVGGElement>();
  const reduceMotion = useReducedMotion();

  const swing = useCallback(() => {
    if (reduceMotion || !gemRef.current) return;
    animate(gemRef.current, { rotate: [9, 0] }, springs.swing);
  }, [animate, gemRef, reduceMotion]);

  useEffect(() => {
    swing();
  }, [swing]);

  return (
    <Link
      href="/"
      className={cn("inline-flex min-h-11 items-center gap-3 rounded-control", className)}
      onMouseEnter={swing}
      onFocus={swing}
    >
      <span className="logo-tile">
        <LogoMark gemRef={gemRef} className="h-8 w-auto sm:h-9" />
      </span>
      <span className="text-base leading-tight font-semibold sm:text-lg">{name}</span>
    </Link>
  );
}
```

`frontend/src/app/icon.svg` (favicon: the gem):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="355 370 505 460">
  <polygon points="367,512 440,388 508,512" fill="#0A12A0"/>
  <polygon points="451,383 600,383 518,507" fill="#F0AD1C"/>
  <polygon points="527,512 607,392 697,512" fill="#C4601F"/>
  <polygon points="614,383 765,383 708,507" fill="#F0AD1C"/>
  <polygon points="716,512 774,388 849,512" fill="#0A76B8"/>
  <polygon points="369,522 512,522 599,806" fill="#8806A8"/>
  <polygon points="522,522 700,522 608,816" fill="#8806A8"/>
  <polygon points="710,522 848,522 618,806" fill="#8806A8"/>
</svg>
```

- [ ] **Step 6: Run checks**

```bash
npm test && npm run lint && npm run typecheck
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
cd /c/Dev/ad-smart-school
git add frontend
git commit -m "Add brand mark, swing motion and UI primitives"
```

---

## Task 13: API clients and dates

**Files:**
- Create: `frontend/src/lib/api.ts` (server), `frontend/src/lib/client-api.ts` (browser), `frontend/src/lib/dates.ts`, `frontend/src/lib/site-url.ts`
- Test: `frontend/src/lib/api.test.ts`, `frontend/src/lib/client-api.test.ts`, `frontend/src/lib/dates.test.ts`

**Interfaces:**
- Consumes: types from Task 12.
- Produces:
  - `api.ts` (server components only): `REVALIDATE_SECONDS = 300`; `getSite(): Promise<SiteData>` (throws if unavailable); `getNewsList(limit = 20): Promise<NewsSummary[]>`; `getNewsPost(slug): Promise<NewsPost | null>`; `getPrivacyNotice(): Promise<PrivacyNotice | null>`; `contentOf(site, key, fallback = "")`. Calls `${DJANGO_ORIGIN}/api/public/…` directly with `next: { revalidate: 300 }`.
  - `client-api.ts` (browser): `class ApiRequestError extends Error { status: number; body: ApiErrorBody | null }`; `getJson<T>(path)`, `postJson<T>(path, data)` using same-origin relative paths.
  - `dates.ts`: `formatDate(iso: string): string` → `"9 October 2026"`; `todayInAccra(now?: Date): string` → `"2026-10-09"`.
  - `site-url.ts`: `siteUrl(): string` (from `SITE_URL`, no trailing slash).

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/api.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { getNewsList, getNewsPost, getSite } from "./api";

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("server API client", () => {
  it("calls Django directly and revalidates every five minutes", async () => {
    vi.stubEnv("DJANGO_ORIGIN", "http://django.test");
    const fetchMock = stubFetch(200, []);

    await getNewsList(3);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://django.test/api/public/news?limit=3",
      expect.objectContaining({ next: { revalidate: 300 } }),
    );
  });

  it("returns null for a missing news post", async () => {
    stubFetch(404, { code: "not_found" });
    expect(await getNewsPost("nope")).toBeNull();
  });

  it("fails loudly when the site content cannot be loaded", async () => {
    stubFetch(503, { code: "not_configured" });
    await expect(getSite()).rejects.toThrow("503");
  });
});
```

`frontend/src/lib/client-api.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, postJson } from "./client-api";

afterEach(() => vi.unstubAllGlobals());

describe("browser API client", () => {
  it("posts JSON to the same origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ status: "received" }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(postJson("/api/public/enquiries", { a: 1 })).resolves.toEqual({ status: "received" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/public/enquiries",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ a: 1 }) }),
    );
  });

  it("raises ApiRequestError carrying the error body", async () => {
    const body = { code: "validation_error", message: "Check", fields: { phone: ["Bad"] } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => body }));

    const error = await postJson("/x", {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(400);
    expect((error as ApiRequestError).body).toEqual(body);
  });

  it("copes with error responses that are not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => { throw new SyntaxError("html"); } }),
    );

    const error = (await postJson("/x", {}).catch((caught: unknown) => caught)) as ApiRequestError;

    expect(error.status).toBe(502);
    expect(error.body).toBeNull();
  });
});
```

`frontend/src/lib/dates.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { formatDate, todayInAccra } from "./dates";

describe("dates", () => {
  it("formats dates the British way in Accra time", () => {
    expect(formatDate("2026-10-09T08:00:00+00:00")).toBe("9 October 2026");
    expect(formatDate("2026-01-01")).toBe("1 January 2026");
  });

  it("gives today's date in Accra as YYYY-MM-DD", () => {
    expect(todayInAccra(new Date("2026-10-09T23:30:00Z"))).toBe("2026-10-09");
  });
});
```

Run: `npm test`
Expected: FAIL — modules not found.

- [ ] **Step 2: Implement**

`frontend/src/lib/api.ts`:
```ts
import type { NewsPost, NewsSummary, PrivacyNotice, SiteData } from "./types";

/** Public pages are rebuilt at most every five minutes (ISR). */
export const REVALIDATE_SECONDS = 300;

function djangoOrigin(): string {
  return process.env.DJANGO_ORIGIN ?? "http://127.0.0.1:8000";
}

async function fetchJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${djangoOrigin()}${path}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Website API ${path} answered ${response.status}`);
  return (await response.json()) as T;
}

export async function getSite(): Promise<SiteData> {
  const site = await fetchJson<SiteData>("/api/public/site");
  if (!site) throw new Error("Website API is missing /api/public/site");
  return site;
}

export async function getNewsList(limit = 20): Promise<NewsSummary[]> {
  return (await fetchJson<NewsSummary[]>(`/api/public/news?limit=${limit}`)) ?? [];
}

export async function getNewsPost(slug: string): Promise<NewsPost | null> {
  return fetchJson<NewsPost>(`/api/public/news/${encodeURIComponent(slug)}`);
}

export async function getPrivacyNotice(): Promise<PrivacyNotice | null> {
  return fetchJson<PrivacyNotice>("/api/public/privacy-notice");
}

export function contentOf(site: SiteData, key: string, fallback = ""): string {
  return site.content[key] ?? fallback;
}
```

`frontend/src/lib/client-api.ts`:
```ts
import type { ApiErrorBody } from "./types";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | null;

  constructor(status: number, body: ApiErrorBody | null) {
    super(body?.message ?? `Request failed with status ${status}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

async function handle<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  throw new ApiRequestError(response.status, body);
}

export async function getJson<T>(path: string): Promise<T> {
  return handle<T>(await fetch(path, { headers: { Accept: "application/json" } }));
}

export async function postJson<T>(path: string, data: unknown): Promise<T> {
  return handle<T>(
    await fetch(path, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}
```

`frontend/src/lib/dates.ts`:
```ts
const DISPLAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Africa/Accra",
});

const ISO_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Accra",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatDate(iso: string): string {
  return DISPLAY.format(new Date(iso));
}

export function todayInAccra(now: Date = new Date()): string {
  return ISO_DAY.format(now);
}
```

`frontend/src/lib/site-url.ts`:
```ts
export function siteUrl(): string {
  return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
```

- [ ] **Step 3: Run checks**

```bash
npm test && npm run lint && npm run typecheck
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
cd /c/Dev/ad-smart-school
git add frontend
git commit -m "Add server and browser API clients and date helpers"
```

---

## Task 14: Site chrome — header, theme toggle, mobile menu, footer

**Files:**
- Create: `frontend/src/components/site/nav.ts`, `theme-toggle.tsx`, `header.tsx`, `mobile-menu.tsx`, `footer.tsx`, `preview-ribbon.tsx`, `skip-link.tsx`, `school-json-ld.tsx`, `offline-bar.tsx`
- Create: `frontend/src/app/(public)/layout.tsx`
- Test: `frontend/src/components/site/chrome.test.tsx`

**Interfaces:**
- Consumes: theme helpers (Task 11), `BrandLink`, `LogoMark`, `ButtonLink`, `Container` (Task 12), `getSite`, `contentOf`, `siteUrl` (Task 13).
- Produces:
  - `NAV_ITEMS` (About, Levels, Admissions, News, Contact) and `isActive(pathname, href)`.
  - `<ThemeToggle showLabels? className?>` — radio group "Colour theme" (Light / Dark / System), arrow keys move the choice, choice persists and is applied with a cross-fade.
  - `<Header schoolName portalUrl?>` — fixed; clear glass at the top of the page, frosted after 8 px of scroll; `aria-current="page"` on the active link; portal sign-in button only when `portalUrl` is set.
  - `<MobileMenu schoolName portalUrl? className?>` — Radix dialog sheet with navigation and a labelled theme toggle.
  - `<Footer site>`, `<PreviewRibbon>`, `<SkipLink>`, `<SchoolJsonLd school>` and `schoolJsonLd(school, url)`.
  - `<OfflineBar>` — a status message while the browser is offline (spec §10).
  - The `(public)` route-group layout: fetches the site once, sets `robots: noindex` while the site is not public, and renders skip link → header → offline bar → `<main id="main">` → footer → preview ribbon → JSON-LD.

- [ ] **Step 1: Write the failing tests**

`frontend/src/components/site/chrome.test.tsx`:
```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import type { SchoolInfo } from "@/lib/types";
import { Header } from "./header";
import { MobileMenu } from "./mobile-menu";
import { isActive } from "./nav";
import { OfflineBar } from "./offline-bar";
import { schoolJsonLd } from "./school-json-ld";
import { ThemeToggle } from "./theme-toggle";

describe("OfflineBar", () => {
  it("stays hidden online and appears while offline", () => {
    const { rerender } = render(<OfflineBar />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    const spy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    rerender(<OfflineBar key="offline" />);
    expect(screen.getByRole("status")).toHaveTextContent("You're offline");
    spy.mockRestore();
  });
});

describe("isActive", () => {
  it("matches a section and its children only", () => {
    expect(isActive("/news", "/news")).toBe(true);
    expect(isActive("/news/welcome", "/news")).toBe(true);
    expect(isActive("/newsletter", "/news")).toBe(false);
  });
});

describe("ThemeToggle", () => {
  it("starts on System and switches to Dark", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const group = screen.getByRole("radiogroup", { name: "Colour theme" });
    expect(within(group).getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");

    await user.click(within(group).getByRole("radio", { name: "Dark" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("adss-theme")).toBe("dark");
    expect(within(group).getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  });

  it("moves the choice with arrow keys", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("radio", { name: "Light" }));

    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveFocus();
  });
});

describe("Header", () => {
  it("marks the current section and hides sign-in until the portal exists", () => {
    vi.mocked(usePathname).mockReturnValue("/admissions");
    render(<Header schoolName="AD Smart School" />);

    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Admissions" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "About" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
  });

  it("shows the portal sign-in when configured", () => {
    render(<Header schoolName="AD Smart School" portalUrl="/sign-in" />);
    expect(screen.getAllByRole("link", { name: /sign in/i })[0]).toHaveAttribute("href", "/sign-in");
  });
});

describe("MobileMenu", () => {
  it("opens a menu with navigation and a labelled theme switch, and closes on navigation", async () => {
    const user = userEvent.setup();
    render(<MobileMenu schoolName="AD Smart School" />);

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    expect(within(dialog).getByRole("radio", { name: "Dark" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("link", { name: "News" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("schoolJsonLd", () => {
  it("describes the school for search engines", () => {
    const school = {
      name: "AD Smart School", founded_year: 2001, phone: "+233545875881", email: "a@b.c",
      town: "Kronom, Kumasi", region: "Ashanti Region",
    } as SchoolInfo;

    expect(schoolJsonLd(school, "https://example.test")).toMatchObject({
      "@type": "School",
      name: "AD Smart School",
      foundingDate: "2001",
      telephone: "+233545875881",
      address: { addressLocality: "Kronom, Kumasi", addressCountry: "GH" },
    });
  });
});
```

Run: `npm test`
Expected: FAIL — modules not found.

- [ ] **Step 2: Navigation and theme toggle**

`frontend/src/components/site/nav.ts`:
```ts
export const NAV_ITEMS = [
  { href: "/about", label: "About" },
  { href: "/levels", label: "Levels" },
  { href: "/admissions", label: "Admissions" },
  { href: "/news", label: "News" },
  { href: "/contact", label: "Contact" },
] as const;

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
```

`frontend/src/components/site/theme-toggle.tsx`:
```tsx
"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import {
  applyTheme,
  readStoredChoice,
  resolveTheme,
  storeChoice,
  subscribeToChoice,
  systemPrefersDark,
  type ThemeChoice,
} from "@/lib/theme";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

function selectTheme(choice: ThemeChoice) {
  storeChoice(choice);
  const theme = resolveTheme(choice, systemPrefersDark());
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as Document & { startViewTransition?: (update: () => void) => unknown };
  if (doc.startViewTransition && !reduceMotion) doc.startViewTransition(() => applyTheme(theme));
  else applyTheme(theme);
}

const serverChoice = (): ThemeChoice => "system";

export function ThemeToggle({ showLabels = false, className }: { showLabels?: boolean; className?: string }) {
  const choice = useSyncExternalStore(subscribeToChoice, readStoredChoice, serverChoice);

  // While on System, follow the device if it switches theme.
  useEffect(() => {
    if (choice !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => applyTheme(resolveTheme("system", media.matches));
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [choice]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = STEP[event.key];
    if (!step) return;
    event.preventDefault();
    const nextIndex = (index + step + OPTIONS.length) % OPTIONS.length;
    selectTheme(OPTIONS[nextIndex].value);
    const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios?.[nextIndex]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Colour theme" className={cn("inline-flex items-center gap-1 rounded-full p-1", className)}>
      {OPTIONS.map(({ value, label, Icon }, index) => {
        const checked = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={showLabels ? undefined : label}
            tabIndex={checked ? 0 : -1}
            onClick={() => selectTheme(value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "press inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-full px-3 text-sm font-medium",
              checked ? "bg-card text-ink shadow-elev-1" : "opacity-80 hover:opacity-100",
            )}
          >
            <Icon aria-hidden className="size-5" />
            {showLabels && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Header and mobile menu**

`frontend/src/components/site/header.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { BrandLink } from "@/components/brand/brand-link";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";
import { MobileMenu } from "./mobile-menu";
import { isActive, NAV_ITEMS } from "./nav";
import { ThemeToggle } from "./theme-toggle";

function subscribeToScroll(callback: () => void) {
  window.addEventListener("scroll", callback, { passive: true });
  return () => window.removeEventListener("scroll", callback);
}
const isScrolled = () => window.scrollY > 8;
const serverScrolled = () => false;

type Props = { schoolName: string; portalUrl?: string };

export function Header({ schoolName, portalUrl }: Props) {
  const pathname = usePathname();
  const scrolled = useSyncExternalStore(subscribeToScroll, isScrolled, serverScrolled);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 border-x-0 border-t-0",
        scrolled ? "glass-frosted text-ink shadow-elev-1" : "glass-clear on-dark text-white",
      )}
    >
      <Container className="flex h-18 items-center justify-between gap-3">
        <BrandLink name={schoolName} />
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium",
                      active && (scrolled ? "bg-indigo/10 text-indigo" : "bg-white/15"),
                      !active && (scrolled ? "hover:bg-ink/5" : "hover:bg-white/10"),
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle className={cn("hidden lg:inline-flex", scrolled ? "bg-ink/5" : "bg-white/10")} />
          {portalUrl && (
            <ButtonLink href={portalUrl} variant={scrolled ? "primary" : "glass"} className="px-4">
              <span className="sm:hidden">Sign in</span>
              <span className="hidden sm:inline">Portal sign in</span>
            </ButtonLink>
          )}
          <MobileMenu schoolName={schoolName} portalUrl={portalUrl} className="lg:hidden" />
        </div>
      </Container>
    </header>
  );
}
```

`frontend/src/components/site/mobile-menu.tsx`:
```tsx
"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { isActive, NAV_ITEMS } from "./nav";
import { ThemeToggle } from "./theme-toggle";

type Props = { schoolName: string; portalUrl?: string; className?: string };

export function MobileMenu({ schoolName, portalUrl, className }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = () => setOpen(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className={cn("press inline-flex size-11 cursor-pointer items-center justify-center rounded-control", className)}
        >
          <Menu aria-hidden className="size-6" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade-in fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content
          aria-describedby={undefined}
          className="glass-frosted animate-sheet-in fixed inset-y-0 right-0 z-50 flex w-[min(22rem,88vw)] flex-col gap-6 overflow-y-auto p-6 text-ink shadow-elev-2"
        >
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-lg font-semibold">Menu</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close menu" className="press inline-flex size-11 cursor-pointer items-center justify-center rounded-control hover:bg-ink/5">
                <X aria-hidden className="size-6" />
              </button>
            </Dialog.Close>
          </div>
          <p className="text-sm text-ink-muted">{schoolName}</p>
          <nav aria-label="Mobile">
            <ul className="space-y-1">
              {[{ href: "/", label: "Home" }, ...NAV_ITEMS].map((item) => {
                const active = item.href === "/" ? pathname === "/" : isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-12 items-center rounded-control px-4 text-lg font-medium",
                        active ? "bg-indigo/10 text-indigo" : "hover:bg-ink/5",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div>
            <p className="mb-2 text-sm font-medium text-ink-muted">Theme</p>
            <ThemeToggle showLabels className="bg-ink/5" />
          </div>
          {portalUrl && (
            <ButtonLink href={portalUrl} onClick={close} className="mt-auto">
              Portal sign in
            </ButtonLink>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 4: Footer, ribbon, skip link and structured data**

`frontend/src/components/site/footer.tsx`:
```tsx
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { Container } from "@/components/ui/container";
import { contentOf } from "@/lib/api";
import type { SiteData } from "@/lib/types";
import { NAV_ITEMS } from "./nav";

export function Footer({ site }: { site: SiteData }) {
  const { school } = site;
  const place = [school.address, school.town, school.region].filter(Boolean).join(", ");
  return (
    <footer className="border-t border-line bg-card pt-14 pb-24 sm:pb-14">
      <Container className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <span className="logo-tile">
              <LogoMark className="h-9 w-auto" />
            </span>
            <span className="text-lg font-semibold">{school.name}</span>
          </div>
          <p className="mt-3 max-w-sm text-ink-muted">{contentOf(site, "footer_tagline")}</p>
          {school.motto && <p className="mt-2 italic">“{school.motto}”</p>}
        </div>
        <nav aria-label="Footer">
          <h2 className="text-sm font-semibold tracking-wider text-ink-muted uppercase">Explore</h2>
          <ul className="mt-2">
            {[...NAV_ITEMS, { href: "/privacy", label: "Privacy notice" }].map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="inline-flex min-h-11 items-center hover:text-indigo">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-ink-muted uppercase">Contact</h2>
          <address className="mt-3 space-y-2 not-italic">
            <p>{place}</p>
            <p>
              <a className="link inline-flex min-h-11 items-center" href={`tel:${school.phone}`}>
                {school.phone_display}
              </a>
            </p>
            {school.whatsapp_link && (
              <p>
                <a className="link inline-flex min-h-11 items-center" href={school.whatsapp_link} rel="noopener">
                  Chat on WhatsApp
                </a>
              </p>
            )}
            <p>
              <a className="link inline-flex min-h-11 items-center break-all" href={`mailto:${school.email}`}>
                {school.email}
              </a>
            </p>
          </address>
        </div>
      </Container>
      <Container className="mt-10 text-sm text-ink-muted">
        © {new Date().getFullYear()} {school.name}. All rights reserved.
      </Container>
    </footer>
  );
}
```

`frontend/src/components/site/preview-ribbon.tsx`:
```tsx
export function PreviewRibbon() {
  return (
    <div
      role="note"
      className="glass-frosted pointer-events-none fixed bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap text-ink shadow-elev-2"
    >
      <span aria-hidden className="mr-2 inline-block size-2 rounded-full bg-amber" />
      Preview: not yet public
    </div>
  );
}
```

`frontend/src/components/site/offline-bar.tsx`:
```tsx
"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
const isOnline = () => navigator.onLine;
const serverOnline = () => true;

export function OfflineBar() {
  const online = useSyncExternalStore(subscribe, isOnline, serverOnline);
  if (online) return null;
  return (
    <div
      role="status"
      className="glass-frosted fixed inset-x-3 top-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-full px-4 py-2 text-sm font-medium text-ink shadow-elev-2"
    >
      <WifiOff aria-hidden className="size-4 shrink-0 text-danger" />
      You&apos;re offline. Pages you have already opened still work.
    </div>
  );
}
```

`frontend/src/components/site/skip-link.tsx`:
```tsx
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-control focus:bg-card focus:px-4 focus:py-3 focus:text-ink focus:shadow-elev-2"
    >
      Skip to main content
    </a>
  );
}
```

`frontend/src/components/site/school-json-ld.tsx`:
```tsx
import { siteUrl } from "@/lib/site-url";
import type { SchoolInfo } from "@/lib/types";

export function schoolJsonLd(school: SchoolInfo, url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "School",
    name: school.name,
    url,
    foundingDate: String(school.founded_year),
    telephone: school.phone,
    email: school.email,
    address: {
      "@type": "PostalAddress",
      addressLocality: school.town,
      addressRegion: school.region,
      addressCountry: "GH",
    },
  };
}

export function SchoolJsonLd({ school }: { school: SchoolInfo }) {
  const json = JSON.stringify(schoolJsonLd(school, siteUrl())).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
```

- [ ] **Step 5: The public layout**

`frontend/src/app/(public)/layout.tsx`:
```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { OfflineBar } from "@/components/site/offline-bar";
import { PreviewRibbon } from "@/components/site/preview-ribbon";
import { SchoolJsonLd } from "@/components/site/school-json-ld";
import { SkipLink } from "@/components/site/skip-link";
import { getSite } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  // Preview pages must never be indexed (spec §6.5).
  return { robots: site.is_public ? { index: true, follow: true } : { index: false, follow: false } };
}

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const site = await getSite();
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL || undefined;
  return (
    <>
      <SkipLink />
      <Header schoolName={site.school.name} portalUrl={portalUrl} />
      <OfflineBar />
      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <Footer site={site} />
      {!site.is_public && <PreviewRibbon />}
      <SchoolJsonLd school={site.school} />
    </>
  );
}
```

- [ ] **Step 6: Run checks**

```bash
npm test && npm run lint && npm run typecheck
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
cd /c/Dev/ad-smart-school
git add frontend
git commit -m "Add site header, theme toggle, mobile menu and footer"
```

---

## Task 15: Home page

**Files:**
- Create: `frontend/src/lib/edge-drag.ts`, `frontend/src/lib/use-swipe-down.ts`
- Create: `frontend/src/components/site/card-rail.tsx`, `frontend/src/components/site/news-cards.tsx`
- Create: `frontend/src/components/site/home/hero.tsx`, `proof-strip.tsx`, `levels-section.tsx`, `for-parents.tsx`, `gallery.tsx`, `lightbox.tsx`, `admissions-cta.tsx`
- Create: `frontend/src/app/(public)/page.tsx`
- Create: `frontend/src/test/site-fixture.ts` (test data only)
- Create: `.claude/launch.json` (local preview servers)
- Test: `frontend/src/lib/edge-drag.test.ts`, `frontend/src/components/site/home/home.test.tsx`, `frontend/src/components/site/home/gallery.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 11–14; content keys from Task 9.
- Produces:
  - `EDGE_DEAD_ZONE = 24`, `edgeSafeDrag(api, event): boolean` (Embla `watchDrag`).
  - `useSwipeDown(onClose)` → `{ offset: number, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } }` — calls `onClose` after a mostly-vertical downward drag of more than 110 px.
  - `<CardRail label className?>` — snap-scrolling row with back/forward buttons below `lg`, a 3-column grid from `lg`.
  - `<NewsCard post>`, `<NewsSection posts>` (renders nothing for an empty list).
  - Home sections `<Hero site>`, `<ProofStrip facts overlap?>`, `<LevelsSection site>`, `<ForParents site>`, `<Gallery photos className?>`, `<Lightbox photos index onClose>`, `<AdmissionsCta site>`.
  - Test helper `makeSite(overrides?: Partial<SiteData>): SiteData`.

Blur budget (spec §8.2, at most 3 blurred layers): `glass-*` classes are used only for the header, the hero card, the two fact cards, the closing call-to-action, menus and dialogs. Cards on plain backgrounds use `surface` (frosted look, no blur). Gallery captions use a gradient, not glass.

- [ ] **Step 1: Write the failing tests**

`frontend/src/test/site-fixture.ts`:
```ts
import type { SiteData } from "@/lib/types";

const LEVEL_CONTENT = Object.fromEntries(
  ["creche", "nursery", "kg", "lower_primary", "upper_primary", "jhs"].flatMap((code) => [
    [`level_${code}_ages`, `Ages for ${code}`],
    [`level_${code}_summary`, `Summary for ${code}`],
    [`level_${code}_detail`, `Detail for ${code}`],
  ]),
);

export function makeSite(overrides: Partial<SiteData> = {}): SiteData {
  return {
    school: {
      name: "AD Smart School",
      motto: "",
      founded_year: 2001,
      years_since_founding: 25,
      address: "",
      town: "Kronom, Kumasi",
      region: "Ashanti Region",
      ghana_post_gps: "",
      phone: "+233545875881",
      phone_display: "054 587 5881",
      whatsapp_link: "https://wa.me/233545875881",
      email: "school@example.com",
      map_query: "Kronom, Kumasi, Ghana",
    },
    is_public: false,
    content: {
      hero_headline: "Bright beginnings, from Crèche to JHS",
      hero_subline: "Kronom, Kumasi · Since 2001",
      hero_intro: "A caring school.",
      levels_intro: "One school for every stage.",
      for_parents_intro: "Close to your child's day.",
      admissions_cta_heading: "Come and visit us",
      admissions_cta_text: "We'd love to show you around.",
      ...LEVEL_CONTENT,
    },
    facts: [{ label: "years serving Kronom", value: "25" }],
    features: [],
    photos: {},
    gallery: [],
    ...overrides,
  };
}

export const photo = (n: number) => ({
  src: `/media/p${n}-960w.webp`,
  srcset: `/media/p${n}-480w.webp 480w, /media/p${n}-960w.webp 960w`,
  width: 960,
  height: 720,
  alt: `Photo number ${n}`,
  caption: `Caption ${n}`,
  is_placeholder: true,
});
```

`frontend/src/lib/edge-drag.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { edgeSafeDrag } from "./edge-drag";

describe("edgeSafeDrag", () => {
  it("ignores drags that start within 24px of either screen edge", () => {
    expect(edgeSafeDrag(null, new MouseEvent("pointerdown", { clientX: 10 }))).toBe(false);
    expect(edgeSafeDrag(null, new MouseEvent("pointerdown", { clientX: window.innerWidth - 10 }))).toBe(false);
  });

  it("allows drags that start elsewhere", () => {
    expect(edgeSafeDrag(null, new MouseEvent("pointerdown", { clientX: 200 }))).toBe(true);
  });
});
```

`frontend/src/components/site/home/home.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CardRail } from "@/components/site/card-rail";
import { makeSite, photo } from "@/test/site-fixture";
import { ForParents } from "./for-parents";
import { Hero } from "./hero";
import { LevelsSection } from "./levels-section";

describe("Hero", () => {
  it("falls back to the brand gradient when there is no hero photo", () => {
    render(<Hero site={makeSite()} />);
    expect(screen.getByTestId("hero-fallback")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bright beginnings");
    expect(screen.getByRole("link", { name: "Apply for admission" })).toHaveAttribute("href", "/admissions#enquiry");
  });

  it("loads the hero photo eagerly", () => {
    render(<Hero site={makeSite({ photos: { hero: photo(1) } })} />);
    expect(screen.getByRole("img", { name: "Photo number 1" })).toHaveAttribute("loading", "eager");
  });
});

describe("ForParents", () => {
  it("renders nothing without features", () => {
    const { container } = render(<ForParents site={makeSite()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the enabled features", () => {
    const features = [{ key: "sms", title: "Updates by SMS", text: "On any phone.", icon: "message" as const }];
    render(<ForParents site={makeSite({ features })} />);
    expect(screen.getByRole("heading", { name: "Updates by SMS" })).toBeInTheDocument();
  });
});

describe("LevelsSection", () => {
  it("shows all six levels with their category in words", () => {
    render(<LevelsSection site={makeSite()} />);
    expect(screen.getAllByRole("article")).toHaveLength(6);
    expect(screen.getAllByText("Early Years")).toHaveLength(3);
    expect(screen.getByRole("link", { name: /More about JHS/ })).toHaveAttribute("href", "/levels#jhs");
  });
});

describe("CardRail", () => {
  it("offers buttons as an alternative to swiping", async () => {
    const user = userEvent.setup();
    render(
      <CardRail label="School levels">
        <p>One</p>
        <p>Two</p>
      </CardRail>,
    );
    await user.click(screen.getByRole("button", { name: "Scroll School levels forward" }));
    expect(Element.prototype.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
  });
});
```

`frontend/src/components/site/home/gallery.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { photo } from "@/test/site-fixture";
import { Gallery } from "./gallery";
import { Lightbox } from "./lightbox";

const photos = [photo(1), photo(2), photo(3)];

describe("Gallery", () => {
  it("opens the photo viewer and closes it with the close button", async () => {
    const user = userEvent.setup();
    render(<Gallery photos={photos} />);

    await user.click(screen.getByRole("button", { name: "Open photo: Caption 2" }));
    expect(screen.getByRole("dialog", { name: "Photo viewer" })).toBeInTheDocument();
    expect(screen.getByText("Photo 2 of 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close photo viewer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Lightbox", () => {
  it("closes when swiped down", () => {
    const onClose = vi.fn();
    render(<Lightbox photos={photos} index={0} onClose={onClose} />);
    const surface = screen.getByTestId("lightbox-swipe");

    fireEvent.pointerDown(surface, { clientX: 200, clientY: 100 });
    fireEvent.pointerMove(surface, { clientX: 205, clientY: 260 });
    fireEvent.pointerUp(surface, { clientX: 205, clientY: 260 });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores sideways drags", () => {
    const onClose = vi.fn();
    render(<Lightbox photos={photos} index={0} onClose={onClose} />);
    const surface = screen.getByTestId("lightbox-swipe");

    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 160 });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 160 });

    expect(onClose).not.toHaveBeenCalled();
  });
});
```

Run: `npm test`
Expected: FAIL — modules not found.

- [ ] **Step 2: Swipe helpers**

`frontend/src/lib/edge-drag.ts`:
```ts
export const EDGE_DEAD_ZONE = 24;

/** Embla `watchDrag`: let the phone's own edge gestures (back, app menus) win (spec §8.5). */
export function edgeSafeDrag(_api: unknown, event: MouseEvent | TouchEvent): boolean {
  const x = "touches" in event ? (event.touches[0]?.clientX ?? 0) : event.clientX;
  return x > EDGE_DEAD_ZONE && x < window.innerWidth - EDGE_DEAD_ZONE;
}
```

`frontend/src/lib/use-swipe-down.ts`:
```ts
"use client";

import { useRef, useState, type PointerEvent } from "react";

const START_THRESHOLD = 12;
const CLOSE_DISTANCE = 110;

/** Swipe down to dismiss (spec §8.5). Always pair with a visible close button. */
export function useSwipeDown(onClose: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const tracking = useRef(false);
  const [offset, setOffset] = useState(0);

  function reset() {
    start.current = null;
    tracking.current = false;
    setOffset(0);
  }

  return {
    offset,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        start.current = { x: event.clientX, y: event.clientY };
        tracking.current = false;
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        if (!start.current) return;
        const dx = event.clientX - start.current.x;
        const dy = event.clientY - start.current.y;
        if (!tracking.current) {
          if (dy > START_THRESHOLD && dy > Math.abs(dx)) tracking.current = true;
          else return;
        }
        setOffset(Math.max(0, dy));
      },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        const shouldClose =
          tracking.current && start.current !== null && event.clientY - start.current.y > CLOSE_DISTANCE;
        reset();
        if (shouldClose) onClose();
      },
      onPointerCancel() {
        reset();
      },
    },
  };
}
```

- [ ] **Step 3: Rails and news cards**

`frontend/src/components/site/card-rail.tsx`:
```tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Children, useRef, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/motion";

type Props = { label: string; children: ReactNode; className?: string };

const ARROW =
  "press surface inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-ink";

/** Swipeable row on phones (with buttons as the alternative), grid on large screens. */
export function CardRail({ label, children, className }: Props) {
  const listRef = useRef<HTMLUListElement>(null);

  function scrollByPage(direction: 1 | -1) {
    const list = listRef.current;
    if (!list) return;
    list.scrollBy({
      left: direction * list.clientWidth * 0.85,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  return (
    <div className={className}>
      <ul
        ref={listRef}
        aria-label={label}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0"
      >
        {Children.map(children, (child) => (
          <li className="w-[82%] shrink-0 snap-start sm:w-[46%] lg:w-auto">{child}</li>
        ))}
      </ul>
      <div className="mt-3 flex justify-end gap-2 lg:hidden">
        <button type="button" className={ARROW} aria-label={`Scroll ${label} back`} onClick={() => scrollByPage(-1)}>
          <ChevronLeft aria-hidden className="size-5" />
        </button>
        <button type="button" className={ARROW} aria-label={`Scroll ${label} forward`} onClick={() => scrollByPage(1)}>
          <ChevronRight aria-hidden className="size-5" />
        </button>
      </div>
    </div>
  );
}
```

`frontend/src/components/site/news-cards.tsx`:
```tsx
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { SectionHeading } from "@/components/ui/section-heading";
import { formatDate } from "@/lib/dates";
import type { NewsSummary } from "@/lib/types";
import { CardRail } from "./card-rail";

export function NewsCard({ post }: { post: NewsSummary }) {
  return (
    <article className="surface relative flex h-full flex-col overflow-hidden rounded-card shadow-elev-1">
      {post.cover ? (
        <ResponsiveImage
          image={post.cover}
          sizes="(min-width: 1024px) 33vw, 85vw"
          className="aspect-[16/9] w-full object-cover"
        />
      ) : (
        <div aria-hidden className="bg-brand-mesh aspect-[16/9] w-full" />
      )}
      <div className="flex flex-1 flex-col p-6">
        <p className="text-sm text-ink-muted">
          <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>
        </p>
        <h3 className="mt-2 text-lg font-semibold">
          <Link href={`/news/${post.slug}`} className="after:absolute after:inset-0 hover:text-indigo">
            {post.title}
          </Link>
        </h3>
        <p className="mt-2 flex-1 text-ink-muted">{post.summary}</p>
      </div>
    </article>
  );
}

export function NewsSection({ posts }: { posts: NewsSummary[] }) {
  if (posts.length === 0) return null;
  return (
    <section aria-labelledby="news-title" className="py-20 sm:py-28">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading id="news-title" eyebrow="News" title="Latest from the school" />
          <Link href="/news" className="link inline-flex min-h-11 items-center font-medium">
            All news
          </Link>
        </div>
        <CardRail label="Latest news" className="mt-10">
          {posts.map((post) => (
            <NewsCard key={post.slug} post={post} />
          ))}
        </CardRail>
      </Container>
    </section>
  );
}
```

- [ ] **Step 4: Home sections**

`frontend/src/components/site/home/hero.tsx`:
```tsx
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { contentOf } from "@/lib/api";
import type { SiteData } from "@/lib/types";

export function Hero({ site }: { site: SiteData }) {
  const photo = site.photos.hero;
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[88svh] items-end overflow-hidden pt-28 pb-20 sm:min-h-[680px] sm:items-center"
    >
      {photo ? (
        <ResponsiveImage
          image={photo}
          sizes="100vw"
          priority
          className="absolute inset-0 -z-20 size-full object-cover"
        />
      ) : (
        <div data-testid="hero-fallback" className="bg-brand-mesh absolute inset-0 -z-20" />
      )}
      <div aria-hidden className="scrim absolute inset-0 -z-10" />
      <Container>
        <div className="glass-clear on-dark animate-rise max-w-2xl rounded-card p-6 text-white sm:p-10">
          <p className="flex items-center gap-2 text-sm font-semibold tracking-wider uppercase">
            <span aria-hidden className="h-1 w-6 rounded-full bg-amber" />
            {contentOf(site, "hero_subline")}
          </p>
          <h1 id="hero-title" className="mt-3 text-4xl font-bold sm:text-5xl">
            {contentOf(site, "hero_headline", site.school.name)}
          </h1>
          <p className="mt-4 text-lg text-white/90">{contentOf(site, "hero_intro")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/admissions#enquiry" variant="amber" size="lg">
              Apply for admission
            </ButtonLink>
            <ButtonLink href="/admissions#enquiry" variant="glass" size="lg">
              Book a school visit
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
```

`frontend/src/components/site/home/proof-strip.tsx`:
```tsx
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";
import type { Fact } from "@/lib/types";

export function ProofStrip({ facts, overlap = true }: { facts: Fact[]; overlap?: boolean }) {
  if (facts.length === 0) return null;
  return (
    <section aria-label="At a glance" className={cn("relative z-10", overlap ? "-mt-12" : "py-8")}>
      <Container>
        <dl className="grid gap-4 sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className="glass-frosted flex flex-col-reverse rounded-card p-6 shadow-elev-2">
              <dt className="text-ink-muted">{fact.label}</dt>
              <dd className="text-3xl font-bold text-indigo tabular-nums">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
```

`frontend/src/components/site/home/levels-section.tsx`:
```tsx
import Link from "next/link";
import { SwingIn } from "@/components/motion/swing-in";
import { CardRail } from "@/components/site/card-rail";
import { CategoryBadge } from "@/components/ui/category-badge";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { contentOf } from "@/lib/api";
import { LEVELS } from "@/lib/levels";
import type { SiteData } from "@/lib/types";

export function LevelsSection({ site }: { site: SiteData }) {
  return (
    <section aria-labelledby="levels-title" className="relative isolate overflow-hidden py-20 sm:py-28">
      <div
        aria-hidden
        className="bg-brand-mesh pointer-events-none absolute -top-24 right-[-10%] -z-10 size-[28rem] rounded-full opacity-15 blur-3xl lite:hidden"
      />
      <Container>
        <SectionHeading
          id="levels-title"
          eyebrow="Our levels"
          title="From first steps to the BECE"
          intro={contentOf(site, "levels_intro")}
        />
        <CardRail label="School levels" className="mt-10">
          {LEVELS.map((level, index) => (
            <SwingIn key={level.code} index={index} className="h-full">
              <article className="surface flex h-full flex-col rounded-card p-6 shadow-elev-1">
                <CategoryBadge category={level.category} className="self-start" />
                <h3 className="mt-4 text-xl font-semibold">{level.name}</h3>
                <p className="mt-1 text-sm font-medium text-ink-muted">
                  {contentOf(site, `level_${level.code}_ages`)}
                </p>
                <p className="mt-3 flex-1">{contentOf(site, `level_${level.code}_summary`)}</p>
                <Link href={`/levels#${level.code}`} className="link mt-4 inline-flex min-h-11 items-center font-medium">
                  More about {level.shortName}
                  <span aria-hidden>&nbsp;→</span>
                </Link>
              </article>
            </SwingIn>
          ))}
        </CardRail>
      </Container>
    </section>
  );
}
```

`frontend/src/components/site/home/for-parents.tsx`:
```tsx
import { HeartHandshake, MessageSquareText, ShieldCheck, Smartphone, type LucideIcon } from "lucide-react";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { contentOf } from "@/lib/api";
import type { FeatureIcon, SiteData } from "@/lib/types";

const ICONS: Record<FeatureIcon, LucideIcon> = {
  message: MessageSquareText,
  phone: Smartphone,
  care: HeartHandshake,
  shield: ShieldCheck,
};

/** Only features the admin has switched on (i.e. live) are shown (spec §6.2). */
export function ForParents({ site }: { site: SiteData }) {
  if (site.features.length === 0) return null;
  return (
    <section aria-labelledby="parents-title" className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          id="parents-title"
          eyebrow="For parents"
          title="Close to your child's school day"
          intro={contentOf(site, "for_parents_intro")}
        />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {site.features.map((feature) => {
            const Icon = ICONS[feature.icon];
            return (
              <li key={feature.key} className="surface rounded-card p-6">
                <span className="inline-flex size-12 items-center justify-center rounded-control bg-indigo/10 text-indigo">
                  <Icon aria-hidden className="size-6" />
                </span>
                <h3 className="mt-4 font-semibold">{feature.title}</h3>
                <p className="mt-2 text-ink-muted">{feature.text}</p>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
```

`frontend/src/components/site/home/lightbox.tsx`:
```tsx
"use client";

import * as Dialog from "@radix-ui/react-dialog";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { edgeSafeDrag } from "@/lib/edge-drag";
import type { Photo } from "@/lib/types";
import { useSwipeDown } from "@/lib/use-swipe-down";

type Props = { photos: Photo[]; index: number | null; onClose: () => void };

const ROUND_BUTTON =
  "press inline-flex size-12 cursor-pointer items-center justify-center rounded-full bg-white/10 hover:bg-white/20";

export function Lightbox({ photos, index, onClose }: Props) {
  return (
    <Dialog.Root open={index !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade-in fixed inset-0 z-50 bg-black/90" />
        <Dialog.Content aria-describedby={undefined} className="on-dark fixed inset-0 z-50 flex flex-col text-white outline-none">
          <Dialog.Title className="sr-only">Photo viewer</Dialog.Title>
          {index !== null && <LightboxBody photos={photos} startIndex={index} onClose={onClose} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function LightboxBody({ photos, startIndex, onClose }: { photos: Photo[]; startIndex: number; onClose: () => void }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ startIndex, watchDrag: edgeSafeDrag });
  const [selected, setSelected] = useState(startIndex);
  const swipe = useSwipeDown(onClose);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      emblaApi?.scrollNext();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      emblaApi?.scrollPrev();
    }
  }

  return (
    <div className="flex h-full flex-col" onKeyDown={onKeyDown}>
      <div className="flex items-center justify-between gap-4 p-4">
        <p aria-live="polite" className="text-sm tabular-nums">
          Photo {selected + 1} of {photos.length}
        </p>
        <Dialog.Close asChild>
          <button type="button" aria-label="Close photo viewer" className={ROUND_BUTTON}>
            <X aria-hidden className="size-6" />
          </button>
        </Dialog.Close>
      </div>
      <div
        data-testid="lightbox-swipe"
        className="min-h-0 flex-1 touch-none"
        style={{
          transform: swipe.offset ? `translateY(${swipe.offset}px)` : undefined,
          opacity: swipe.offset ? Math.max(0.4, 1 - swipe.offset / 400) : undefined,
        }}
        {...swipe.handlers}
      >
        <div ref={emblaRef} className="h-full overflow-hidden">
          <div className="flex h-full">
            {photos.map((photo) => (
              <figure key={photo.src} className="flex min-w-0 flex-[0_0_100%] flex-col items-center justify-center px-4">
                <ResponsiveImage image={photo} sizes="100vw" className="max-h-[72svh] w-auto max-w-full rounded-card object-contain" />
                {photo.caption && <figcaption className="mt-3 text-center text-white/90">{photo.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button type="button" aria-label="Previous photo" className={ROUND_BUTTON} onClick={() => emblaApi?.scrollPrev()}>
          <ChevronLeft aria-hidden className="size-6" />
        </button>
        <button type="button" aria-label="Next photo" className={ROUND_BUTTON} onClick={() => emblaApi?.scrollNext()}>
          <ChevronRight aria-hidden className="size-6" />
        </button>
      </div>
    </div>
  );
}
```

`frontend/src/components/site/home/gallery.tsx`:
```tsx
"use client";

import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { edgeSafeDrag } from "@/lib/edge-drag";
import type { Photo } from "@/lib/types";
import { Lightbox } from "./lightbox";

const ARROW =
  "press surface inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-ink disabled:cursor-not-allowed disabled:opacity-40";

export function Gallery({ photos, className }: { photos: Photo[]; className?: string }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", watchDrag: edgeSafeDrag });
  const [selected, setSelected] = useState(0);
  const [, setLayoutVersion] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    const onReInit = () => setLayoutVersion((version) => version + 1);
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onReInit);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onReInit);
    };
  }, [emblaApi]);

  const snapCount = emblaApi?.scrollSnapList().length ?? photos.length;

  return (
    <div className={className}>
      <div ref={emblaRef} className="overflow-hidden">
        <ul aria-label="Photos" className="-ml-4 flex touch-pan-y">
          {photos.map((photo, index) => (
            <li key={photo.src} className="min-w-0 flex-[0_0_85%] pl-4 sm:flex-[0_0_48%] lg:flex-[0_0_33.333%]">
              <button
                type="button"
                onClick={() => setLightboxIndex(index)}
                aria-label={`Open photo: ${photo.caption || photo.alt}`}
                className="group relative block w-full cursor-pointer overflow-hidden rounded-card"
              >
                <ResponsiveImage
                  image={photo}
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 48vw, 85vw"
                  className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                {photo.caption && (
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 pt-10 pb-3 text-left text-sm font-medium text-white">
                    {photo.caption}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-sm text-ink-muted tabular-nums" aria-live="polite">
          {selected + 1} / {snapCount}
        </p>
        <div className="flex gap-2">
          <button type="button" className={ARROW} aria-label="Previous photos" disabled={!emblaApi?.canScrollPrev()} onClick={() => emblaApi?.scrollPrev()}>
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <button type="button" className={ARROW} aria-label="Next photos" disabled={emblaApi ? !emblaApi.canScrollNext() : false} onClick={() => emblaApi?.scrollNext()}>
            <ChevronRight aria-hidden className="size-5" />
          </button>
        </div>
      </div>
      <Lightbox photos={photos} index={lightboxIndex} onClose={() => setLightboxIndex(null)} />
    </div>
  );
}
```

`frontend/src/components/site/home/admissions-cta.tsx`:
```tsx
import { Phone } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { contentOf } from "@/lib/api";
import type { SiteData } from "@/lib/types";

export function AdmissionsCta({ site }: { site: SiteData }) {
  return (
    <section aria-labelledby="visit-title" className="bg-brand-mesh on-dark relative overflow-hidden py-20 text-white sm:py-28">
      <Container>
        <div className="glass-clear mx-auto max-w-3xl rounded-card p-8 text-center sm:p-12">
          <h2 id="visit-title" className="text-3xl font-bold sm:text-4xl">
            {contentOf(site, "admissions_cta_heading")}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/90">{contentOf(site, "admissions_cta_text")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/admissions#enquiry" variant="amber" size="lg">
              Apply for admission
            </ButtonLink>
            <ButtonLink href={`tel:${site.school.phone}`} variant="glass" size="lg">
              <Phone aria-hidden className="size-5" />
              Call {site.school.phone_display}
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
```

- [ ] **Step 5: The home page**

`frontend/src/app/(public)/page.tsx`:
```tsx
import { AdmissionsCta } from "@/components/site/home/admissions-cta";
import { ForParents } from "@/components/site/home/for-parents";
import { Gallery } from "@/components/site/home/gallery";
import { Hero } from "@/components/site/home/hero";
import { LevelsSection } from "@/components/site/home/levels-section";
import { ProofStrip } from "@/components/site/home/proof-strip";
import { NewsSection } from "@/components/site/news-cards";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { contentOf, getNewsList, getSite } from "@/lib/api";

export const revalidate = 300;

export default async function HomePage() {
  const [site, news] = await Promise.all([getSite(), getNewsList(3)]);
  return (
    <>
      <Hero site={site} />
      <ProofStrip facts={site.facts} />
      <LevelsSection site={site} />
      <ForParents site={site} />
      {site.gallery.length > 0 && (
        <section aria-labelledby="gallery-title" className="py-20 sm:py-28">
          <Container>
            <SectionHeading
              id="gallery-title"
              eyebrow="Around the school"
              title="A look inside"
              intro={contentOf(site, "gallery_intro")}
            />
            <Gallery photos={site.gallery} className="mt-10" />
          </Container>
        </section>
      )}
      <NewsSection posts={news} />
      <AdmissionsCta site={site} />
    </>
  );
}
```

- [ ] **Step 6: Run the unit checks**

```bash
npm test && npm run lint && npm run typecheck
```
Expected: all pass.

- [ ] **Step 7: See it running**

`.claude/launch.json` (repository root):
```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "backend",
      "runtimeExecutable": "backend/.venv/Scripts/python.exe",
      "runtimeArgs": ["backend/manage.py", "runserver", "127.0.0.1:8000"],
      "port": 8000
    },
    {
      "name": "frontend",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["--prefix", "frontend", "run", "dev"],
      "port": 3000
    }
  ]
}
```

Start `backend` then `frontend`, open `http://localhost:3000/` and check, at **375 px** and **1440 px**, in **light and dark**:
- the logo matches `docs/brand/ad-smart-school-logo.png` (shapes, colours, gem position) and the gem swings once on load and on hover;
- the hero photo, dark-tinted clear-glass card and amber button are readable; the header turns frosted after scrolling;
- level cards swing in as they scroll into view; the rail buttons move the rail on phones;
- the gallery swipes (not from the screen edge), the arrows work, a photo opens the viewer, the viewer swipes, arrow keys work, swipe-down and Esc close it;
- the "Preview: not yet public" ribbon shows; no horizontal scrolling at 375 px.
Fix anything that is off before committing (adjust the logo arc end angles in `logo-mark.tsx` if a segment visibly differs from the PNG).

- [ ] **Step 8: Commit**

```bash
cd /c/Dev/ad-smart-school
git add frontend .claude/launch.json
git commit -m "Build the home page with hero, levels, gallery and news"
```

---

## Task 16: Inner pages and the enquiry form

**Files:**
- Create: `frontend/src/lib/enquiry-schema.ts`
- Create: `frontend/src/components/site/page-hero.tsx`, `field.tsx`, `enquiry-form.tsx`, `map-embed.tsx`
- Create: `frontend/src/app/(public)/about/page.tsx`, `levels/page.tsx`, `admissions/page.tsx`, `news/page.tsx`, `news/[slug]/page.tsx`, `contact/page.tsx`, `privacy/page.tsx`
- Create: `frontend/src/app/not-found.tsx`
- Test: `frontend/src/lib/enquiry-schema.test.ts`, `frontend/src/components/site/enquiry-form.test.tsx`, `frontend/src/components/site/map-embed.test.tsx`

**Interfaces:**
- Consumes: Tasks 11–15; enquiry API from Task 8.
- Produces:
  - `buildEnquirySchema(today: string)` (Zod), `EnquiryValues`, `EMPTY_ENQUIRY`, `LEVEL_CODES`, `toPayload(values, formToken, honeypot)` → API body (`preferred_visit_date: null` when blank).
  - `<PageHero eyebrow? title intro?>`, `<Field id label hint? error? required? className?>{(inputProps) => …}</Field>`, `inputClasses`.
  - `<EnquiryForm schoolPhone>` — fetches a form token on mount; error summary (focused, linked to fields) after a failed submit; server field errors mapped onto fields; friendly messages for `form_expired`, `too_fast`, `too_many_enquiries`, throttling and network failure (always offering the school's phone number); focused success message.
  - `<MapEmbed query schoolName>` — loads Google Maps only after "Show map" is pressed.
  - Pages: `/about`, `/levels` (anchors `#creche` … `#jhs`), `/admissions` (anchor `#enquiry`), `/news`, `/news/[slug]`, `/contact`, `/privacy`; root `not-found`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/enquiry-schema.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildEnquirySchema, EMPTY_ENQUIRY, toPayload } from "./enquiry-schema";

const today = "2026-10-09";
const schema = buildEnquirySchema(today);
const valid = {
  ...EMPTY_ENQUIRY,
  parent_name: "Akua Mensah",
  phone: "024 123 4567",
  child_name: "Ama Mensah",
  child_date_of_birth: "2020-03-14",
  level_wanted: "lower_primary",
  data_consent: true,
};

function errorsFor(values: typeof valid) {
  const result = schema.safeParse(values);
  return result.success ? {} : result.error.flatten().fieldErrors;
}

describe("enquiry schema", () => {
  it("accepts a complete enquiry", () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it.each(["0241234567", "024-123-4567", "+233241234567", "233 24 123 4567"])("accepts the phone %s", (phone) => {
    expect(errorsFor({ ...valid, phone }).phone).toBeUndefined();
  });

  it("rejects landlines and nonsense phone numbers", () => {
    expect(errorsFor({ ...valid, phone: "0302123456" }).phone).toBeDefined();
    expect(errorsFor({ ...valid, phone: "12345" }).phone).toBeDefined();
  });

  it("checks the date of birth", () => {
    expect(errorsFor({ ...valid, child_date_of_birth: "" }).child_date_of_birth).toEqual(["Enter your child's date of birth."]);
    expect(errorsFor({ ...valid, child_date_of_birth: "2026-10-10" }).child_date_of_birth).toEqual(["Date of birth can't be in the future."]);
    expect(errorsFor({ ...valid, child_date_of_birth: "2007-01-01" }).child_date_of_birth).toBeDefined();
  });

  it("requires consent and a level", () => {
    const errors = errorsFor({ ...valid, data_consent: false, level_wanted: "" });
    expect(errors.data_consent).toBeDefined();
    expect(errors.level_wanted).toBeDefined();
  });

  it("only allows visit dates from today", () => {
    expect(errorsFor({ ...valid, preferred_visit_date: "2026-10-08" }).preferred_visit_date).toBeDefined();
    expect(errorsFor({ ...valid, preferred_visit_date: "2026-10-09" }).preferred_visit_date).toBeUndefined();
  });

  it("sends a blank visit date as null with the token and honeypot", () => {
    expect(toPayload(valid, "tok", "")).toMatchObject({ preferred_visit_date: null, form_token: "tok", website: "" });
  });
});
```

`frontend/src/components/site/enquiry-form.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnquiryForm } from "./enquiry-form";

type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };
const json = (status: number, body: unknown): Reply => ({ ok: status < 400, status, json: async () => body });

function mockApi({ token = "tok" as string | null, reply = json(201, { status: "received" }) } = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/form-token")) {
      if (token === null) throw new TypeError("Failed to fetch");
      return json(200, { token });
    }
    return reply;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function fillValidForm(user: UserEvent) {
  await user.type(screen.getByLabelText(/your name/i), "Akua Mensah");
  await user.type(screen.getByLabelText(/mobile number/i), "024 123 4567");
  await user.type(screen.getByLabelText(/child's name/i), "Ama Mensah");
  fireEvent.change(screen.getByLabelText(/date of birth/i), { target: { value: "2019-05-01" } });
  await user.selectOptions(screen.getByLabelText(/^level/i), "lower_primary");
  await user.click(screen.getByLabelText(/I agree/i));
}

afterEach(() => vi.unstubAllGlobals());

describe("EnquiryForm", () => {
  it("shows field errors and focuses the summary when submitted empty", async () => {
    mockApi();
    const user = userEvent.setup();
    render(<EnquiryForm schoolPhone="054 587 5881" />);

    await user.click(screen.getByRole("button", { name: "Send enquiry" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("Please check the form");
    await vi.waitFor(() => expect(summary).toHaveFocus());
    expect(screen.getAllByText("Enter your full name.").length).toBeGreaterThan(0);
  });

  it("sends a valid enquiry and confirms it", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<EnquiryForm schoolPhone="054 587 5881" />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Send enquiry" }));

    const heading = await screen.findByRole("heading", { name: /we've received your enquiry/i });
    await vi.waitFor(() => expect(heading).toHaveFocus());
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      parent_name: "Akua Mensah",
      level_wanted: "lower_primary",
      preferred_visit_date: null,
      form_token: "tok",
      website: "",
    });
  });

  it("shows server field errors next to the field", async () => {
    mockApi({
      reply: json(400, { code: "validation_error", message: "Check", fields: { phone: ["Enter a Ghana mobile number, e.g. 024 123 4567."] } }),
    });
    const user = userEvent.setup();
    render(<EnquiryForm schoolPhone="054 587 5881" />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Send enquiry" }));

    expect(await screen.findAllByText("Enter a Ghana mobile number, e.g. 024 123 4567.")).not.toHaveLength(0);
    expect(screen.getByLabelText(/mobile number/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a helpful message when the form token cannot be loaded", async () => {
    mockApi({ token: null });
    render(<EnquiryForm schoolPhone="054 587 5881" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("054 587 5881");
  });
});
```

`frontend/src/components/site/map-embed.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MapEmbed } from "./map-embed";

describe("MapEmbed", () => {
  it("loads the map only when asked, to save data", async () => {
    const user = userEvent.setup();
    render(<MapEmbed query="Kronom, Kumasi, Ghana" schoolName="AD Smart School" />);
    expect(screen.queryByTitle("Map showing AD Smart School")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show map" }));

    expect(screen.getByTitle("Map showing AD Smart School")).toHaveAttribute(
      "src",
      "https://www.google.com/maps?q=Kronom%2C%20Kumasi%2C%20Ghana&output=embed",
    );
  });
});
```

Run: `npm test`
Expected: FAIL — modules not found.

- [ ] **Step 2: Enquiry schema**

`frontend/src/lib/enquiry-schema.ts`:
```ts
import { z } from "zod";

/** Same codes as the backend's Enquiry.Level. */
export const LEVEL_CODES = ["creche", "nursery", "kg", "lower_primary", "upper_primary", "jhs"] as const;

const GH_MOBILE = /^(?:\+?233|0)[25]\d{8}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function yearsBefore(isoDay: string, years: number): string {
  return `${Number(isoDay.slice(0, 4)) - years}${isoDay.slice(4)}`;
}

/** Mirrors the server's rules for instant feedback; the server stays the authority. */
export function buildEnquirySchema(today: string) {
  const oldestBirthday = yearsBefore(today, 18);
  return z.object({
    parent_name: z.string().trim().min(2, "Enter your full name.").max(120, "Use 120 characters or fewer."),
    phone: z
      .string()
      .trim()
      .refine((value) => GH_MOBILE.test(value.replace(/[\s-]/g, "")), "Enter a Ghana mobile number, e.g. 024 123 4567."),
    email: z
      .string()
      .trim()
      .max(254, "Use 254 characters or fewer.")
      .refine((value) => value === "" || EMAIL.test(value), "Enter a valid email address, or leave it blank."),
    child_name: z.string().trim().min(2, "Enter your child's full name.").max(120, "Use 120 characters or fewer."),
    child_date_of_birth: z
      .string()
      .refine((value) => ISO_DATE.test(value), "Enter your child's date of birth.")
      .refine((value) => !ISO_DATE.test(value) || value <= today, "Date of birth can't be in the future.")
      .refine(
        (value) => !ISO_DATE.test(value) || value >= oldestBirthday,
        "Please check the date of birth: we teach children up to JHS.",
      ),
    level_wanted: z
      .string()
      .refine((value) => (LEVEL_CODES as readonly string[]).includes(value), "Choose the level you're interested in."),
    preferred_visit_date: z
      .string()
      .refine((value) => value === "" || (ISO_DATE.test(value) && value >= today), "Choose today or a later date."),
    message: z.string().max(1000, "Use 1,000 characters or fewer."),
    data_consent: z.boolean().refine((value) => value, "Please agree so we can use these details to reply to you."),
  });
}

export type EnquiryValues = z.infer<ReturnType<typeof buildEnquirySchema>>;

export const EMPTY_ENQUIRY: EnquiryValues = {
  parent_name: "",
  phone: "",
  email: "",
  child_name: "",
  child_date_of_birth: "",
  level_wanted: "",
  preferred_visit_date: "",
  message: "",
  data_consent: false,
};

export function toPayload(values: EnquiryValues, formToken: string, honeypot: string) {
  return {
    ...values,
    preferred_visit_date: values.preferred_visit_date || null,
    form_token: formToken,
    website: honeypot,
  };
}
```

- [ ] **Step 3: Form building blocks, map and page hero**

`frontend/src/components/site/field.tsx`:
```tsx
import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

export const inputClasses =
  "block min-h-12 w-full rounded-control border border-line bg-card px-4 py-3 text-base text-ink placeholder:text-ink-muted aria-[invalid=true]:border-danger";

type InputProps = { id: string; "aria-describedby"?: string; "aria-invalid"?: true; required?: boolean };

type Props = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: InputProps) => ReactNode;
};

/** Label, hint and error wired to the input for screen readers (spec §8.7). */
export function Field({ id, label, hint, error, required = false, className, children }: Props) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="block font-medium">
        {label}
        {required ? (
          <span aria-hidden className="text-danger">
            {" "}*
          </span>
        ) : (
          <span className="font-normal text-ink-muted"> (optional)</span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="mt-1 text-sm text-ink-muted">
          {hint}
        </p>
      )}
      <div className="mt-2">
        {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, required })}
      </div>
      {error && (
        <p id={errorId} className="mt-2 flex items-start gap-1.5 text-sm font-medium text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
```

`frontend/src/components/site/map-embed.tsx`:
```tsx
"use client";

import { MapPin } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function MapEmbed({ query, schoolName }: { query: string; schoolName: string }) {
  const [shown, setShown] = useState(false);
  const encoded = encodeURIComponent(query);
  return (
    <div className="surface overflow-hidden rounded-card">
      {shown ? (
        <iframe
          title={`Map showing ${schoolName}`}
          src={`https://www.google.com/maps?q=${encoded}&output=embed`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="aspect-[4/3] w-full border-0 sm:aspect-[16/9]"
        />
      ) : (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-4 p-6 text-center sm:aspect-[16/9]">
          <MapPin aria-hidden className="size-10 text-indigo" />
          <p className="max-w-sm text-ink-muted">The map loads only when you ask for it, to save your mobile data.</p>
          <Button onClick={() => setShown(true)}>Show map</Button>
        </div>
      )}
      <p className="border-t border-line px-4">
        <a
          className="link inline-flex min-h-12 items-center"
          href={`https://www.google.com/maps/search/?api=1&query=${encoded}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Google Maps<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </p>
    </div>
  );
}
```

`frontend/src/components/site/page-hero.tsx`:
```tsx
import { Container } from "@/components/ui/container";

type Props = { title: string; eyebrow?: string; intro?: string };

export function PageHero({ title, eyebrow, intro }: Props) {
  return (
    <section className="bg-brand-mesh on-dark relative overflow-hidden pt-32 pb-16 text-white sm:pt-40 sm:pb-20">
      <Container>
        {eyebrow && (
          <p className="flex items-center gap-2 text-sm font-semibold tracking-wider uppercase">
            <span aria-hidden className="h-1 w-6 rounded-full bg-amber" />
            {eyebrow}
          </p>
        )}
        <h1 className="mt-3 max-w-3xl text-4xl font-bold sm:text-5xl">{title}</h1>
        {intro && <p className="mt-4 max-w-2xl text-lg text-white/90">{intro}</p>}
      </Container>
    </section>
  );
}
```

- [ ] **Step 4: The enquiry form**

`frontend/src/components/site/enquiry-form.tsx`:
```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { ApiRequestError, getJson, postJson } from "@/lib/client-api";
import { todayInAccra } from "@/lib/dates";
import { buildEnquirySchema, EMPTY_ENQUIRY, toPayload, type EnquiryValues } from "@/lib/enquiry-schema";
import { LEVELS } from "@/lib/levels";
import { Field, inputClasses } from "./field";

const LABELS: Record<keyof EnquiryValues, string> = {
  parent_name: "Your name",
  phone: "Mobile number",
  email: "Email",
  child_name: "Child's name",
  child_date_of_birth: "Child's date of birth",
  level_wanted: "Level",
  preferred_visit_date: "Preferred visit date",
  message: "Message",
  data_consent: "Agreement",
};

const isField = (name: string): name is keyof EnquiryValues => name in EMPTY_ENQUIRY;

export function EnquiryForm({ schoolPhone }: { schoolPhone: string }) {
  const today = useMemo(() => todayInAccra(), []);
  const schema = useMemo(() => buildEnquirySchema(today), [today]);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty, submitCount },
  } = useForm<EnquiryValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_ENQUIRY,
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  const [token, setToken] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const offline = `We couldn't reach the school's website. Please check your connection, or call us on ${schoolPhone}.`;

  const loadToken = useCallback(async () => {
    try {
      const data = await getJson<{ token: string }>("/api/public/enquiries/form-token");
      setToken(data.token);
      return data.token;
    } catch {
      setFormError(offline);
      return null;
    }
  }, [offline]);

  useEffect(() => {
    void loadToken();
  }, [loadToken]);

  useEffect(() => {
    if (sentTo) successRef.current?.focus();
  }, [sentTo]);

  // Focus the error summary after it has rendered (spec §8.7).
  useEffect(() => {
    if (focusRequest > 0) summaryRef.current?.focus();
  }, [focusRequest]);
  const focusSummary = () => setFocusRequest((count) => count + 1);

  // Ask before leaving a half-filled form (spec §10).
  useEffect(() => {
    if (!isDirty || sentTo) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty, sentTo]);

  async function onValid(values: EnquiryValues) {
    setFormError(null);
    const formToken = token ?? (await loadToken());
    if (!formToken) return focusSummary();
    try {
      await postJson("/api/public/enquiries", toPayload(values, formToken, honeypotRef.current?.value ?? ""));
      setSentTo(values.phone);
    } catch (error) {
      const body = error instanceof ApiRequestError ? error.body : null;
      if (body?.code === "validation_error") {
        for (const [name, messages] of Object.entries(body.fields)) {
          if (isField(name)) setError(name, { message: messages[0] });
          else setFormError(messages[0]);
        }
      } else {
        if (body?.code === "form_expired") await loadToken();
        setFormError(body?.message ? `${body.message} You can also call us on ${schoolPhone}.` : offline);
      }
      focusSummary();
    }
  }

  if (sentTo) {
    return (
      <div className="surface rounded-card p-8 text-center" role="status">
        <CircleCheck aria-hidden className="animate-pop mx-auto size-16 text-success" />
        <h3 ref={successRef} tabIndex={-1} className="mt-4 text-2xl font-semibold outline-none">
          Thank you. We&apos;ve received your enquiry.
        </h3>
        <p className="mt-3 text-ink-muted">
          We&apos;ll call you on {sentTo} to arrange a visit. You can also call us on {schoolPhone}.
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => {
            reset(EMPTY_ENQUIRY);
            setSentTo(null);
          }}
        >
          Send another enquiry
        </Button>
      </div>
    );
  }

  const fieldErrors = (Object.keys(LABELS) as (keyof EnquiryValues)[]).filter((name) => errors[name]?.message);
  const showSummary = Boolean(formError) || (submitCount > 0 && fieldErrors.length > 0);

  return (
    <form noValidate onSubmit={handleSubmit(onValid, focusSummary)} className="surface space-y-8 rounded-card p-6 sm:p-8">
      <p className="text-sm text-ink-muted">Fields marked * are required.</p>

      {showSummary && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-control border border-danger bg-danger/10 p-4 outline-none"
        >
          <h3 className="font-semibold">Please check the form</h3>
          {formError && <p className="mt-1">{formError}</p>}
          {fieldErrors.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {fieldErrors.map((name) => (
                <li key={name}>
                  <a className="link" href={`#enquiry-${name}`}>
                    {LABELS[name]}: {errors[name]?.message}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <fieldset className="space-y-5">
        <legend className="text-lg font-semibold">About you</legend>
        <Field id="enquiry-parent_name" label={LABELS.parent_name} required error={errors.parent_name?.message}>
          {(props) => <input {...props} {...register("parent_name")} type="text" autoComplete="name" className={inputClasses} />}
        </Field>
        <Field id="enquiry-phone" label={LABELS.phone} required hint="We'll call you on this number." error={errors.phone?.message}>
          {(props) => (
            <input {...props} {...register("phone")} type="tel" inputMode="tel" autoComplete="tel" className={inputClasses} />
          )}
        </Field>
        <Field id="enquiry-email" label={LABELS.email} error={errors.email?.message}>
          {(props) => <input {...props} {...register("email")} type="email" autoComplete="email" className={inputClasses} />}
        </Field>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="text-lg font-semibold">About your child</legend>
        <Field id="enquiry-child_name" label={LABELS.child_name} required error={errors.child_name?.message}>
          {(props) => <input {...props} {...register("child_name")} type="text" autoComplete="off" className={inputClasses} />}
        </Field>
        <Field id="enquiry-child_date_of_birth" label={LABELS.child_date_of_birth} required error={errors.child_date_of_birth?.message}>
          {(props) => <input {...props} {...register("child_date_of_birth")} type="date" max={today} className={inputClasses} />}
        </Field>
        <Field id="enquiry-level_wanted" label={LABELS.level_wanted} required error={errors.level_wanted?.message}>
          {(props) => (
            <select {...props} {...register("level_wanted")} className={inputClasses}>
              <option value="">Choose a level</option>
              {LEVELS.map((level) => (
                <option key={level.code} value={level.code}>
                  {level.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="text-lg font-semibold">Your visit</legend>
        <Field
          id="enquiry-preferred_visit_date"
          label={LABELS.preferred_visit_date}
          hint="We'll confirm a time by phone."
          error={errors.preferred_visit_date?.message}
        >
          {(props) => <input {...props} {...register("preferred_visit_date")} type="date" min={today} className={inputClasses} />}
        </Field>
        <Field id="enquiry-message" label={LABELS.message} error={errors.message?.message}>
          {(props) => <textarea {...props} {...register("message")} rows={4} maxLength={1000} className={inputClasses} />}
        </Field>
      </fieldset>

      {/* Honeypot: hidden from people, filled in by bots (spec §6.4). */}
      <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
        <label htmlFor="enquiry-website">Leave this field empty</label>
        <input ref={honeypotRef} id="enquiry-website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div>
        <div className="flex items-start gap-3">
          <input
            id="enquiry-data_consent"
            type="checkbox"
            {...register("data_consent")}
            aria-invalid={errors.data_consent ? true : undefined}
            aria-describedby={errors.data_consent ? "enquiry-data_consent-error" : undefined}
            className="mt-1 size-6 shrink-0 accent-[var(--btn-primary)]"
          />
          <label htmlFor="enquiry-data_consent">
            I agree that AD Smart School may use these details to reply to my enquiry, as described in the{" "}
            <Link href="/privacy" className="link">
              privacy notice
            </Link>
            .<span aria-hidden className="text-danger"> *</span>
          </label>
        </div>
        {errors.data_consent && (
          <p id="enquiry-data_consent-error" className="mt-2 text-sm font-medium text-danger">
            {errors.data_consent.message}
          </p>
        )}
      </div>

      <Button type="submit" variant="amber" size="lg" disabled={isSubmitting} className="w-full sm:w-auto">
        {isSubmitting ? "Sending…" : "Send enquiry"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: The inner pages**

`frontend/src/app/(public)/about/page.tsx`:
```tsx
import type { Metadata } from "next";
import { Quote } from "lucide-react";
import { AdmissionsCta } from "@/components/site/home/admissions-cta";
import { ProofStrip } from "@/components/site/home/proof-strip";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { RichText } from "@/components/ui/rich-text";
import { contentOf, getSite } from "@/lib/api";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "About us",
  description: "The story of AD Smart School in Kronom, Kumasi, teaching children from Crèche to JHS since 2001.",
};

export default async function AboutPage() {
  const site = await getSite();
  const photo = site.photos.about;
  return (
    <>
      <PageHero eyebrow={contentOf(site, "hero_subline")} title={`About ${site.school.name}`} intro={site.school.motto || undefined} />
      <section aria-labelledby="story-title" className="py-16 sm:py-24">
        <Container className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 id="story-title" className="text-3xl font-bold">Our story</h2>
            <RichText text={contentOf(site, "about_history")} headingLevel={3} className="mt-6 text-lg" />
          </div>
          {photo && (
            <ResponsiveImage
              image={photo}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="aspect-[4/3] w-full rounded-card object-cover shadow-elev-2"
            />
          )}
        </Container>
      </section>
      <ProofStrip facts={site.facts} overlap={false} />
      <section aria-labelledby="welcome-title" className="py-16 sm:py-24">
        <Container>
          <figure className="surface mx-auto max-w-3xl rounded-card p-8 sm:p-12">
            <h2 id="welcome-title" className="sr-only">A welcome from the head teacher</h2>
            <Quote aria-hidden className="size-10 text-indigo" />
            <blockquote className="mt-4 text-xl leading-relaxed">
              <RichText text={contentOf(site, "head_teacher_welcome")} />
            </blockquote>
            <figcaption className="mt-6 font-semibold">{contentOf(site, "head_teacher_name")}</figcaption>
          </figure>
        </Container>
      </section>
      <AdmissionsCta site={site} />
    </>
  );
}
```

`frontend/src/app/(public)/levels/page.tsx`:
```tsx
import type { Metadata } from "next";
import { AdmissionsCta } from "@/components/site/home/admissions-cta";
import { PageHero } from "@/components/site/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { CategoryBadge } from "@/components/ui/category-badge";
import { Container } from "@/components/ui/container";
import { contentOf, getSite } from "@/lib/api";
import { LEVELS } from "@/lib/levels";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Levels",
  description: "Crèche, Nursery, Kindergarten, Primary and Junior High School at AD Smart School, Kronom, Kumasi.",
};

export default async function LevelsPage() {
  const site = await getSite();
  return (
    <>
      <PageHero eyebrow="Our levels" title="From Crèche to JHS" intro={contentOf(site, "levels_intro")} />
      <section className="py-16 sm:py-24">
        <Container className="space-y-6">
          {LEVELS.map((level) => (
            <article
              key={level.code}
              id={level.code}
              aria-labelledby={`${level.code}-title`}
              className="surface grid scroll-mt-28 gap-4 rounded-card p-6 sm:p-8 md:grid-cols-[1fr_2fr]"
            >
              <div>
                <CategoryBadge category={level.category} />
                <h2 id={`${level.code}-title`} className="mt-3 text-2xl font-bold">
                  {level.name}
                </h2>
                <p className="mt-1 font-medium text-ink-muted">{contentOf(site, `level_${level.code}_ages`)}</p>
              </div>
              <div className="space-y-3 text-lg">
                <p className="font-medium">{contentOf(site, `level_${level.code}_summary`)}</p>
                <p className="text-ink-muted">{contentOf(site, `level_${level.code}_detail`)}</p>
                <ButtonLink href="/admissions#enquiry" variant="outline">
                  Enquire about {level.shortName}
                </ButtonLink>
              </div>
            </article>
          ))}
        </Container>
      </section>
      <AdmissionsCta site={site} />
    </>
  );
}
```

`frontend/src/app/(public)/admissions/page.tsx`:
```tsx
import type { Metadata } from "next";
import { EnquiryForm } from "@/components/site/enquiry-form";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { RichText } from "@/components/ui/rich-text";
import { contentOf, getSite } from "@/lib/api";
import { LEVELS } from "@/lib/levels";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Admissions",
  description: "How to join AD Smart School in Kronom, Kumasi: steps, documents, ages and an online enquiry form.",
};

export default async function AdmissionsPage() {
  const site = await getSite();
  const { school } = site;
  return (
    <>
      <PageHero eyebrow="Admissions" title={`Join ${school.name}`} intro={contentOf(site, "admissions_intro")} />
      <section className="py-16 sm:py-24">
        <Container className="grid gap-6 lg:grid-cols-2">
          <div className="surface rounded-card p-6 sm:p-8">
            <h2 className="text-2xl font-bold">How admission works</h2>
            <RichText text={contentOf(site, "admissions_steps")} className="mt-4" />
          </div>
          <div className="surface rounded-card p-6 sm:p-8">
            <h2 className="text-2xl font-bold">What to bring</h2>
            <RichText text={contentOf(site, "admissions_requirements")} className="mt-4" />
          </div>
        </Container>
      </section>
      <section aria-labelledby="ages-title" className="pb-16 sm:pb-24">
        <Container>
          <h2 id="ages-title" className="text-2xl font-bold">Age guide</h2>
          <div className="surface mt-6 overflow-x-auto rounded-card">
            <table className="w-full text-left">
              <caption className="sr-only">Typical ages for each level</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="p-4">Level</th>
                  <th scope="col" className="p-4">Typical age</th>
                </tr>
              </thead>
              <tbody>
                {LEVELS.map((level) => (
                  <tr key={level.code} className="border-b border-line last:border-0">
                    <th scope="row" className="p-4 font-medium">{level.name}</th>
                    <td className="p-4 text-ink-muted">{contentOf(site, `level_${level.code}_ages`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </section>
      <section id="enquiry" aria-labelledby="enquiry-title" className="scroll-mt-24 pb-20 sm:pb-28">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 id="enquiry-title" className="text-3xl font-bold">Send an enquiry</h2>
            <p className="mt-4 text-lg text-ink-muted">
              Tell us about your child and we&apos;ll call you to arrange a visit. Prefer to talk? Call{" "}
              <a className="link" href={`tel:${school.phone}`}>
                {school.phone_display}
              </a>
              .
            </p>
          </div>
          <EnquiryForm schoolPhone={school.phone_display} />
        </Container>
      </section>
    </>
  );
}
```

`frontend/src/app/(public)/news/page.tsx`:
```tsx
import type { Metadata } from "next";
import { NewsCard } from "@/components/site/news-cards";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { getNewsList } from "@/lib/api";

export const revalidate = 300;
export const metadata: Metadata = { title: "News", description: "News and updates from AD Smart School, Kronom, Kumasi." };

export default async function NewsPage() {
  const posts = await getNewsList(50);
  return (
    <>
      <PageHero eyebrow="News" title="School news" intro="Updates and stories from AD Smart School." />
      <section className="py-16 sm:py-24">
        <Container>
          {posts.length === 0 ? (
            <p className="surface rounded-card p-8 text-center text-lg text-ink-muted">No news yet. Please check back soon.</p>
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <li key={post.slug}>
                  <NewsCard post={post} />
                </li>
              ))}
            </ul>
          )}
        </Container>
      </section>
    </>
  );
}
```

`frontend/src/app/(public)/news/[slug]/page.tsx`:
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { RichText } from "@/components/ui/rich-text";
import { getNewsList, getNewsPost } from "@/lib/api";
import { formatDate } from "@/lib/dates";

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 300;

export async function generateStaticParams() {
  return (await getNewsList(50)).map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getNewsPost((await params).slug);
  if (!post) return { title: "News" };
  return {
    title: post.title,
    description: post.summary,
    openGraph: {
      title: post.title,
      description: post.summary,
      type: "article",
      publishedTime: post.published_at,
      images: post.cover ? [{ url: post.cover.src, width: post.cover.width, height: post.cover.height, alt: post.cover.alt }] : undefined,
    },
  };
}

export default async function NewsArticlePage({ params }: Props) {
  const post = await getNewsPost((await params).slug);
  if (!post) notFound();
  return (
    <article>
      <PageHero eyebrow={formatDate(post.published_at)} title={post.title} intro={post.summary} />
      <Container className="py-16 sm:py-24">
        <div className="mx-auto max-w-3xl">
          {post.cover && (
            <ResponsiveImage
              image={post.cover}
              sizes="(min-width: 768px) 768px, 100vw"
              className="mb-10 aspect-[16/9] w-full rounded-card object-cover"
            />
          )}
          <RichText text={post.body} className="text-lg" />
          <Link href="/news" className="link mt-12 inline-flex min-h-11 items-center font-medium">
            <span aria-hidden>←&nbsp;</span>All news
          </Link>
        </div>
      </Container>
    </article>
  );
}
```

`frontend/src/app/(public)/contact/page.tsx`:
```tsx
import type { Metadata } from "next";
import { Clock, Mail, MapPin, MessageCircle, Phone, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { MapEmbed } from "@/components/site/map-embed";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { contentOf, getSite } from "@/lib/api";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Contact",
  description: "Call, message, email or visit AD Smart School in Kronom, Kumasi.",
};

export default async function ContactPage() {
  const site = await getSite();
  const { school } = site;
  const place = [school.address, school.town, school.region].filter(Boolean).join(", ");
  const cards: { title: string; Icon: LucideIcon; body: ReactNode }[] = [
    {
      title: "Call us",
      Icon: Phone,
      body: <a className="link inline-flex min-h-11 items-center" href={`tel:${school.phone}`}>{school.phone_display}</a>,
    },
    ...(school.whatsapp_link
      ? [{
          title: "WhatsApp",
          Icon: MessageCircle,
          body: <a className="link inline-flex min-h-11 items-center" href={school.whatsapp_link} rel="noopener">Chat with us on WhatsApp</a>,
        }]
      : []),
    {
      title: "Email",
      Icon: Mail,
      body: <a className="link inline-flex min-h-11 items-center break-all" href={`mailto:${school.email}`}>{school.email}</a>,
    },
    {
      title: "Visit us",
      Icon: MapPin,
      body: (
        <p>
          {place}
          {school.ghana_post_gps && <><br />GhanaPost GPS: {school.ghana_post_gps}</>}
        </p>
      ),
    },
    { title: "Office hours", Icon: Clock, body: <p>{contentOf(site, "contact_hours")}</p> },
  ];
  return (
    <>
      <PageHero eyebrow="Contact" title="Get in touch" intro="Call, message or visit us. We're happy to answer your questions." />
      <section className="py-16 sm:py-24">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.3fr]">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {cards.map(({ title, Icon, body }) => (
              <li key={title} className="surface flex gap-4 rounded-card p-5">
                <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-control bg-indigo/10 text-indigo">
                  <Icon aria-hidden className="size-6" />
                </span>
                <div>
                  <h2 className="font-semibold">{title}</h2>
                  <div className="mt-1 text-ink-muted">{body}</div>
                </div>
              </li>
            ))}
          </ul>
          <MapEmbed query={school.map_query || place} schoolName={school.name} />
        </Container>
      </section>
    </>
  );
}
```

`frontend/src/app/(public)/privacy/page.tsx`:
```tsx
import type { Metadata } from "next";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { RichText } from "@/components/ui/rich-text";
import { getPrivacyNotice } from "@/lib/api";
import { formatDate } from "@/lib/dates";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Privacy notice",
  description: "How AD Smart School uses and protects personal information (Data Protection Act, 2012).",
};

export default async function PrivacyPage() {
  const notice = await getPrivacyNotice();
  return (
    <>
      <PageHero eyebrow="Your data" title={notice?.title ?? "Privacy notice"} />
      <section className="py-16 sm:py-24">
        <Container>
          <div className="mx-auto max-w-3xl">
            {notice ? (
              <>
                {notice.is_draft && (
                  <p role="note" className="surface mb-8 rounded-card p-4 font-medium">
                    This notice is a draft and is still being reviewed.
                  </p>
                )}
                <RichText text={notice.body} className="text-lg" />
                <p className="mt-10 text-sm text-ink-muted">
                  Version {notice.version}, effective {formatDate(notice.effective_from)}.
                </p>
              </>
            ) : (
              <p className="text-lg">Our privacy notice will be published here soon.</p>
            )}
          </div>
        </Container>
      </section>
    </>
  );
}
```

`frontend/src/app/not-found.tsx`:
```tsx
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="bg-brand-mesh on-dark flex min-h-dvh items-center justify-center p-6 text-white">
      <div className="glass-clear max-w-md rounded-card p-8 text-center">
        <p className="text-sm font-semibold tracking-wider uppercase">Page not found</p>
        <h1 className="mt-3 text-3xl font-bold">We couldn&apos;t find that page</h1>
        <p className="mt-4 text-white/90">It may have moved. Try the home page or the latest news.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className={buttonClasses("amber")}>Go to the home page</Link>
          <Link href="/news" className={buttonClasses("glass")}>Read the news</Link>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Run checks and look at every page**

```bash
npm test && npm run lint && npm run typecheck
```
Expected: all pass. With both servers running, visit each page at 375 px and 1440 px in light and dark; submit a real enquiry (wait at least 3 seconds after the page loads) and confirm the email appears in the Django console and the row in `django-admin/website/enquiry/`.

- [ ] **Step 7: Commit**

```bash
cd /c/Dev/ad-smart-school
git add frontend
git commit -m "Add about, levels, admissions, news, contact and privacy pages"
```

---

## Task 17: Search engines and sharing

**Files:**
- Create: `frontend/src/app/robots.ts`, `frontend/src/app/sitemap.ts`, `frontend/src/app/opengraph-image.tsx`
- Test: `frontend/src/app/seo.test.ts`

**Interfaces:**
- Consumes: `getSite`, `getNewsList` (Task 13), `siteUrl`.
- Produces: `/robots.txt` (disallow everything while in preview; allow + sitemap link once public), `/sitemap.xml` (empty while in preview; all pages + news once public), `/opengraph-image` (1200 × 630 brand card for link previews).

- [ ] **Step 1: Write the failing test**

`frontend/src/app/seo.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { getNewsList, getSite } from "@/lib/api";
import { makeSite } from "@/test/site-fixture";
import robots from "./robots";
import sitemap from "./sitemap";

vi.mock("@/lib/api", () => ({ getSite: vi.fn(), getNewsList: vi.fn() }));

describe("robots and sitemap", () => {
  it("keep search engines out while the site is in preview", async () => {
    vi.mocked(getSite).mockResolvedValue(makeSite({ is_public: false }));

    expect(await robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(await sitemap()).toEqual([]);
  });

  it("list every page and news post once public", async () => {
    vi.stubEnv("SITE_URL", "https://adsmartschool.test");
    vi.mocked(getSite).mockResolvedValue(makeSite({ is_public: true }));
    vi.mocked(getNewsList).mockResolvedValue([
      { title: "Hi", slug: "hi", summary: "s", published_at: "2026-10-09T08:00:00+00:00", cover: null },
    ]);

    expect(await robots()).toMatchObject({ sitemap: "https://adsmartschool.test/sitemap.xml" });
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain("https://adsmartschool.test/admissions");
    expect(urls).toContain("https://adsmartschool.test/news/hi");
    vi.unstubAllEnvs();
  });
});
```

Run: `npm test`
Expected: FAIL — `./robots` not found.

- [ ] **Step 2: Implement**

`frontend/src/app/robots.ts`:
```ts
import type { MetadataRoute } from "next";
import { getSite } from "@/lib/api";
import { siteUrl } from "@/lib/site-url";

export const revalidate = 300;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await getSite();
  if (!site.is_public) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/" }, sitemap: `${siteUrl()}/sitemap.xml` };
}
```

`frontend/src/app/sitemap.ts`:
```ts
import type { MetadataRoute } from "next";
import { getNewsList, getSite } from "@/lib/api";
import { siteUrl } from "@/lib/site-url";

export const revalidate = 3600;

const PAGES = ["", "/about", "/levels", "/admissions", "/news", "/contact", "/privacy"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await getSite();
  if (!site.is_public) return [];
  const base = siteUrl();
  const news = await getNewsList(50);
  return [
    ...PAGES.map((path) => ({ url: `${base}${path}` })),
    ...news.map((post) => ({ url: `${base}/news/${post.slug}`, lastModified: post.published_at })),
  ];
}
```

`frontend/src/app/opengraph-image.tsx`:
```tsx
import { ImageResponse } from "next/og";

export const alt = "AD Smart School, Kronom, Kumasi";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Link preview card for WhatsApp, Facebook and others (brand asset colours). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          color: "#ffffff",
          background: "linear-gradient(135deg, #0f1a9e 0%, #0277bd 55%, #8806a8 100%)",
        }}
      >
        <div style={{ fontSize: 34, fontWeight: 600, color: "#f0ad1c" }}>Kronom, Kumasi · Since 2001</div>
        <div style={{ fontSize: 88, fontWeight: 700, marginTop: 16 }}>AD Smart School</div>
        <div style={{ fontSize: 40, marginTop: 16 }}>Bright beginnings, from Crèche to JHS</div>
      </div>
    ),
    size,
  );
}
```

- [ ] **Step 3: Run checks**

```bash
npm test && npm run lint && npm run typecheck
```
Expected: all pass. With the servers running, `/robots.txt` shows `Disallow: /` and `/opengraph-image` renders the card.

- [ ] **Step 4: Commit**

```bash
cd /c/Dev/ad-smart-school
git add frontend
git commit -m "Add robots, sitemap and link preview image"
```

---

## Task 18: Browser tests, accessibility, Lighthouse and the check script

**Files:**
- Create: `frontend/playwright.config.ts`, `frontend/lighthouserc.json`
- Create: `frontend/e2e/serve.mjs`, `frontend/e2e/lighthouse.mjs`, `frontend/e2e/axe.ts`
- Create: `frontend/e2e/public-pages.spec.ts`, `theme.spec.ts`, `enquiry.spec.ts`, `gallery.spec.ts`, `lite.spec.ts`
- Create: `scripts/check.sh`, `README.md`

**Interfaces:**
- Consumes: the whole system.
- Produces: `npm run e2e` (Playwright, phone 375 px + desktop 1440 px), `npm run lighthouse` (LHCI with Playwright's Chromium), `scripts/check.sh` (`WITH_E2E=1` adds both), the README.

- [ ] **Step 1: Test servers**

`frontend/e2e/serve.mjs`:
```js
// Starts a fresh, seeded Django and a production build of Next.js for browser tests.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, "../../backend");
const frontend = path.resolve(here, "..");
const isWindows = process.platform === "win32";
const python = path.join(backend, ".venv", isWindows ? "Scripts/python.exe" : "bin/python");
const npm = isWindows ? "npm.cmd" : "npm";

const djangoEnv = {
  ...process.env,
  DATABASE_URL: "sqlite:///e2e.sqlite3",
  DJANGO_MEDIA_ROOT: path.join(backend, "e2e-media"),
  DJANGO_DEBUG: "true",
  DJANGO_SECRET_KEY: "e2e-only-secret-key-0123456789abcdefghijklmnopqrstuvwxyz",
  DJANGO_ALLOWED_HOSTS: "127.0.0.1,localhost",
};
const nextEnv = { ...process.env, DJANGO_ORIGIN: "http://127.0.0.1:8000", SITE_URL: "http://127.0.0.1:3100" };

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: isWindows, ...options });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`))));
  });
}

fs.rmSync(path.join(backend, "e2e.sqlite3"), { force: true });
fs.rmSync(djangoEnv.DJANGO_MEDIA_ROOT, { recursive: true, force: true });
await run(python, ["manage.py", "migrate", "--noinput"], { cwd: backend, env: djangoEnv });
await run(python, ["manage.py", "createcachetable"], { cwd: backend, env: djangoEnv });
await run(python, ["manage.py", "seed_website"], { cwd: backend, env: djangoEnv });

const django = spawn(python, ["manage.py", "runserver", "127.0.0.1:8000", "--noreload"], {
  cwd: backend,
  env: djangoEnv,
  stdio: "inherit",
});
for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    if ((await fetch("http://127.0.0.1:8000/api/health")).ok) break;
  } catch {
    // not up yet
  }
  await sleep(500);
}

await run(npm, ["run", "build"], { cwd: frontend, env: nextEnv });
const next = spawn(npm, ["run", "start", "--", "-p", "3100"], { cwd: frontend, env: nextEnv, stdio: "inherit", shell: isWindows });

function stop() {
  django.kill();
  next.kill();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
```

`frontend/playwright.config.ts`:
```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "node e2e/serve.mjs",
    url: "http://127.0.0.1:3100",
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
  },
});
```

`frontend/e2e/axe.ts`:
```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export async function expectNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}
```

```bash
cd /c/Dev/ad-smart-school/frontend
npx playwright install chromium
```

- [ ] **Step 2: Write the browser tests**

`frontend/e2e/public-pages.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { expectNoAccessibilityViolations } from "./axe";

const PAGES: [string, RegExp][] = [
  ["/", /Bright beginnings/],
  ["/about", /About AD Smart School/],
  ["/levels", /From Crèche to JHS/],
  ["/admissions", /Join AD Smart School/],
  ["/news", /School news/],
  ["/news/welcome-to-our-new-website", /Welcome to our new website/],
  ["/contact", /Get in touch/],
  ["/privacy", /Privacy notice/],
];

for (const scheme of ["light", "dark"] as const) {
  for (const [path, heading] of PAGES) {
    test(`${path} is usable and accessible in ${scheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto(path);

      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
      await expect(page.getByRole("note").filter({ hasText: "Preview: not yet public" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await expectNoAccessibilityViolations(page);
    });
  }
}

test("preview pages ask search engines not to index them", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("unknown pages show a friendly not-found page", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
});
```

`frontend/e2e/theme.spec.ts`:
```ts
import { expect, test } from "@playwright/test";

test("follows the device theme from the first paint", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("remembers a chosen theme across visits", async ({ page, isMobile }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();

  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
```

`frontend/e2e/enquiry.spec.ts`:
```ts
import { expect, test } from "@playwright/test";

test("an empty form shows a focused error summary", async ({ page }) => {
  await page.goto("/admissions#enquiry");
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Please check the form" })).toBeFocused();
});

test("a parent can send an admissions enquiry", async ({ page }) => {
  await page.goto("/admissions#enquiry");
  await page.getByLabel(/your name/i).fill("Akua Mensah");
  await page.getByLabel(/mobile number/i).fill("024 123 4567");
  await page.getByLabel(/child's name/i).fill("Ama Mensah");
  await page.getByLabel(/date of birth/i).fill("2019-05-01");
  await page.getByLabel(/^level/i).selectOption("lower_primary");
  await page.getByLabel(/I agree/i).check();
  await page.waitForTimeout(3200); // spam protection: the form must be open for 3 seconds

  await page.getByRole("button", { name: "Send enquiry" }).click();

  await expect(page.getByRole("heading", { name: /we've received your enquiry/i })).toBeFocused();
});
```

`frontend/e2e/gallery.spec.ts`:
```ts
import { expect, test } from "@playwright/test";

test("photos open in a viewer that can be browsed and closed", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const firstPhoto = page.getByRole("button", { name: "Open photo: Early years play" });
  await firstPhoto.scrollIntoViewIfNeeded();
  await firstPhoto.click();

  const viewer = page.getByRole("dialog", { name: "Photo viewer" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText("Photo 1 of 12")).toBeVisible();

  await viewer.getByRole("button", { name: "Next photo" }).click();
  await expect(viewer.getByText("Photo 2 of 12")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await expect(firstPhoto).toBeFocused();
});
```

`frontend/e2e/lite.spec.ts`:
```ts
import { expect, test } from "@playwright/test";

test("Lite mode swaps blur for solid surfaces", async ({ page }) => {
  await page.goto("/?lite=1");
  await expect(page.locator("html")).toHaveAttribute("data-lite", "");
  const blur = await page.locator("header").evaluate((element) => getComputedStyle(element).backdropFilter);
  expect(blur).toBe("none");
});
```

- [ ] **Step 3: Run the browser tests**

Run: `npm run e2e`
Expected: every test passes on both projects. If axe reports a colour-contrast violation, fix the token or class in question (never disable the rule); if a layout overflows at 375 px, fix the component.

- [ ] **Step 4: Lighthouse**

`frontend/lighthouserc.json`:
```json
{
  "ci": {
    "collect": {
      "url": ["http://127.0.0.1:3100/", "http://127.0.0.1:3100/admissions", "http://127.0.0.1:3100/?lite=1"],
      "numberOfRuns": 1,
      "startServerCommand": "node e2e/serve.mjs",
      "startServerReadyPattern": "Ready in",
      "startServerReadyTimeout": 300000,
      "settings": { "chromeFlags": "--headless=new" }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.9 }],
        "categories:best-practices": ["error", { "minScore": 0.9 }],
        "categories:seo": ["warn", { "minScore": 0.9 }],
        "resource-summary:total:size": ["error", { "maxNumericValue": 512000 }]
      }
    },
    "upload": { "target": "filesystem", "outputDir": ".lighthouseci" }
  }
}
```
(SEO is a warning here because preview pages are deliberately `noindex`; Plan 5 asserts it at launch.)

`frontend/e2e/lighthouse.mjs`:
```js
// Runs Lighthouse CI with Playwright's Chromium, so no separate Chrome install is needed.
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const isWindows = process.platform === "win32";
const child = spawn(isWindows ? "npx.cmd" : "npx", ["lhci", "autorun"], {
  stdio: "inherit",
  shell: isWindows,
  env: { ...process.env, CHROME_PATH: chromium.executablePath() },
});
child.on("exit", (code) => process.exit(code ?? 1));
```

Run: `npm run lighthouse`
Expected: all `error` assertions pass. If performance falls short, look first at the hero image size and the JavaScript loaded on the home page.

- [ ] **Step 5: The check script and README**

`scripts/check.sh`:
```bash
#!/usr/bin/env bash
# Every check in one command: lint, types, tests and dependency audits.
# WITH_E2E=1 scripts/check.sh also runs the browser tests and Lighthouse.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="$ROOT/backend/.venv/Scripts/python"
[ -x "$PY" ] || PY="$ROOT/backend/.venv/bin/python"

echo "== Backend: lint"
(cd "$ROOT/backend" && "$PY" -m ruff check . && "$PY" -m ruff format --check .)
echo "== Backend: tests"
(cd "$ROOT/backend" && "$PY" -m pytest)
echo "== Backend: dependency audit"
(cd "$ROOT/backend" && "$PY" -m pip_audit -r requirements.txt)
echo "== Frontend: lint, types, tests"
(cd "$ROOT/frontend" && npm run lint && npm run typecheck && npm test)
echo "== Frontend: dependency audit"
(cd "$ROOT/frontend" && npm audit --omit=dev --audit-level=high)
if [ "${WITH_E2E:-0}" = "1" ]; then
  echo "== Browser tests"
  (cd "$ROOT/frontend" && npm run e2e)
  echo "== Lighthouse"
  (cd "$ROOT/frontend" && npm run lighthouse)
fi
echo "All checks passed."
```

`README.md`:
````markdown
# AD Smart School

Website and school management system for AD Smart School, Kronom, Kumasi (Crèche to JHS).

- Design spec: `docs/superpowers/specs/2026-10-09-ad-smart-school-website-phase1-design.md`
- Plans: `docs/superpowers/plans/`

## Structure

- `backend/` — Django REST API (content, enquiries; later the school system)
- `frontend/` — Next.js website (and later the portals)

## First-time setup (Windows, Git Bash)

```bash
cd backend
py -3.14 -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt
cp .env.example .env            # then set DJANGO_SECRET_KEY
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py createcachetable
.venv/Scripts/python manage.py seed_website

cd ../frontend
npm install
cp .env.local.example .env.local
```

## Run it

```bash
backend/.venv/Scripts/python backend/manage.py runserver 127.0.0.1:8000
npm --prefix frontend run dev
```

Open http://localhost:3000. Website content can be edited at http://127.0.0.1:8000/django-admin/
(development only; create a login with `manage.py createsuperuser`).

`npm run build` pre-renders pages from the API, so the backend must be running while it builds.

## Checks

```bash
scripts/check.sh               # lint, types, unit tests, audits
WITH_E2E=1 scripts/check.sh    # plus browser tests and Lighthouse
```

## Before launch

The site stays in **Preview** (not indexed, ribbon shown) until real photos replace the
placeholders, every text block is reviewed, the privacy notice is approved, and the site is
marked live. See spec §6.5 and §15.

## Next

Plan 2 (sign-in and security) switches development to PostgreSQL — install it first.
````

```bash
cd /c/Dev/ad-smart-school
chmod +x scripts/check.sh
WITH_E2E=1 scripts/check.sh
```
Expected: `All checks passed.`

- [ ] **Step 6: Commit**

```bash
git add frontend scripts README.md
git commit -m "Add browser tests, accessibility and Lighthouse checks, check script and README"
```
