# Plan 2: Platform Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-school website into a platform. Many schools each get their own address, branding and placeholder site, and their data is kept apart. A platform marketing site with a "Get your school online" form sits at the main address.

**Architecture:**
- **School records:** `SchoolProfile` (a single row) becomes `School` (one row per school, plus `SchoolDomain`). Every website record gets a `school` reference through an abstract `SchoolOwned` base with `for_school()`.
- **Finding the school:** Django resolves the school from the host. For browser calls that is the forwarded `Host`; for server-side page renders it is the path (`/api/public/sites/<host>/…`).
- **Routing:** the Next.js `proxy.ts` rewrites each host to `/sites/<host>/…`, `/platform-site/…` or `/platform-admin/…`, so pages are cached per host.
- **Branding:** brand colours are checked for contrast and turned into CSS variables by Django. Next.js prints them in a `<style>` element per school.

**Tech Stack:** Django 6.1.2, DRF 3.18.3, PostgreSQL 18 (embedded-postgres 18.4.0-beta.17), psycopg 3.3.6; Next.js 16.4 (`proxy.ts`), React 19.3, Tailwind 4, Vitest 5, Playwright 1.64.

**Spec:** `docs/superpowers/specs/2026-10-09-multi-school-platform-design.md` (amends `docs/superpowers/specs/2026-10-09-ad-smart-school-website-phase1-design.md`)

## Global Constraints

- **Addresses:** `<platform domain>` and `www.` show the platform site, `admin.` the admin area, and `<slug>.<platform domain>` or a verified custom domain a school. Anything else gets 404 (amendment §2.1).
- **Slugs:** 3–30 characters, lowercase letters, digits and single hyphens, starting with a letter. Reserved: `admin www api app mail static media platform support help status docs blog` (amendment §2.2).
- **Settings:**
  - `PLATFORM_NAME` (default `SchoolSite`), `PLATFORM_DOMAIN` (default `localhost`) and `PLATFORM_EMAIL`.
  - `SITE_URL_TEMPLATE`: default `http://{host}:3000`; production `https://{host}`.
- **Data separation:** every school-owned table has a non-null `school`, and its unique rules apply per school. Queries use `for_school(school)` (amendment §3.2).
- **Brand colours:** the primary needs 4.5:1 against the page background (#faf9f6) and with white text; the accent needs 4.5:1 with dark text (#14123a). A refused colour comes with a suggested passing colour (amendment §7.2).
- **New school's site:** templated text (`needs_review`), shared placeholder photos (`is_placeholder`), feature blocks off, a draft privacy notice, no news (amendment §7.4).
- **Suspended school:** the site API answers 503 `suspended` and the website shows "This school's website is temporarily unavailable." (amendment §2.4).
- **Unchanged from Phase 1:**
  - No invented statistics.
  - Feature blocks stay off until the feature is live.
  - Placeholder photos are never public.
  - The error shape is `{code, message, fields}`.
  - NUM_PROXIES stays 1.
- **Copy:** UK English and plain language.

## Review Focus

1. **Cross-school leaks through unique lookups.** A news slug, photo key or enquiry from school B must never be reachable at school A's address. Task 2 tests news and content per host; Task 4's route matrix forces every new API route to be classified.
2. **The host header from the browser.** Django trusts `X-Forwarded-Host` only because it is reachable just from Next.js. A spoofed host only shows another public site (Task 2 hosts tests). Sessions binding to a school arrives in Plan 3.
3. **Next.js rewrites and `usePathname`.**
   - The active navigation item must match on the server and the client.
   - `publicPath()` strips the internal prefix (Task 5 test).
   - Another school's internal `/sites/<host>/…` URL must not render on this host (Task 5 `routeFor` tests).
4. **Placeholder photos shared by all schools.** Renditions are built once, and a second school must not rebuild or delete them (Task 3 test).
5. **Readability of school colours in dark mode.** Derived dark tokens must reach 4.5:1 against the dark card (Task 1 test).

---

### Task 0: Development PostgreSQL

**Files:**
- Create: `tools/postgres/package.json`, `tools/postgres/start.mjs`, `backend/tests/test_database.py`
- Modify: `backend/requirements.txt`, `backend/.env.example`, `scripts/check.sh`, `.gitignore`, `README.md`
- Local only (not committed): `backend/.env` gets `DATABASE_URL`

**Interfaces:**
- Produces: PostgreSQL on `127.0.0.1:5433` in UTF-8, database `adss`, role `adss` / `adss-dev-only` with CREATEDB. `DATABASE_URL=postgres://adss:adss-dev-only@127.0.0.1:5433/adss`. Browser tests stay on SQLite.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_database.py`:
```python
from django.db import connection


def test_tests_run_on_postgresql():
    # Spec §13: from Plan 2 on, development and tests use PostgreSQL.
    assert connection.vendor == "postgresql"
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_database.py -q`
Expected: FAIL, `assert 'sqlite' == 'postgresql'` (while `DATABASE_URL` is unset).

- [ ] **Step 3: Add the PostgreSQL launcher**

`tools/postgres/package.json`:
```json
{
  "name": "adss-dev-postgres",
  "private": true,
  "type": "module",
  "description": "Development PostgreSQL without a system install (spec §13).",
  "scripts": {
    "start": "node start.mjs"
  },
  "dependencies": {
    "embedded-postgres": "18.4.0-beta.17"
  }
}
```

`tools/postgres/start.mjs`:
```js
// Development PostgreSQL on 127.0.0.1:5433, data in tools/postgres/.pgdata (spec §13).
// Runs in the foreground; Ctrl+C stops it. Creates the adss role and database on first run.
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.join(here, ".pgdata");
const port = 5433;

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "postgres-dev-only",
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"], // UTF-8 whatever the Windows code page
  onLog: () => {},
});

if (!fs.existsSync(path.join(databaseDir, "PG_VERSION"))) await pg.initialise();
await pg.start();

const client = pg.getPgClient();
await client.connect();
const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'adss'");
if (role.rowCount === 0) await client.query("CREATE ROLE adss LOGIN CREATEDB PASSWORD 'adss-dev-only'");
const database = await client.query("SELECT 1 FROM pg_database WHERE datname = 'adss'");
if (database.rowCount === 0) await client.query("CREATE DATABASE adss OWNER adss");
await client.end();

console.log(`PostgreSQL ready on 127.0.0.1:${port} (database adss). Press Ctrl+C to stop.`);

async function stop() {
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
```

Run: `cd tools/postgres && npm install`, then start it in the background (`node start.mjs > server.log 2>&1`). Wait until `server.log` contains `PostgreSQL ready`. npm blocks the package's `hydrate-symlinks` postinstall; that is harmless on Windows, where its symlink list (`native/pg-symlinks.json`) is empty.

- [ ] **Step 4: Add the driver and point Django at PostgreSQL**

In `backend/requirements.txt`, add `psycopg[binary]==3.3.6`, then run `.venv/Scripts/python -m pip install -r requirements-dev.txt`.

In `backend/.env.example`, replace the two DATABASE_URL comment lines with:
```
# Development PostgreSQL from tools/postgres (cd tools/postgres && npm install && npm start).
# Production: the real server's URL. Unset falls back to SQLite (used only by the browser tests).
DATABASE_URL=postgres://adss:adss-dev-only@127.0.0.1:5433/adss
```
Add the same `DATABASE_URL=` line to the local `backend/.env`.

- [ ] **Step 5: Run every test on PostgreSQL**

Run: `cd backend && .venv/Scripts/python -m pytest -q`
Expected: all pass, including `test_tests_run_on_postgresql` and `test_accepts_ghanaian_letters_in_names`. That test fails on a WIN1252 database, which is why `initdbFlags` is set.

- [ ] **Step 6: Make the check script start PostgreSQL when needed**

In `scripts/check.sh`, insert before `echo "== Backend: lint"`:
```bash
echo "== Database"
PG_LOG="$ROOT/tools/postgres/server.log"
if ! "$PY" -c "import socket; socket.create_connection(('127.0.0.1', 5433), 1)" 2>/dev/null; then
  [ -d "$ROOT/tools/postgres/node_modules" ] || (cd "$ROOT/tools/postgres" && npm install --silent)
  (cd "$ROOT/tools/postgres" && nohup node start.mjs > "$PG_LOG" 2>&1 &)
  for _ in $(seq 60); do grep -q "PostgreSQL ready" "$PG_LOG" 2>/dev/null && break; sleep 1; done
fi
```

In `.gitignore`, add under `# Python`:
```
tools/postgres/node_modules/
tools/postgres/.pgdata/
tools/postgres/server.log
```

In `README.md`'s development setup, add before the Django steps: "Start the development database once per session: `cd tools/postgres && npm install && npm start` (leave it running)."

- [ ] **Step 7: Commit**

```bash
git add tools/postgres/package.json tools/postgres/package-lock.json tools/postgres/start.mjs backend/requirements.txt backend/.env.example backend/tests/test_database.py scripts/check.sh .gitignore README.md
git commit -m "Run development and tests on PostgreSQL from embedded-postgres"
```

---

### Task 1: Brand colours and school web addresses

**Files:**
- Create: `backend/apps/school/branding.py`, `backend/apps/school/slugs.py`
- Test: `backend/tests/school/test_branding.py`, `backend/tests/school/test_slugs.py`

**Interfaces:**
- Produces:
  - `branding.py`: `DEFAULT_PRIMARY = "#0f1a9e"`, `DEFAULT_ACCENT = "#f0ad1c"`, `PAPER`, `INK`, `DARK_CARD`, `MIN_CONTRAST = 4.5`, `ColourError(ValueError)` with `.suggestion`, `contrast(a, b) -> float`, `mix(a, b, amount) -> str`, `check_primary(value) -> str`, `check_accent(value) -> str`, `brand_tokens(primary, accent) -> {"light": dict[str, str], "dark": dict[str, str]}`.
  - `slugs.py`: `RESERVED`, `validate_slug(value)` (raises Django `ValidationError`).

- [ ] **Step 1: Write the failing tests**

`backend/tests/school/test_branding.py`:
```python
import pytest

from apps.school import branding
from apps.school.branding import (
    DARK_CARD,
    DEFAULT_ACCENT,
    DEFAULT_PRIMARY,
    INK,
    PAPER,
    ColourError,
    brand_tokens,
    check_accent,
    check_primary,
    contrast,
)


def test_contrast_follows_wcag():
    assert round(contrast("#000000", "#ffffff"), 1) == 21.0
    assert contrast("#777777", "#777777") == 1.0


def test_the_platform_palette_is_readable():
    assert check_primary(DEFAULT_PRIMARY) == DEFAULT_PRIMARY
    assert check_accent(DEFAULT_ACCENT) == DEFAULT_ACCENT


def test_colour_codes_are_normalised():
    assert check_primary(" #0F1A9E ") == "#0f1a9e"
    with pytest.raises(ColourError, match="colour code"):
        check_primary("blue")


def test_a_light_primary_is_refused_with_a_readable_suggestion():
    with pytest.raises(ColourError) as caught:
        check_primary("#7fb3ff")
    assert "4.5:1" in str(caught.value)
    assert contrast(caught.value.suggestion, PAPER) >= branding.MIN_CONTRAST
    assert caught.value.suggestion in str(caught.value)


def test_a_dark_accent_is_refused_with_a_readable_suggestion():
    with pytest.raises(ColourError) as caught:
        check_accent("#1b2a4a")
    assert contrast(caught.value.suggestion, INK) >= branding.MIN_CONTRAST


def test_the_platform_palette_needs_no_overrides():
    assert brand_tokens(DEFAULT_PRIMARY, DEFAULT_ACCENT) == {"light": {}, "dark": {}}


def test_school_colours_become_readable_tokens_in_both_themes():
    tokens = brand_tokens("#7a1f1f", "#ffd166")
    light, dark = tokens["light"], tokens["dark"]
    assert light["--btn-primary"] == light["--accent-indigo"] == "#7a1f1f"
    assert light["--brand-amber"] == dark["--brand-amber"] == "#ffd166"
    assert contrast(light["--accent-indigo"], PAPER) >= 4.5
    assert contrast(dark["--accent-indigo"], DARK_CARD) >= 4.5
    assert light["--mesh-glow"] == "rgb(255 209 102 / 0.35)"
```

`backend/tests/school/test_slugs.py`:
```python
import pytest
from django.core.exceptions import ValidationError

from apps.school.slugs import validate_slug


@pytest.mark.parametrize("slug", ["adsmart", "st-marys", "abc", "school-2", "a" * 30])
def test_valid_slugs(slug):
    validate_slug(slug)


@pytest.mark.parametrize(
    "slug", ["ab", "Adsmart", "1school", "a--b", "-abc", "abc-", "a_b", "a.b", "a" * 31, ""]
)
def test_invalid_slugs(slug):
    with pytest.raises(ValidationError, match="lowercase"):
        validate_slug(slug)


@pytest.mark.parametrize("slug", ["admin", "www", "api", "platform", "support"])
def test_reserved_slugs(slug):
    with pytest.raises(ValidationError, match="reserved"):
        validate_slug(slug)
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/school/test_branding.py tests/school/test_slugs.py -q`
Expected: ERROR, `ModuleNotFoundError: No module named 'apps.school.branding'`

- [ ] **Step 3: Write the two modules**

`backend/apps/school/branding.py`:
```python
"""School brand colours (amendment §7.2): readable by construction, with dark-mode variants.

Contrast follows WCAG 2.2: relative luminance and the (L1 + 0.05) / (L2 + 0.05) ratio.
"""

import re

DEFAULT_PRIMARY = "#0f1a9e"  # Warm Authority indigo (Phase 1 spec §8.1)
DEFAULT_ACCENT = "#f0ad1c"  # Warm Authority amber
PAPER = "#faf9f6"  # light page background
INK = "#14123a"  # dark text used on the accent
DARK_CARD = "#15133a"  # dark-mode card background
MIN_CONTRAST = 4.5
_HEX = re.compile(r"^#[0-9a-f]{6}$")


class ColourError(ValueError):
    def __init__(self, message: str, suggestion: str = ""):
        super().__init__(message)
        self.suggestion = suggestion


def _rgb(colour: str) -> tuple[int, int, int]:
    return int(colour[1:3], 16), int(colour[3:5], 16), int(colour[5:7], 16)


def _channel(value: int) -> float:
    value /= 255
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def luminance(colour: str) -> float:
    red, green, blue = (_channel(value) for value in _rgb(colour))
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def contrast(first: str, second: str) -> float:
    lighter, darker = sorted((luminance(first), luminance(second)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


def mix(colour: str, other: str, amount: float) -> str:
    """`amount` of the way from `colour` to `other`."""
    mixed = (a + (b - a) * amount for a, b in zip(_rgb(colour), _rgb(other), strict=True))
    return "#" + "".join(f"{round(value):02x}" for value in mixed)


def _nearest_readable(colour: str, towards: str, against: str) -> str:
    for step in range(21):
        candidate = mix(colour, towards, step / 20)
        if contrast(candidate, against) >= MIN_CONTRAST:
            return candidate
    return towards


def _normalise(value: str) -> str:
    colour = (value or "").strip().lower()
    if not _HEX.match(colour):
        raise ColourError("Use a colour code like #0f1a9e.")
    return colour


def check_primary(value: str) -> str:
    """Buttons with white text and links on the page background."""
    colour = _normalise(value)
    ratio = contrast(colour, PAPER)
    if ratio < MIN_CONTRAST:
        suggestion = _nearest_readable(colour, "#000000", PAPER)
        raise ColourError(
            f"{colour} is too light for white text and links ({ratio:.1f}:1; it needs 4.5:1). "
            f"Try {suggestion}.",
            suggestion,
        )
    return colour


def check_accent(value: str) -> str:
    """The main call to action, with dark text on it."""
    colour = _normalise(value)
    ratio = contrast(colour, INK)
    if ratio < MIN_CONTRAST:
        suggestion = _nearest_readable(colour, "#ffffff", INK)
        raise ColourError(
            f"{colour} is too dark for the dark text on it ({ratio:.1f}:1; it needs 4.5:1). "
            f"Try {suggestion}.",
            suggestion,
        )
    return colour


def _rgba(colour: str, alpha: float) -> str:
    red, green, blue = _rgb(colour)
    return f"rgb({red} {green} {blue} / {alpha})"


def brand_tokens(primary: str, accent: str) -> dict[str, dict[str, str]]:
    """CSS variables that replace the platform palette for one school. Empty for the default."""
    if (primary, accent) == (DEFAULT_PRIMARY, DEFAULT_ACCENT):
        return {"light": {}, "dark": {}}
    light = {
        "--accent-indigo": primary,
        "--btn-primary": primary,
        "--brand-amber": accent,
        "--mesh-a": primary,
        "--mesh-b": mix(primary, "#ffffff", 0.2),
        "--mesh-c": mix(primary, "#000000", 0.35),
        "--mesh-glow": _rgba(accent, 0.35),
        "--glass-clear-lite-bg": _rgba(primary, 0.88),
    }
    deep = mix(primary, "#000000", 0.55)
    dark = {
        "--accent-indigo": _nearest_readable(primary, "#ffffff", DARK_CARD),
        "--btn-primary": primary,
        "--brand-amber": accent,
        "--mesh-b": mix(primary, "#000000", 0.45),
        "--mesh-c": mix(primary, "#000000", 0.7),
        "--mesh-glow": _rgba(accent, 0.14),
        "--glass-clear-lite-bg": _rgba(deep, 0.92),
    }
    return {"light": light, "dark": dark}
```

`backend/apps/school/slugs.py`:
```python
"""School web-address names: <slug>.<platform domain> (amendment §2.2)."""

import re

from django.core.exceptions import ValidationError

RESERVED = frozenset(
    {
        "admin",
        "www",
        "api",
        "app",
        "mail",
        "static",
        "media",
        "platform",
        "support",
        "help",
        "status",
        "docs",
        "blog",
    }
)
_PATTERN = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")
RULES = "Use 3–30 lowercase letters, numbers or single hyphens, starting with a letter."


def validate_slug(value: str) -> None:
    if value in RESERVED:
        raise ValidationError(f"“{value}” is reserved for the platform. Choose another name.")
    if not (3 <= len(value) <= 30 and _PATTERN.match(value)):
        raise ValidationError(RULES)
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/school/test_branding.py tests/school/test_slugs.py -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/school/branding.py backend/apps/school/slugs.py backend/tests/school/test_branding.py backend/tests/school/test_slugs.py
git commit -m "Add readable brand colours and school address rules"
```

---

### Task 2: Schools as tenants: every website record belongs to a school

**Files:**
- Rewrite: `backend/apps/school/models.py`, `backend/apps/school/admin.py`, `backend/apps/consent/models.py`, `backend/apps/consent/admin.py`, `backend/apps/website/models.py`, `backend/apps/website/services.py`, `backend/apps/website/views.py`, `backend/apps/website/urls.py`, `backend/apps/website/seeding.py`, `backend/apps/website/admin.py`
- Create: `backend/apps/school/hosts.py`
- Modify: `backend/apps/core/models.py` (precomputed renditions), `backend/apps/website/enquiries.py`, `backend/apps/website/serializers.py` (levels offered), `backend/apps/website/seed_data.py` (`SCHOOL_SLUG`), `backend/config/settings.py`, `backend/config/settings_test.py`, `backend/.env.example`
- Migrations: delete `apps/school/migrations/0001_initial.py`, `apps/consent/migrations/0001_initial.py`, `apps/website/migrations/0001_initial.py` and `0002_enquiry.py`, then regenerate each app's `0001_initial`. Nothing is deployed, and the development database is new (Task 0).
- Tests: rewrite `backend/tests/conftest.py`, `backend/tests/website/conftest.py`, `test_public_api.py`, `test_enquiries.py`, `test_models.py`, `test_publication.py`, `test_seeding.py`, `backend/tests/consent/test_privacy_notice.py`. Append to `backend/tests/helpers.py`. Delete `backend/tests/school/test_profile.py`. Create `backend/tests/school/test_school.py`, `backend/tests/school/test_hosts.py`.

**Interfaces:**
- Consumes: `branding`, `validate_slug` (Task 1).
- Produces:
  - **`School`:** fields `slug`, `status` (`Status.TRIAL|ACTIVE|SUSPENDED`), the profile fields, `founded_year` (nullable), `levels_offered` (codes in `LEVEL_CODES` order), `brand_primary`, `brand_accent`, `logo` (+ `renditions`), `is_live`, `went_live_at`, `created_at`. Methods: `is_suspended`, `years_since_founding(today=None) -> int | None`, `primary_host() -> str`, `base_url() -> str`.
  - **`SchoolDomain`**, `SchoolOwned` (abstract; `objects.for_school(school)`), `SchoolOwnedQuerySet`, `LEVEL_CODES`, `all_levels()`.
  - **`hosts.py`:** `resolve_host(host) -> Site | None` (`Site.kind` is `"platform"|"admin"|"school"`, plus `Site.school`), `school_for_host(host) -> School` (404 / 503 `suspended`), `request_school(request) -> School`.
  - **`PrivacyNotice`:** gains `school` (null for the platform's own notice); `PrivacyNotice.current(school=None, today=None)`.
  - **`services.py`:** `publication_blockers(school)`, `is_site_public(school)`, `build_site_payload(school)` (adds `school.logo`, `school.base_url`, `school.levels_offered` and `brand`; `founded_year` and `years_since_founding` may be null).
  - **`enquiries.py`:** `phone_limit_reached(school, phone)`.
  - **`Fact.display_value(years) -> str | None`** (None when the value needs a founding year the school hasn't given).
  - **Public API:** `GET /api/public/sites/<host>/site|news|news/<slug>|privacy-notice`. `POST /api/public/enquiries` takes its school from the request host.
  - **Tests:** `tests.helpers.SCHOOL_DEFAULTS`, `tests.helpers.make_school(slug="adsmart", **fields)`; fixtures `school` (`adsmart`) and `other_school` (`brightfuture`: no founding year, levels `kg`, `lower_primary`); the `api` client defaults to host `adsmart.localhost`.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/helpers.py`, append:
```python


SCHOOL_DEFAULTS = {
    "name": "AD Smart School",
    "founded_year": 2001,
    "town": "Kronom, Kumasi",
    "region": "Ashanti",
    "phone": "+233545875881",
    "whatsapp": "+233545875881",
    "email": "school@example.com",
    "map_query": "Kronom, Kumasi, Ghana",
}


def make_school(slug="adsmart", **fields):
    from apps.school.models import School

    return School.objects.create(slug=slug, **{**SCHOOL_DEFAULTS, **fields})
```

`backend/tests/conftest.py`:
```python
import pytest
from django.core.cache import cache

from tests.helpers import make_school


@pytest.fixture(autouse=True)
def _isolated_media_and_cache(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / "media"
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api():
    from rest_framework.test import APIClient

    # Browser calls reach Django through Next.js, which forwards the school's address.
    return APIClient(HTTP_HOST="adsmart.localhost")


@pytest.fixture
def school(db):
    return make_school()


@pytest.fixture
def other_school(db):
    return make_school(
        "brightfuture",
        name="Bright Future Academy",
        founded_year=None,
        town="Ejisu",
        phone="+233201234567",
        whatsapp="",
        email="office@brightfuture.example",
        levels_offered=["kg", "lower_primary"],
    )
```

`backend/tests/school/test_school.py`:
```python
from datetime import date

import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.school.models import School, SchoolDomain
from tests.helpers import SCHOOL_DEFAULTS

pytestmark = pytest.mark.django_db


def build(**overrides):
    return School(**{"slug": "adsmart", **SCHOOL_DEFAULTS, **overrides})


def test_years_since_founding_is_unknown_without_a_founding_year():
    assert build().years_since_founding(date(2026, 10, 9)) == 25
    assert build(founded_year=None).years_since_founding(date(2026, 10, 9)) is None


def test_clean_normalises_phone_numbers():
    school = build(phone="030 212 3456", whatsapp="054 587 5881")
    school.full_clean()
    assert school.phone == "+233302123456"
    assert school.whatsapp == "+233545875881"


def test_clean_rejects_a_landline_for_whatsapp():
    with pytest.raises(ValidationError) as error:
        build(whatsapp="030 212 3456").full_clean()
    assert "whatsapp" in error.value.message_dict


def test_levels_are_kept_in_school_order_and_must_be_known():
    school = build(levels_offered=["jhs", "kg"])
    school.full_clean()
    assert school.levels_offered == ["kg", "jhs"]
    for levels in ([], ["university"]):
        with pytest.raises(ValidationError) as error:
            build(levels_offered=levels).full_clean()
        assert "levels_offered" in error.value.message_dict


def test_unreadable_brand_colours_and_reserved_slugs_are_refused():
    with pytest.raises(ValidationError) as error:
        build(slug="admin", brand_primary="#7fb3ff", brand_accent="#1b2a4a").full_clean()
    assert {"slug", "brand_primary", "brand_accent"} <= set(error.value.message_dict)


def test_new_schools_start_on_trial_in_preview_with_every_level(school):
    assert school.status == School.Status.TRIAL and school.is_live is False
    assert school.levels_offered == [
        "creche",
        "nursery",
        "kg",
        "lower_primary",
        "upper_primary",
        "jhs",
    ]


def test_addresses_prefer_a_verified_primary_domain(school, settings):
    settings.SITE_URL_TEMPLATE = "https://{host}"
    assert school.primary_host() == "adsmart.localhost"
    assert school.base_url() == "https://adsmart.localhost"

    SchoolDomain.objects.create(school=school, domain="AdSmartSchool.edu.gh", is_primary=True)
    assert school.primary_host() == "adsmart.localhost"  # not verified yet

    SchoolDomain.objects.filter(school=school).update(verified_at=timezone.now())
    assert school.base_url() == "https://adsmartschool.edu.gh"
```

`backend/tests/school/test_hosts.py`:
```python
import pytest
from django.http import Http404
from django.utils import timezone

from apps.core.exceptions import ApiError
from apps.school.hosts import resolve_host, school_for_host
from apps.school.models import School, SchoolDomain

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    ("host", "kind"),
    [
        ("localhost", "platform"),
        ("localhost:3000", "platform"),
        ("www.localhost", "platform"),
        ("admin.localhost:3000", "admin"),
    ],
)
def test_platform_and_admin_addresses(host, kind):
    assert resolve_host(host).kind == kind


def test_a_school_subdomain(school):
    site = resolve_host("AdSmart.localhost:3000")
    assert site.kind == "school" and site.school == school


def test_a_verified_custom_domain(school):
    SchoolDomain.objects.create(
        school=school, domain="adsmartschool.edu.gh", verified_at=timezone.now()
    )
    assert resolve_host("adsmartschool.edu.gh").school == school


@pytest.mark.parametrize(
    "host",
    [
        "pending.example",
        "nobody.localhost",
        "a.adsmart.localhost",
        "example.com",
        "127.0.0.1:8000",
        "",
    ],
)
def test_unknown_and_unverified_addresses(school, host):
    SchoolDomain.objects.create(school=school, domain="pending.example")
    assert resolve_host(host) is None


def test_school_for_host_refuses_unknown_and_suspended_schools(school):
    with pytest.raises(Http404):
        school_for_host("nobody.localhost")
    school.status = School.Status.SUSPENDED
    school.save()
    with pytest.raises(ApiError) as caught:
        school_for_host("adsmart.localhost")
    assert caught.value.status_code == 503
    assert caught.value.get_codes() == "suspended"
```

`backend/tests/website/conftest.py`:
```python
from datetime import date

import pytest

from apps.consent.models import PrivacyNotice
from apps.website.models import ContentBlock, PhotoSlot
from tests.helpers import jpeg_upload


@pytest.fixture
def ready_site(school):
    """Everything reviewed, real and live: the site should be public."""
    ContentBlock.objects.create(
        school=school, key="hero_headline", text="Bright beginnings", needs_review=False
    )
    PhotoSlot.objects.create(
        school=school,
        key="hero",
        image=jpeg_upload(),
        alt_text="Children playing",
        is_placeholder=False,
    )
    PrivacyNotice.objects.create(
        school=school,
        version="1",
        body="We protect your data.",
        effective_from=date(2026, 1, 1),
        is_draft=False,
    )
    school.is_live = True
    school.save()
    return school
```

`backend/tests/website/test_publication.py`:
```python
import pytest

from apps.consent.models import PrivacyNotice
from apps.website.models import ContentBlock, PhotoSlot
from apps.website.services import is_site_public, publication_blockers

pytestmark = pytest.mark.django_db


def test_a_new_site_is_not_public(school):
    assert is_site_public(school) is False
    assert "The site has not been marked live" in publication_blockers(school)
    assert "The privacy notice has not been reviewed" in publication_blockers(school)


def test_the_site_is_public_when_everything_is_ready(ready_site):
    assert publication_blockers(ready_site) == []
    assert is_site_public(ready_site) is True


@pytest.mark.parametrize("spoiler", ["placeholder_photo", "draft_text", "draft_notice", "not_live"])
def test_each_blocker_keeps_the_site_in_preview(ready_site, spoiler):
    if spoiler == "placeholder_photo":
        PhotoSlot.objects.update(is_placeholder=True)
    elif spoiler == "draft_text":
        ContentBlock.objects.update(needs_review=True)
    elif spoiler == "draft_notice":
        PrivacyNotice.objects.update(is_draft=True)
    else:
        ready_site.is_live = False
        ready_site.save()

    assert is_site_public(ready_site) is False
    assert len(publication_blockers(ready_site)) == 1


def test_another_schools_drafts_do_not_block_this_site(ready_site, other_school):
    ContentBlock.objects.create(school=other_school, key="hero_headline", text="Draft")
    assert is_site_public(ready_site) is True
```

`backend/tests/website/test_public_api.py`:
```python
from datetime import date, timedelta

import pytest
from django.utils import timezone

from apps.consent.models import PrivacyNotice
from apps.school.models import School
from apps.website.models import ContentBlock, Fact, FeatureBlock, NewsPost, PhotoSlot
from tests.helpers import jpeg_upload

pytestmark = pytest.mark.django_db
SITE = "/api/public/sites/adsmart.localhost"
OTHER = "/api/public/sites/brightfuture.localhost"


def test_site_payload_describes_the_school(api, school, settings):
    settings.SITE_URL_TEMPLATE = "https://{host}"
    ContentBlock.objects.create(school=school, key="hero_headline", text="Bright beginnings")
    Fact.objects.create(school=school, label="years serving Kronom", value="{years}", order=1)
    Fact.objects.create(school=school, label="hidden", value="x", visible=False)
    FeatureBlock.objects.create(
        school=school, key="sms", title="SMS", text="t", icon="message", enabled=True
    )
    FeatureBlock.objects.create(school=school, key="momo", title="MoMo", text="t", icon="phone")
    years = timezone.localdate().year - 2001

    body = api.get(f"{SITE}/site").json()

    assert body["school"]["name"] == "AD Smart School"
    assert body["school"]["phone_display"] == "054 587 5881"
    assert body["school"]["whatsapp_link"] == "https://wa.me/233545875881"
    assert body["school"]["years_since_founding"] == years
    assert body["school"]["base_url"] == "https://adsmart.localhost"
    assert body["school"]["logo"] is None
    assert body["school"]["levels_offered"][0] == "creche"
    assert body["brand"] == {"light": {}, "dark": {}}
    assert body["content"] == {"hero_headline": "Bright beginnings"}
    assert body["facts"] == [{"label": "years serving Kronom", "value": str(years)}]
    assert [f["key"] for f in body["features"]] == ["sms"]
    assert body["is_public"] is False


def test_years_facts_are_hidden_without_a_founding_year(api, other_school):
    Fact.objects.create(school=other_school, label="years serving Ejisu", value="{years}")
    Fact.objects.create(school=other_school, label="levels under one roof", value="KG–Basic 3")

    body = api.get(f"{OTHER}/site").json()

    assert body["school"]["founded_year"] is None
    assert body["facts"] == [{"label": "levels under one roof", "value": "KG–Basic 3"}]


def test_school_colours_arrive_as_css_variables(api, school):
    school.brand_primary, school.brand_accent = "#7a1f1f", "#ffd166"
    school.save()

    body = api.get(f"{SITE}/site").json()

    assert body["brand"]["light"]["--btn-primary"] == "#7a1f1f"
    assert "--accent-indigo" in body["brand"]["dark"]


def test_site_payload_splits_gallery_photos_from_named_slots(api, school):
    PhotoSlot.objects.create(school=school, key="hero", image=jpeg_upload(), alt_text="Hero")
    PhotoSlot.objects.create(
        school=school, key="gallery_02", image=jpeg_upload(), alt_text="B", caption="Two", order=2
    )
    PhotoSlot.objects.create(
        school=school, key="gallery_01", image=jpeg_upload(), alt_text="A", caption="One", order=1
    )

    body = api.get(f"{SITE}/site").json()

    assert set(body["photos"]) == {"hero"}
    assert body["photos"]["hero"]["src"].startswith(f"/media/schools/{school.pk}/photos/")
    assert body["photos"]["hero"]["is_placeholder"] is True
    assert [p["caption"] for p in body["gallery"]] == ["One", "Two"]


def test_each_school_sees_only_its_own_content(api, school, other_school):
    ContentBlock.objects.create(school=school, key="hero_headline", text="AD Smart")
    ContentBlock.objects.create(school=other_school, key="hero_headline", text="Bright Future")

    assert api.get(f"{SITE}/site").json()["content"] == {"hero_headline": "AD Smart"}
    assert api.get(f"{OTHER}/site").json()["content"] == {"hero_headline": "Bright Future"}


def test_unknown_addresses_are_not_found(api, db):
    response = api.get("/api/public/sites/nobody.localhost/site")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_a_suspended_school_is_unavailable(api, school):
    school.status = School.Status.SUSPENDED
    school.save()

    response = api.get(f"{SITE}/site")

    assert response.status_code == 503
    assert response.json()["code"] == "suspended"


def _post(school, slug, *, published=True, hours_ago=1):
    return NewsPost.objects.create(
        school=school,
        title=slug.title(),
        slug=slug,
        summary=f"About {slug}",
        body=f"Body of {slug}",
        status=NewsPost.Status.PUBLISHED if published else NewsPost.Status.DRAFT,
        published_at=timezone.now() - timedelta(hours=hours_ago),
    )


def test_news_lists_published_posts_newest_first_with_a_limit(api, school):
    _post(school, "older", hours_ago=5)
    _post(school, "newer", hours_ago=1)
    _post(school, "draft", published=False)

    body = api.get(f"{SITE}/news?limit=1").json()

    assert [p["slug"] for p in body] == ["newer"]
    assert body[0]["cover"] is None
    assert "body" not in body[0]


def test_news_limit_falls_back_on_nonsense(api, school):
    _post(school, "only")
    assert len(api.get(f"{SITE}/news?limit=abc").json()) == 1


def test_news_detail_includes_the_body(api, school):
    _post(school, "hello")
    assert api.get(f"{SITE}/news/hello").json()["body"] == "Body of hello"


def test_draft_news_and_other_schools_news_are_not_found(api, school, other_school):
    _post(school, "draft", published=False)
    _post(other_school, "theirs")

    assert api.get(f"{SITE}/news/draft").status_code == 404
    assert api.get(f"{SITE}/news/theirs").status_code == 404
    assert api.get(f"{SITE}/news").json() == []


def test_privacy_notice_is_the_schools_current_version(api, school, other_school):
    PrivacyNotice.objects.create(
        school=school, version="1", body="Old.", effective_from=date(2025, 1, 1), is_draft=False
    )
    PrivacyNotice.objects.create(
        school=school, version="2", body="Ours.", effective_from=date(2026, 1, 1)
    )
    PrivacyNotice.objects.create(
        school=other_school, version="9", body="Theirs.", effective_from=date(2026, 6, 1)
    )

    body = api.get(f"{SITE}/privacy-notice").json()

    assert body["version"] == "2" and body["body"] == "Ours." and body["is_draft"] is True


def test_privacy_notice_404_when_the_school_has_none(api, school):
    assert api.get(f"{SITE}/privacy-notice").status_code == 404
```

`backend/tests/website/test_models.py`:
```python
from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.website.models import ContentBlock, Fact, NewsPost, PhotoSlot
from tests.helpers import jpeg_upload

pytestmark = pytest.mark.django_db


def test_photo_slot_builds_renditions_when_created(school):
    slot = PhotoSlot.objects.create(
        school=school, key="hero", image=jpeg_upload(size=(1200, 800)), alt_text="x"
    )

    slot.refresh_from_db()
    assert [r["width"] for r in slot.renditions] == [480, 960, 1200]
    assert slot.image.name.startswith(f"schools/{school.pk}/photos/")


def test_photo_slot_rebuilds_only_when_the_image_changes(school, monkeypatch):
    slot = PhotoSlot.objects.create(school=school, key="hero", image=jpeg_upload(), alt_text="x")
    calls = []
    monkeypatch.setattr("apps.core.models.build_renditions", lambda name: calls.append(name) or [])

    slot.alt_text = "Better alt text"
    slot.save()
    assert calls == []

    slot.image = jpeg_upload(name="replacement.jpg")
    slot.save()
    assert len(calls) == 1


def test_renditions_given_up_front_are_kept(school, monkeypatch):
    calls = []
    monkeypatch.setattr("apps.core.models.build_renditions", lambda name: calls.append(name) or [])
    ready = [{"width": 480, "height": 360, "name": "placeholders/hero-480w.webp"}]

    slot = PhotoSlot.objects.create(
        school=school, key="hero", image="placeholders/hero.jpg", renditions=ready, alt_text="x"
    )

    assert calls == []
    slot.refresh_from_db()
    assert slot.renditions == ready


def test_keys_are_unique_within_a_school_only(school, other_school):
    ContentBlock.objects.create(school=school, key="hero_headline", text="a")
    ContentBlock.objects.create(school=other_school, key="hero_headline", text="b")
    with pytest.raises(IntegrityError), transaction.atomic():
        ContentBlock.objects.create(school=school, key="hero_headline", text="c")


def test_news_cover_is_optional_and_has_no_renditions_without_it(school):
    post = NewsPost.objects.create(school=school, title="Hello", slug="hello", summary="s", body="b")
    assert post.renditions == []


def test_published_news_excludes_drafts_and_future_posts(school):
    now = timezone.now()
    common = {"school": school, "summary": "s", "body": "b"}
    NewsPost.objects.create(
        title="Live",
        slug="live",
        status=NewsPost.Status.PUBLISHED,
        published_at=now - timedelta(hours=1),
        **common,
    )
    NewsPost.objects.create(title="Draft", slug="draft", **common)
    NewsPost.objects.create(
        title="Later",
        slug="later",
        status=NewsPost.Status.PUBLISHED,
        published_at=now + timedelta(days=1),
        **common,
    )

    assert [p.slug for p in NewsPost.objects.for_school(school).published()] == ["live"]


def test_fact_values_show_years_since_founding_or_hide():
    fact = Fact(label="years serving Kronom", value="{years}")
    assert fact.display_value(25) == "25"
    assert fact.display_value(None) is None
    assert Fact(label="levels", value="KG–JHS").display_value(None) == "KG–JHS"
```

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
    assert enquiry.school == school
    assert enquiry.phone == "+233241234567"
    assert enquiry.status == Enquiry.Status.NEW
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["school@example.com"]
    assert mail.outbox[0].subject == "New admission enquiry: Lower Primary (Basic 1–3)"
    assert "Ama Mensah" in mail.outbox[0].body
    assert "024 123 4567" in mail.outbox[0].body


def test_enquiries_go_to_the_school_at_the_address_used(api, school, other_school, payload):
    response = api.post(URL, payload, format="json", HTTP_HOST="brightfuture.localhost")

    assert response.status_code == 201
    assert Enquiry.objects.get().school == other_school
    assert mail.outbox[0].to == ["office@brightfuture.example"]


def test_enquiries_to_an_unknown_address_are_not_found(api, db, payload):
    response = api.post(URL, payload, format="json", HTTP_HOST="nobody.localhost")

    assert response.status_code == 404
    assert Enquiry.objects.count() == 0


def test_the_level_must_be_one_the_school_teaches(api, other_school, payload):
    payload["level_wanted"] = "jhs"

    response = api.post(URL, payload, format="json", HTTP_HOST="brightfuture.localhost")

    assert response.status_code == 400
    assert response.json()["fields"]["level_wanted"] == [
        "We don't teach that level. Choose one of the levels listed."
    ]


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


def test_the_phone_limit_is_counted_per_school(api, school, other_school, payload):
    for _ in range(3):
        api.post(URL, payload, format="json")
    payload["level_wanted"] = "kg"

    response = api.post(URL, payload, format="json", HTTP_HOST="brightfuture.localhost")

    assert response.status_code == 201


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


def test_ip_throttle_uses_the_address_added_by_the_reverse_proxy(api, school, payload):
    """Caddy appends the real client IP; Next.js passes the header through unchanged.
    A forged first entry must not let a visitor dodge the per-IP limit."""
    payload["data_consent"] = False
    forged = [
        api.post(
            URL, payload, format="json", HTTP_X_FORWARDED_FOR=f"10.0.0.{n}, 203.0.113.7"
        ).status_code
        for n in range(31)
    ]

    assert forged[30] == 429
```

`backend/tests/website/test_seeding.py`:
```python
import pytest

from apps.consent.models import PrivacyNotice
from apps.school.models import School
from apps.website.models import ContentBlock, FeatureBlock, NewsPost, PhotoSlot
from apps.website.seed_data import LEVEL_CODES
from apps.website.seeding import seed_website
from apps.website.services import is_site_public

pytestmark = pytest.mark.django_db


def test_seed_creates_ad_smart_school_with_a_complete_preview_site():
    created = seed_website()

    school = School.objects.get(slug="adsmart")
    assert created > 0
    assert school.phone == "+233545875881"
    assert PhotoSlot.objects.for_school(school).count() == 14
    assert not PhotoSlot.objects.filter(is_placeholder=False).exists()
    assert all(slot.renditions for slot in PhotoSlot.objects.all())
    assert not FeatureBlock.objects.filter(enabled=True).exists()
    assert NewsPost.objects.for_school(school).published().count() == 1
    assert PrivacyNotice.current(school).is_draft is True
    assert is_site_public(school) is False


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

`backend/tests/consent/test_privacy_notice.py`:
```python
from datetime import date

import pytest

from apps.consent.models import PrivacyNotice

pytestmark = pytest.mark.django_db


def notice(school, version, body, effective):
    return PrivacyNotice.objects.create(
        school=school, version=version, body=body, effective_from=effective
    )


def test_current_is_the_schools_latest_notice_already_in_effect(school, other_school):
    notice(school, "1", "Old.", date(2026, 1, 1))
    notice(school, "2", "Now.", date(2026, 9, 1))
    notice(school, "3", "Later.", date(2027, 1, 1))
    notice(other_school, "4", "Theirs.", date(2026, 10, 1))

    assert PrivacyNotice.current(school, date(2026, 10, 9)).version == "2"


def test_the_platform_has_its_own_notice(school):
    notice(school, "1", "School.", date(2026, 1, 1))
    notice(None, "p1", "Platform.", date(2026, 1, 1))

    assert PrivacyNotice.current(None, date(2026, 10, 9)).body == "Platform."


def test_current_is_none_when_nothing_is_in_effect(school):
    notice(school, "1", "Future.", date(2027, 1, 1))

    assert PrivacyNotice.current(school, date(2026, 10, 9)) is None


def test_new_notices_start_as_drafts(school):
    assert notice(school, "1", "x", date(2026, 1, 1)).is_draft is True
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/school tests/website tests/consent -q`
Expected: collection errors such as `ImportError: cannot import name 'School' from 'apps.school.models'`.

- [ ] **Step 3: Write the school models, hosts and settings**

`backend/apps/school/models.py`:
```python
"""Schools on the platform (multi-school amendment §3). Every school-owned record points here."""

from datetime import date

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.core.models import ImageRenditionsMixin
from apps.core.phones import normalise_gh_phone
from apps.school import branding
from apps.school.slugs import validate_slug

LEVEL_CODES = ("creche", "nursery", "kg", "lower_primary", "upper_primary", "jhs")


def all_levels() -> list[str]:
    return list(LEVEL_CODES)


def logo_upload_to(instance, filename: str) -> str:
    return f"schools/{instance.pk}/logo/{filename}"  # the school is saved before its logo


class School(ImageRenditionsMixin):
    """One school: identity, contact details, web address, levels and brand."""

    rendition_source_field = "logo"

    class Status(models.TextChoices):
        TRIAL = "trial", "Trial"
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"

    slug = models.CharField(
        max_length=30,
        unique=True,
        validators=[validate_slug],
        help_text="The school's web address: <slug>.<platform domain>. Fixed once created.",
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.TRIAL)
    name = models.CharField(max_length=120)
    motto = models.CharField(max_length=200, blank=True)
    founded_year = models.PositiveSmallIntegerField(null=True, blank=True)
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
    levels_offered = models.JSONField(
        default=all_levels, help_text="Codes of the levels the school teaches."
    )
    brand_primary = models.CharField(max_length=7, default=branding.DEFAULT_PRIMARY)
    brand_accent = models.CharField(max_length=7, default=branding.DEFAULT_ACCENT)
    logo = models.ImageField(upload_to=logo_upload_to, blank=True)
    is_live = models.BooleanField(
        default=False,
        help_text="Marked live by the school. The site stays in preview until every check passes.",
    )
    went_live_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

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
        levels = self.levels_offered or []
        if not levels or any(code not in LEVEL_CODES for code in levels):
            errors["levels_offered"] = "Choose at least one of the school's levels."
        else:
            self.levels_offered = [code for code in LEVEL_CODES if code in levels]
        for field, check in (
            ("brand_primary", branding.check_primary),
            ("brand_accent", branding.check_accent),
        ):
            try:
                setattr(self, field, check(getattr(self, field)))
            except branding.ColourError as exc:
                errors[field] = str(exc)
        if errors:
            raise ValidationError(errors)

    @property
    def is_suspended(self) -> bool:
        return self.status == self.Status.SUSPENDED

    def years_since_founding(self, today: date | None = None) -> int | None:
        if self.founded_year is None:
            return None
        return (today or timezone.localdate()).year - self.founded_year

    def primary_host(self) -> str:
        domain = self.domains.filter(is_primary=True, verified_at__isnull=False).first()
        return domain.domain if domain else f"{self.slug}.{settings.PLATFORM_DOMAIN}"

    def base_url(self) -> str:
        return settings.SITE_URL_TEMPLATE.format(host=self.primary_host())


class SchoolDomain(models.Model):
    """A school's own web address, e.g. adsmartschool.edu.gh (amendment §2.3)."""

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="domains")
    domain = models.CharField(max_length=253, unique=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    is_primary = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["school"], condition=Q(is_primary=True), name="school_one_primary_domain"
            )
        ]

    def __str__(self) -> str:
        return self.domain

    def save(self, *args, **kwargs):
        self.domain = self.domain.strip().lower().rstrip(".")
        super().save(*args, **kwargs)


class SchoolOwnedQuerySet(models.QuerySet):
    def for_school(self, school: School):
        return self.filter(school=school)


class SchoolOwned(models.Model):
    """Base for every record that belongs to one school (amendment §3.2)."""

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="+")

    objects = SchoolOwnedQuerySet.as_manager()

    class Meta:
        abstract = True
```

`backend/apps/school/hosts.py`:
```python
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
    if domain == f"admin.{root}":
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


def school_for_host(host: str) -> School:
    """The school at this address: 404 if there is none, 503 while it is suspended."""
    site = resolve_host(host)
    if site is None or site.school is None:
        raise Http404("No school is registered at this address.")
    if site.school.is_suspended:
        raise ApiError("suspended", UNAVAILABLE, 503)
    return site.school


def request_school(request) -> School:
    """The school whose address the browser used, forwarded by Next.js (amendment §2.4)."""
    return school_for_host(request.get_host())
```

`backend/apps/school/admin.py`:
```python
from django.contrib import admin

from apps.school.models import School, SchoolDomain


class SchoolDomainInline(admin.TabularInline):
    model = SchoolDomain
    extra = 0


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "status", "is_live", "created_at"]
    list_filter = ["status", "is_live"]
    search_fields = ["name", "slug", "town"]
    inlines = [SchoolDomainInline]
```

In `backend/config/settings.py`, replace the `ALLOWED_HOSTS = …` line with:
```python
# Any host may reach Django because only Next.js (on the same machine) can: each request's
# host is matched to a school by apps.school.hosts, and unknown hosts get 404 (amendment §2.4).
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["*"])
USE_X_FORWARDED_HOST = True

PLATFORM_NAME = env("PLATFORM_NAME", default="SchoolSite")
PLATFORM_DOMAIN = env("PLATFORM_DOMAIN", default="localhost")
PLATFORM_EMAIL = env("PLATFORM_EMAIL", default="")
# How a school's address is written in links: development "http://{host}:3000",
# production "https://{host}".
SITE_URL_TEMPLATE = env("SITE_URL_TEMPLATE", default="http://{host}:3000")
```

In `backend/config/settings_test.py`, append:
```python
PLATFORM_NAME = "SchoolSite"
PLATFORM_DOMAIN = "localhost"
PLATFORM_EMAIL = "hello@schoolsite.test"
SITE_URL_TEMPLATE = "http://{host}:3000"
ALLOWED_HOSTS = ["*"]
```

In `backend/.env.example`, replace the `DJANGO_ALLOWED_HOSTS=…` line with:
```
# Leave DJANGO_ALLOWED_HOSTS unset: Django is reachable only through Next.js, which forwards
# each visitor's address, and Django matches it to a school (or answers 404).
PLATFORM_NAME=SchoolSite
PLATFORM_DOMAIN=localhost
PLATFORM_EMAIL=
SITE_URL_TEMPLATE=http://{host}:3000
```
Also delete any `DJANGO_ALLOWED_HOSTS` line from the local `backend/.env`.

- [ ] **Step 4: Scope the privacy notice and the website records**

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
    """A versioned privacy notice (Data Protection Act 2012, Act 843).

    Each school has its own; a notice with no school is the platform's own (amendment §6).
    """

    school = models.ForeignKey(
        "school.School",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="+",
        help_text="Empty for the platform's own notice.",
    )
    version = models.CharField(max_length=20)
    title = models.CharField(max_length=120, default="Privacy notice")
    body = models.TextField(help_text=FORMAT_HELP)
    effective_from = models.DateField()
    is_draft = models.BooleanField(
        default=True,
        help_text="Untick once the wording has been reviewed. Drafts keep the site in preview.",
    )

    class Meta:
        ordering = ["-effective_from", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["school", "version"], name="consent_notice_version")
        ]

    def __str__(self) -> str:
        return f"{self.title} v{self.version}"

    @classmethod
    def current(cls, school=None, today: date | None = None) -> PrivacyNotice | None:
        return cls.objects.filter(
            school=school, effective_from__lte=today or timezone.localdate()
        ).first()
```

`backend/apps/consent/admin.py`:
```python
from django.contrib import admin

from apps.consent.models import PrivacyNotice


@admin.register(PrivacyNotice)
class PrivacyNoticeAdmin(admin.ModelAdmin):
    list_display = ["title", "version", "school", "effective_from", "is_draft"]
    list_filter = ["school", "is_draft"]
```

In `backend/apps/core/models.py`, inside `ImageRenditionsMixin.save`, replace the `changed = …` statement with:
```python
        # Renditions given up front (shared placeholder photos) are kept as they are.
        changed = bool(name_before_save) and (
            (self._state.adding and not self.renditions) or name_before_save != self._rendered_name
        )
```

`backend/apps/website/models.py`:
```python
from django.db import models
from django.utils import timezone

from apps.consent.models import FORMAT_HELP
from apps.core.models import ImageRenditionsMixin
from apps.school.models import SchoolOwned, SchoolOwnedQuerySet


def photo_upload_to(instance, filename: str) -> str:
    return f"schools/{instance.school_id}/photos/{filename}"


def news_upload_to(instance, filename: str) -> str:
    return f"schools/{instance.school_id}/news/{filename}"


def _unique_per_school(model: str, field: str) -> models.UniqueConstraint:
    return models.UniqueConstraint(fields=["school", field], name=f"website_{model}_{field}")


class ContentBlock(SchoolOwned):
    """One editable piece of website text, looked up by key."""

    key = models.SlugField(max_length=60)
    text = models.TextField(help_text=FORMAT_HELP)
    help_text = models.CharField(max_length=200, blank=True)
    needs_review = models.BooleanField(
        default=True,
        help_text="Ticked while the text is provisional. The site stays in preview until "
        "every block is reviewed.",
    )

    class Meta:
        ordering = ["key"]
        constraints = [_unique_per_school("contentblock", "key")]

    def __str__(self) -> str:
        return self.key


class PhotoSlot(ImageRenditionsMixin, SchoolOwned):
    key = models.SlugField(max_length=40)
    image = models.ImageField(upload_to=photo_upload_to)
    alt_text = models.CharField(max_length=200)
    caption = models.CharField(max_length=120, blank=True)
    is_placeholder = models.BooleanField(
        default=True, help_text="Ticked while this is not a real photo of the school."
    )
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "key"]
        constraints = [_unique_per_school("photoslot", "key")]

    def __str__(self) -> str:
        return self.key


class Fact(SchoolOwned):
    YEARS_TOKEN = "{years}"

    label = models.CharField(max_length=80)
    value = models.CharField(max_length=40, help_text="Use {years} for years since founding.")
    order = models.PositiveSmallIntegerField(default=0)
    visible = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return f"{self.value} {self.label}"

    def display_value(self, years: int | None) -> str | None:
        """The value to show, or None when it needs a founding year the school hasn't given."""
        if self.YEARS_TOKEN not in self.value:
            return self.value
        return None if years is None else self.value.replace(self.YEARS_TOKEN, str(years))


class FeatureBlock(SchoolOwned):
    """A "For parents" promise. Off by default: switch on only once the feature is live."""

    class Icon(models.TextChoices):
        MESSAGE = "message", "Message"
        PHONE = "phone", "Phone"
        CARE = "care", "Care"
        SHIELD = "shield", "Shield"

    key = models.SlugField(max_length=40)
    title = models.CharField(max_length=80)
    text = models.CharField(max_length=240)
    icon = models.CharField(max_length=20, choices=Icon.choices)
    enabled = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "key"]
        constraints = [_unique_per_school("featureblock", "key")]

    def __str__(self) -> str:
        return self.title


class NewsPostQuerySet(SchoolOwnedQuerySet):
    def published(self):
        return self.filter(status=NewsPost.Status.PUBLISHED, published_at__lte=timezone.now())


class NewsPost(ImageRenditionsMixin, SchoolOwned):
    rendition_source_field = "cover"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"

    title = models.CharField(max_length=160)
    slug = models.SlugField(max_length=170)
    summary = models.CharField(max_length=240)
    body = models.TextField(help_text=FORMAT_HELP)
    cover = models.ImageField(upload_to=news_upload_to, blank=True)
    cover_alt = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)

    objects = NewsPostQuerySet.as_manager()

    class Meta:
        ordering = ["-published_at", "-id"]
        constraints = [_unique_per_school("newspost", "slug")]

    def __str__(self) -> str:
        return self.title


class Enquiry(SchoolOwned):
    """An admissions enquiry from a school's website (Phase 1 spec §6.4)."""

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

`backend/apps/website/services.py`:
```python
"""Website rules that span several models, always for one school."""

from apps.consent.models import PrivacyNotice
from apps.core.images import image_payload
from apps.core.phones import format_gh_local, whatsapp_link
from apps.school.branding import brand_tokens
from apps.school.models import School
from apps.website.models import ContentBlock, Fact, FeatureBlock, NewsPost, PhotoSlot


def publication_blockers(school: School) -> list[str]:
    """Everything still keeping the site in preview (Phase 1 spec §6.5). Empty means public."""
    blockers = []
    placeholders = PhotoSlot.objects.for_school(school).filter(is_placeholder=True).count()
    if placeholders:
        blockers.append(f"{placeholders} photo slot(s) still use placeholder photos")
    provisional = ContentBlock.objects.for_school(school).filter(needs_review=True).count()
    if provisional:
        blockers.append(f"{provisional} text block(s) still need review")
    notice = PrivacyNotice.current(school)
    if notice is None or notice.is_draft:
        blockers.append("The privacy notice has not been reviewed")
    if not school.is_live:
        blockers.append("The site has not been marked live")
    return blockers


def is_site_public(school: School) -> bool:
    return not publication_blockers(school)


def _photo(slot: PhotoSlot) -> dict | None:
    payload = image_payload(slot.renditions, slot.alt_text)
    if payload is None:
        return None
    return {**payload, "caption": slot.caption, "is_placeholder": slot.is_placeholder}


def build_site_payload(school: School) -> dict:
    years = school.years_since_founding()
    slots = list(PhotoSlot.objects.for_school(school))
    facts = Fact.objects.for_school(school).filter(visible=True)
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
            "logo": image_payload(school.renditions, f"{school.name} logo"),
            "base_url": school.base_url(),
            "levels_offered": school.levels_offered,
        },
        "brand": brand_tokens(school.brand_primary, school.brand_accent),
        "is_public": is_site_public(school),
        "content": {block.key: block.text for block in ContentBlock.objects.for_school(school)},
        "facts": [
            {"label": fact.label, "value": value}
            for fact in facts
            if (value := fact.display_value(years)) is not None
        ],
        "features": [
            {"key": f.key, "title": f.title, "text": f.text, "icon": f.icon}
            for f in FeatureBlock.objects.for_school(school).filter(enabled=True)
        ],
        "photos": {s.key: _photo(s) for s in slots if not s.key.startswith("gallery_")},
        "gallery": [photo for s in slots if s.key.startswith("gallery_") and (photo := _photo(s))],
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

`backend/apps/website/views.py`:
```python
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.consent.models import PrivacyNotice
from apps.core.exceptions import ApiError
from apps.school.hosts import request_school, school_for_host
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
    """Anonymous endpoints for the public websites."""

    authentication_classes = []
    permission_classes = [AllowAny]


class SiteView(PublicView):
    def get(self, request, host):
        return Response(build_site_payload(school_for_host(host)))


class NewsListView(PublicView):
    def get(self, request, host):
        school = school_for_host(host)
        try:
            limit = int(request.query_params.get("limit", DEFAULT_NEWS_LIMIT))
        except ValueError:
            limit = DEFAULT_NEWS_LIMIT
        limit = max(1, min(limit, MAX_NEWS_LIMIT))
        posts = NewsPost.objects.for_school(school).published()[:limit]
        return Response([news_summary(post) for post in posts])


class NewsDetailView(PublicView):
    def get(self, request, host, slug):
        posts = NewsPost.objects.for_school(school_for_host(host)).published()
        post = get_object_or_404(posts, slug=slug)
        return Response({**news_summary(post), "body": post.body})


class PrivacyNoticeView(PublicView):
    def get(self, request, host):
        notice = PrivacyNotice.current(school_for_host(host))
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
        school = request_school(request)
        if request.data.get("website"):  # honeypot: pretend success, keep nothing
            return Response({"status": "received"}, status=201)
        check_form_token(str(request.data.get("form_token", "")))
        serializer = EnquirySerializer(data=request.data, context={"school": school})
        serializer.is_valid(raise_exception=True)
        if phone_limit_reached(school, serializer.validated_data["phone"]):
            raise ApiError(
                "too_many_enquiries",
                "We already have your recent enquiries and will call you soon.",
                429,
            )
        enquiry = Enquiry.objects.create(school=school, **serializer.validated_data)
        notify_school(enquiry)
        return Response({"status": "received"}, status=201)
```

`backend/apps/website/urls.py`:
```python
from django.urls import path

from apps.website import views

urlpatterns = [
    path("sites/<str:host>/site", views.SiteView.as_view(), name="public-site"),
    path("sites/<str:host>/news", views.NewsListView.as_view(), name="public-news"),
    path(
        "sites/<str:host>/news/<slug:slug>",
        views.NewsDetailView.as_view(),
        name="public-news-detail",
    ),
    path(
        "sites/<str:host>/privacy-notice",
        views.PrivacyNoticeView.as_view(),
        name="public-privacy-notice",
    ),
    path("enquiries/form-token", views.EnquiryFormTokenView.as_view(), name="enquiry-token"),
    path("enquiries", views.EnquiryCreateView.as_view(), name="enquiry-create"),
]
```

In `backend/apps/website/enquiries.py`:
- Remove `from apps.school.models import SchoolProfile`.
- Replace `phone_limit_reached` with:
```python
def phone_limit_reached(school, phone_e164: str) -> bool:
    since = timezone.now() - timedelta(days=1)
    recent = Enquiry.objects.for_school(school).filter(phone=phone_e164, created_at__gte=since)
    return recent.count() >= MAX_PER_PHONE_PER_DAY
```
- In `notify_school`, replace `school = SchoolProfile.load()` and the `if school is None or not school.email:` line below it with:
```python
    school = enquiry.school
    if not school.email:
```

In `backend/apps/website/serializers.py`, add this method to `EnquirySerializer` after `validate_phone`:
```python
    def validate_level_wanted(self, value: str) -> str:
        school = self.context.get("school")
        if school is not None and value not in school.levels_offered:
            raise serializers.ValidationError(
                "We don't teach that level. Choose one of the levels listed."
            )
        return value
```

In `backend/apps/website/seed_data.py`, add `SCHOOL_SLUG = "adsmart"` above `SCHOOL = {`.

`backend/apps/website/seeding.py`:
```python
from django.conf import settings
from django.core.files import File
from django.utils import timezone

from apps.consent.models import PrivacyNotice
from apps.school.models import School
from apps.website import seed_data
from apps.website.models import ContentBlock, Fact, FeatureBlock, NewsPost, PhotoSlot

SEED_PHOTO_DIR = settings.BASE_DIR / "seed" / "placeholder_photos"


def seed_website() -> int:
    """Create AD Smart School and any missing default content. Existing rows never change."""
    created = 0

    school = School.objects.filter(slug=seed_data.SCHOOL_SLUG).first()
    if school is None:
        school = School(slug=seed_data.SCHOOL_SLUG, **seed_data.SCHOOL)
        school.full_clean()
        school.save()
        created += 1

    for key, text, help_text in seed_data.CONTENT_BLOCKS:
        _, made = ContentBlock.objects.get_or_create(
            school=school, key=key, defaults={"text": text, "help_text": help_text}
        )
        created += made

    for order, (label, value) in enumerate(seed_data.FACTS):
        _, made = Fact.objects.get_or_create(
            school=school, label=label, defaults={"value": value, "order": order}
        )
        created += made

    for order, (key, title, text, icon) in enumerate(seed_data.FEATURES):
        _, made = FeatureBlock.objects.get_or_create(
            school=school,
            key=key,
            defaults={"title": title, "text": text, "icon": icon, "order": order},
        )
        created += made

    for order, photo in enumerate(seed_data.PHOTOS):
        if PhotoSlot.objects.for_school(school).filter(key=photo.key).exists():
            continue
        slot = PhotoSlot(
            school=school,
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
            school=school,
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
        school=school,
        version=seed_data.PRIVACY_NOTICE["version"],
        defaults={
            "title": seed_data.PRIVACY_NOTICE["title"],
            "body": seed_data.PRIVACY_NOTICE["body"],
            "effective_from": timezone.localdate(),
        },
    )
    created += made
    return created
```

`backend/apps/website/admin.py`:
```python
from django.contrib import admin

from apps.website.models import ContentBlock, Enquiry, Fact, FeatureBlock, NewsPost, PhotoSlot


@admin.register(ContentBlock)
class ContentBlockAdmin(admin.ModelAdmin):
    list_display = ["key", "school", "needs_review", "help_text"]
    list_filter = ["school", "needs_review"]
    search_fields = ["key", "text"]


@admin.register(PhotoSlot)
class PhotoSlotAdmin(admin.ModelAdmin):
    list_display = ["key", "school", "caption", "is_placeholder", "order"]
    list_filter = ["school", "is_placeholder"]


@admin.register(NewsPost)
class NewsPostAdmin(admin.ModelAdmin):
    list_display = ["title", "school", "status", "published_at"]
    list_filter = ["school", "status"]
    prepopulated_fields = {"slug": ["title"]}


@admin.register(Fact)
class FactAdmin(admin.ModelAdmin):
    list_display = ["label", "value", "school", "visible"]
    list_filter = ["school"]


@admin.register(FeatureBlock)
class FeatureBlockAdmin(admin.ModelAdmin):
    list_display = ["title", "school", "enabled"]
    list_filter = ["school", "enabled"]


@admin.register(Enquiry)
class EnquiryAdmin(admin.ModelAdmin):
    list_display = ["child_name", "school", "level_wanted", "parent_name", "phone", "status"]
    list_filter = ["school", "status", "level_wanted"]
```

- [ ] **Step 5: Regenerate the migrations**

Run from `backend`:
```bash
git rm -q apps/school/migrations/0001_initial.py apps/consent/migrations/0001_initial.py apps/website/migrations/0001_initial.py apps/website/migrations/0002_enquiry.py tests/school/test_profile.py
.venv/Scripts/python manage.py makemigrations school consent website
```
Expected: `0001_initial.py` is created in each app. `consent` and `website` depend on `school`.

- [ ] **Step 6: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest -q`
Expected: all pass.

- [ ] **Step 7: Build the development database, check and commit**

The development database `adss` is still empty (Task 0 ran tests only). Run:
`.venv/Scripts/python manage.py migrate && .venv/Scripts/python manage.py createcachetable && .venv/Scripts/python manage.py seed_website`
Then `.venv/Scripts/python -m ruff format . && .venv/Scripts/python -m ruff check .`
Expected: migrations apply and ruff is clean.

```bash
git add -A backend
git commit -m "Make schools tenants: every website record belongs to a school found by its address"
```

---

### Task 3: A new school's placeholder site and the create_school command

**Files:**
- Rewrite: `backend/apps/website/seed_data.py`, `backend/apps/website/seeding.py`, `backend/tests/website/test_seeding.py`
- Create: `backend/apps/website/provisioning.py`, `backend/apps/website/management/commands/create_school.py`, `backend/seed/brand/ad-smart-school-logo.png` (copied from `docs/brand/`)
- Test: `backend/tests/website/test_provisioning.py`

**Interfaces:**
- Consumes: `School`, `all_levels`, `LEVEL_CODES`, `SchoolOwned` models (Task 2).
- Produces:
  - `provisioning.py`: `create_school(**fields) -> School` (raises `ValidationError`), `provision_school(school) -> int`, `seed_first_school() -> int`.
  - `seed_data.py`: `context_for(school)`, `content_blocks(levels)`, `facts_for(school)`, `level_span(levels, joiner)`, `FIRST_SCHOOL`, `PRIVACY_NOTICE_BODY`, `PLATFORM_PRIVACY_NOTICE_BODY`, `PHOTOS`, `FEATURES`, `LEVEL_CODES`.
  - `seeding.seed_website() -> int`, which now delegates to `seed_first_school()`.
  - `manage.py create_school --slug --name --town --region --phone --email [--founded] [--levels a,b]`.
  - Placeholder photos are stored once at `placeholders/<file>` and shared by every school.

- [ ] **Step 1: Write the failing tests**

`backend/tests/website/test_provisioning.py`:
```python
import pytest
from django.core.exceptions import ValidationError
from django.core.management import CommandError, call_command

from apps.consent.models import PrivacyNotice
from apps.school.models import School
from apps.website import provisioning
from apps.website.models import ContentBlock, Fact, FeatureBlock, NewsPost, PhotoSlot
from apps.website.provisioning import create_school, provision_school
from apps.website.services import is_site_public

pytestmark = pytest.mark.django_db

DETAILS = {
    "slug": "brightfuture",
    "name": "Bright Future Academy",
    "town": "Ejisu",
    "region": "Ashanti Region",
    "phone": "024 123 4567",
    "email": "office@brightfuture.example",
}


def text(school, key):
    return ContentBlock.objects.get(school=school, key=key).text


def facts(school):
    return list(Fact.objects.for_school(school).values_list("label", "value"))


def hero(school):
    return PhotoSlot.objects.get(school=school, key="hero")


def test_a_new_school_gets_a_complete_preview_site():
    school = create_school(**DETAILS)

    assert school.phone == "+233241234567" and school.status == School.Status.TRIAL
    slots = PhotoSlot.objects.for_school(school)
    assert slots.count() == 14 and all(s.is_placeholder and s.renditions for s in slots)
    assert not FeatureBlock.objects.for_school(school).filter(enabled=True).exists()
    assert not NewsPost.objects.for_school(school).exists()
    notice = PrivacyNotice.current(school)
    assert notice.is_draft and "Bright Future Academy, Ejisu" in notice.body
    assert text(school, "hero_headline") == "Bright beginnings, from Crèche to JHS"
    assert text(school, "hero_subline") == "Ejisu"
    assert facts(school) == [("every stage of basic education", "Crèche–JHS")]
    assert not ContentBlock.objects.for_school(school).filter(needs_review=False).exists()
    assert is_site_public(school) is False


def test_the_levels_offered_shape_the_text():
    school = create_school(
        **DETAILS, founded_year=2010, levels_offered=["upper_primary", "jhs", "lower_primary"]
    )

    keys = set(ContentBlock.objects.for_school(school).values_list("key", flat=True))
    assert "level_jhs_ages" in keys and "level_creche_ages" not in keys
    assert text(school, "hero_headline") == "Bright beginnings, from Basic 1 to JHS"
    assert text(school, "hero_subline") == "Ejisu · Since 2010"
    assert facts(school) == [
        ("years serving Ejisu", "{years}"),
        ("levels under one roof", "Basic 1–JHS"),
    ]


def test_placeholder_photos_are_stored_and_converted_once_for_all_schools(monkeypatch):
    first = create_school(**DETAILS)
    calls = []
    monkeypatch.setattr(provisioning, "build_renditions", lambda name: calls.append(name) or [])
    monkeypatch.setattr("apps.core.models.build_renditions", lambda name: calls.append(name) or [])

    second = create_school(**{**DETAILS, "slug": "second-school", "name": "Second School"})

    assert calls == []
    assert hero(first).image.name == hero(second).image.name == "placeholders/hero.jpg"
    assert hero(second).renditions == hero(first).renditions


def test_invalid_details_create_nothing():
    with pytest.raises(ValidationError) as error:
        create_school(**{**DETAILS, "slug": "admin", "phone": "123"})

    assert {"slug", "phone"} <= set(error.value.message_dict)
    assert not School.objects.exists()


def test_provisioning_again_keeps_edits_and_adds_nothing():
    school = create_school(**DETAILS)
    ContentBlock.objects.filter(school=school, key="hero_headline").update(text="Our words")

    assert provision_school(school) == 0
    assert text(school, "hero_headline") == "Our words"


def test_create_school_command():
    call_command(
        "create_school",
        slug="brightfuture",
        name="Bright Future Academy",
        town="Ejisu",
        region="Ashanti Region",
        phone="0241234567",
        email="office@brightfuture.example",
        founded=2010,
        levels="kg,lower_primary",
    )

    school = School.objects.get(slug="brightfuture")
    assert school.levels_offered == ["kg", "lower_primary"] and school.founded_year == 2010
    with pytest.raises(CommandError, match="slug"):
        call_command(
            "create_school",
            slug="www",
            name="X",
            town="T",
            region="R",
            phone="0241234567",
            email="x@example.com",
        )
```

`backend/tests/website/test_seeding.py`:
```python
import pytest

from apps.consent.models import PrivacyNotice
from apps.school.models import School
from apps.website.models import ContentBlock, FeatureBlock, NewsPost, PhotoSlot
from apps.website.seed_data import LEVEL_CODES
from apps.website.seeding import seed_website
from apps.website.services import is_site_public

pytestmark = pytest.mark.django_db


def test_seed_creates_ad_smart_school_with_its_logo_and_a_preview_site():
    created = seed_website()

    school = School.objects.get(slug="adsmart")
    assert created > 0
    assert school.phone == "+233545875881" and school.founded_year == 2001
    assert school.renditions, "the logo has renditions"
    hero_subline = ContentBlock.objects.get(school=school, key="hero_subline")
    assert hero_subline.text == "Kronom, Kumasi · Since 2001"
    assert PhotoSlot.objects.for_school(school).count() == 14
    assert not PhotoSlot.objects.filter(is_placeholder=False).exists()
    assert not FeatureBlock.objects.filter(enabled=True).exists()
    assert NewsPost.objects.for_school(school).published().count() == 1
    assert PrivacyNotice.current(school).is_draft is True
    assert is_site_public(school) is False


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

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/website/test_provisioning.py tests/website/test_seeding.py -q`
Expected: ERROR, `ModuleNotFoundError: No module named 'apps.website.provisioning'`

- [ ] **Step 3: Write the templates and provisioning**

Copy the logo: `mkdir -p backend/seed/brand && cp docs/brand/ad-smart-school-logo.png backend/seed/brand/`.

`backend/apps/website/seed_data.py`:
```python
"""Starting content for a school's website (amendment §7.4).

Everything is provisional (needs_review / is_placeholder / is_draft) until the school confirms
it, so a new site stays in preview (Phase 1 spec §6.5). Text may use the names returned by
context_for(): {name}, {town}, {span} ("Crèche–JHS"), {span_words} ("Crèche to JHS"),
{subline} and {history}.
"""

from dataclasses import dataclass

from apps.school.models import LEVEL_CODES

# The platform's first school (amendment §1).
FIRST_SCHOOL = {
    "slug": "adsmart",
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
FIRST_SCHOOL_LOGO = "ad-smart-school-logo.png"
FIRST_SCHOOL_NEWS = [
    {
        "slug": "welcome-to-our-new-website",
        "title": "Welcome to our new website",
        "summary": "School news, key dates and admissions information, together in one place.",
        "body": "We are building a new website and school system for AD Smart School.\n\n"
        "Soon you will find school news, key dates and admissions information here, and "
        "parents will be able to follow their children's progress online.",
    },
]

_START = {
    "creche": "Crèche",
    "nursery": "Nursery",
    "kg": "KG",
    "lower_primary": "Basic 1",
    "upper_primary": "Basic 4",
    "jhs": "JHS",
}
_END = {**_START, "lower_primary": "Basic 3", "upper_primary": "Basic 6"}


def level_span(levels: list[str], joiner: str) -> str:
    """From the first level offered to the last, e.g. "Crèche–JHS" or "Basic 1 to JHS"."""
    start, end = _START[levels[0]], _END[levels[-1]]
    return start if start == end else f"{start}{joiner}{end}"


def context_for(school) -> dict[str, str]:
    founded = school.founded_year
    return {
        "name": school.name,
        "town": school.town,
        "span": level_span(school.levels_offered, "–"),
        "span_words": level_span(school.levels_offered, " to "),
        "subline": f"{school.town} · Since {founded}" if founded else school.town,
        "history": (
            f"{school.name} opened its doors in {school.town} in {founded}."
            if founded
            else f"{school.name} is a school in {school.town}."
        ),
    }


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

# (key, text template, where it appears)
_BLOCKS: list[tuple[str, str, str]] = [
    ("hero_headline", "Bright beginnings, from {span_words}", "Home: main headline"),
    ("hero_subline", "{subline}", "Home: small line above the headline"),
    (
        "hero_intro",
        "A caring school for children from {span_words} in {town}. Come and see where your "
        "child will learn, play and grow.",
        "Home: introduction under the headline",
    ),
    (
        "levels_intro",
        "One school for every stage of childhood, so your child can grow with friends and "
        "teachers who know them.",
        "Home: introduction to the levels",
    ),
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
        "{history}\n\nToday we teach children from {span_words}, so families can stay with "
        "us as their children grow.",
        "About: the school's story",
    ),
    (
        "head_teacher_welcome",
        "Welcome to {name}. Our teachers work hard to make every child feel safe, valued and "
        "excited to learn. We look forward to meeting you and your family.",
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
    ("footer_tagline", "Bright beginnings, from {span_words}.", "Footer: short tagline"),
]


def content_blocks(levels: list[str]) -> list[tuple[str, str, str]]:
    """Text templates for a school teaching `levels`; level blocks only for those levels."""
    level_blocks = [
        item
        for code in levels
        for item in (
            (f"level_{code}_ages", _LEVELS[code][0], f"Levels: age range for {code}"),
            (f"level_{code}_summary", _LEVELS[code][1], f"Levels: one-line summary for {code}"),
            (f"level_{code}_detail", _LEVELS[code][2], f"Levels page: longer text for {code}"),
        )
    ]
    return _BLOCKS + level_blocks


def facts_for(school) -> list[tuple[str, str]]:
    """True facts only (Phase 1 spec §6.2): years since founding, if known, and the levels."""
    facts = []
    if school.founded_year:
        facts.append((f"years serving {school.town}", "{years}"))
    every_level = list(school.levels_offered) == list(LEVEL_CODES)
    label = "every stage of basic education" if every_level else "levels under one roof"
    facts.append((label, level_span(school.levels_offered, "–")))
    return facts


# (key, title, text, icon): all switched off until the feature is live
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

PRIVACY_NOTICE_BODY = "\n\n".join(
    [
        "## Who we are",
        "{name}, {town}, is responsible for the personal information described in this notice.",
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
)

PLATFORM_PRIVACY_NOTICE_BODY = "\n\n".join(
    [
        "## Who we are",
        "{platform} runs websites and school systems for schools in Ghana. This notice "
        "covers this website and the requests sent through it.",
        "## What we collect",
        "When you ask us to get your school online we collect the school's name and town, "
        "your name, phone number and (if you give it) email address, and your message.",
        "## Why we use it",
        "Only to reply to you and talk about setting up your school. We do not sell it or "
        "share it with anyone else.",
        "## How long we keep it",
        "If your school does not join, we delete your request within 12 months.",
        "## Your rights",
        "You can ask for a copy of what we hold about you, or ask us to correct or delete it.",
        "## The law",
        "We handle personal information in line with Ghana's Data Protection Act, 2012 "
        "(Act 843).",
    ]
)
```

`backend/apps/website/provisioning.py`:
```python
"""Creating schools and their starting websites (amendment §5, §7.4)."""

from django.conf import settings
from django.core.files import File
from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone

from apps.consent.models import PrivacyNotice
from apps.core.images import build_renditions
from apps.school.models import School, all_levels
from apps.website import seed_data
from apps.website.models import ContentBlock, Fact, FeatureBlock, NewsPost, PhotoSlot

SEED_DIR = settings.BASE_DIR / "seed"


def _shared_placeholder(filename: str) -> tuple[str, list[dict]]:
    """One stored copy of a placeholder photo and its renditions, shared by every school."""
    name = f"placeholders/{filename}"
    known = (
        PhotoSlot.objects.filter(image=name)
        .exclude(renditions=[])
        .values_list("renditions", flat=True)
        .first()
    )
    if known:
        return name, known
    if not default_storage.exists(name):
        with open(SEED_DIR / "placeholder_photos" / filename, "rb") as handle:
            name = default_storage.save(name, File(handle))
    return name, build_renditions(name)


@transaction.atomic
def provision_school(school: School) -> int:
    """Give a saved school any missing starting content. Existing rows are never changed."""
    created = 0
    context = seed_data.context_for(school)
    for key, text, help_text in seed_data.content_blocks(school.levels_offered):
        _, made = ContentBlock.objects.get_or_create(
            school=school,
            key=key,
            defaults={"text": text.format(**context), "help_text": help_text},
        )
        created += made
    if not Fact.objects.for_school(school).exists():
        for order, (label, value) in enumerate(seed_data.facts_for(school)):
            Fact.objects.create(school=school, label=label, value=value, order=order)
            created += 1
    for order, (key, title, text, icon) in enumerate(seed_data.FEATURES):
        _, made = FeatureBlock.objects.get_or_create(
            school=school,
            key=key,
            defaults={"title": title, "text": text, "icon": icon, "order": order},
        )
        created += made
    for order, photo in enumerate(seed_data.PHOTOS):
        if PhotoSlot.objects.for_school(school).filter(key=photo.key).exists():
            continue
        name, renditions = _shared_placeholder(photo.filename)
        PhotoSlot.objects.create(
            school=school,
            key=photo.key,
            image=name,
            renditions=renditions,
            alt_text=photo.alt_text,
            caption=photo.caption,
            order=order,
            is_placeholder=True,
        )
        created += 1
    if not PrivacyNotice.objects.filter(school=school).exists():
        PrivacyNotice.objects.create(
            school=school,
            version="draft-1",
            body=seed_data.PRIVACY_NOTICE_BODY.format(**context),
            effective_from=timezone.localdate(),
        )
        created += 1
    return created


def create_school(**fields) -> School:
    """A new school with its placeholder website, in preview (amendment §5)."""
    fields.setdefault("levels_offered", all_levels())
    school = School(**fields)
    school.full_clean()
    with transaction.atomic():
        school.save()
        provision_school(school)
    return school


def seed_first_school() -> int:
    """AD Smart School, the platform's first school, with its logo and welcome news."""
    created = 0
    school = School.objects.filter(slug=seed_data.FIRST_SCHOOL["slug"]).first()
    if school is None:
        school = create_school(**seed_data.FIRST_SCHOOL)
        with open(SEED_DIR / "brand" / seed_data.FIRST_SCHOOL_LOGO, "rb") as handle:
            school.logo.save(seed_data.FIRST_SCHOOL_LOGO, File(handle))
        created += 1
    created += provision_school(school)
    for post in seed_data.FIRST_SCHOOL_NEWS:
        _, made = NewsPost.objects.get_or_create(
            school=school,
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
    return created
```

`backend/apps/website/seeding.py`:
```python
"""Development and first launch: the platform's first school (amendment §1)."""

from apps.website.provisioning import seed_first_school


def seed_website() -> int:
    """Create what is missing; existing rows are never changed. Returns how many were made."""
    return seed_first_school()
```

`backend/apps/website/management/commands/create_school.py`:
```python
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from apps.school.models import LEVEL_CODES
from apps.website.provisioning import create_school


class Command(BaseCommand):
    help = "Create a school with its placeholder website, in preview (amendment §5)."

    def add_arguments(self, parser):
        parser.add_argument("--slug", required=True, help="Web address: <slug>.<platform domain>")
        parser.add_argument("--name", required=True)
        parser.add_argument("--town", required=True)
        parser.add_argument("--region", required=True)
        parser.add_argument("--phone", required=True)
        parser.add_argument("--email", required=True)
        parser.add_argument("--founded", type=int, default=None, help="Year the school opened")
        parser.add_argument(
            "--levels",
            default=",".join(LEVEL_CODES),
            help=f"Comma-separated, from: {', '.join(LEVEL_CODES)}",
        )

    def handle(self, *args, slug, name, town, region, phone, email, founded, levels, **options):
        try:
            school = create_school(
                slug=slug,
                name=name,
                town=town,
                region=region,
                phone=phone,
                email=email,
                founded_year=founded,
                levels_offered=[code.strip() for code in levels.split(",") if code.strip()],
            )
        except ValidationError as exc:
            problems = "; ".join(
                f"{field}: {' '.join(messages)}" for field, messages in exc.message_dict.items()
            )
            raise CommandError(problems) from exc
        self.stdout.write(
            self.style.SUCCESS(f"Created {school.name} at {school.base_url()} (in preview).")
        )
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest -q`
Expected: all pass.

- [ ] **Step 5: Check and commit**

Run: `.venv/Scripts/python -m ruff format . && .venv/Scripts/python -m ruff check . && .venv/Scripts/python manage.py seed_website`

```bash
git add backend/apps/website backend/seed/brand backend/tests/website
git commit -m "Give every new school a templated placeholder site; add create_school"
```

---

### Task 4: Platform API, "Get your school online" leads and the route matrix

**Files:**
- Modify: `backend/apps/website/models.py` (add `Lead`), `backend/apps/website/serializers.py` (add `LeadSerializer`), `backend/apps/website/views.py`, `backend/apps/website/urls.py`, `backend/apps/website/seeding.py`, `backend/apps/website/admin.py`, `backend/config/settings.py` (throttle rate)
- Create: `backend/apps/website/platform.py`, `backend/apps/website/migrations/0002_lead.py` (generated)
- Test: `backend/tests/website/test_platform.py`, `backend/tests/test_tenancy_matrix.py`

**Interfaces:**
- Consumes: `resolve_host`, `PLATFORM` (Task 2); `is_site_public` (Task 2); `check_form_token` (Plan 1); `PLATFORM_PRIVACY_NOTICE_BODY` (Task 3).
- Produces:
  - `GET /api/public/platform` returns `{name, email, url, is_public, schools: [{name, town, region, url}]}`.
  - `GET /api/public/platform/privacy-notice`.
  - `POST /api/public/platform/leads` takes `{school_name, contact_name, phone, email, town, message, data_consent, form_token, website}` and answers 201 `{status: "received"}`. It works only on the platform host.
  - `Lead` model; `seed_website()` also creates the platform's draft privacy notice.

- [ ] **Step 1: Write the failing tests**

`backend/tests/website/test_platform.py`:
```python
import time
from datetime import date

import pytest
from django.core import mail

from apps.consent.models import PrivacyNotice
from apps.school.models import School
from apps.website.enquiries import issue_form_token
from apps.website.models import Lead
from apps.website.seeding import seed_website

pytestmark = pytest.mark.django_db
URL = "/api/public/platform/leads"
PLATFORM = "localhost:3000"


@pytest.fixture
def lead():
    return {
        "school_name": "Bright Future Academy",
        "contact_name": "Kwame Asante",
        "phone": "020 123 4567",
        "email": "",
        "town": "Ejisu",
        "message": "",
        "data_consent": True,
        "form_token": issue_form_token(now=time.time() - 10),
        "website": "",
    }


def test_the_platform_lists_only_live_schools(api, ready_site, other_school, settings):
    settings.SITE_URL_TEMPLATE = "https://{host}"

    body = api.get("/api/public/platform").json()

    assert body["name"] == "SchoolSite" and body["email"] == "hello@schoolsite.test"
    assert body["url"] == "https://localhost"
    assert body["schools"] == [
        {
            "name": "AD Smart School",
            "town": "Kronom, Kumasi",
            "region": "Ashanti",
            "url": "https://adsmart.localhost",
        }
    ]
    assert body["is_public"] is False


def test_suspended_schools_are_not_listed(api, ready_site):
    ready_site.status = School.Status.SUSPENDED
    ready_site.save()

    assert api.get("/api/public/platform").json()["schools"] == []


def test_the_platform_is_public_once_its_own_notice_is_reviewed(api, db):
    PrivacyNotice.objects.create(
        version="p1", body="Platform notice.", effective_from=date(2026, 1, 1), is_draft=False
    )

    assert api.get("/api/public/platform").json()["is_public"] is True
    notice = api.get("/api/public/platform/privacy-notice").json()
    assert notice["body"] == "Platform notice." and notice["is_draft"] is False


def test_seeding_drafts_the_platform_notice_once(db):
    seed_website()
    seed_website()

    notice = PrivacyNotice.objects.get(school=None)
    assert notice.is_draft and "SchoolSite" in notice.body


def test_a_lead_is_saved_and_emailed_to_the_platform(api, db, lead):
    response = api.post(URL, lead, format="json", HTTP_HOST=PLATFORM)

    assert response.status_code == 201
    saved = Lead.objects.get()
    assert saved.phone == "+233201234567" and saved.status == Lead.Status.NEW
    assert mail.outbox[0].to == ["hello@schoolsite.test"]
    assert mail.outbox[0].subject == "New school enquiry: Bright Future Academy (Ejisu)"
    assert "020 123 4567" in mail.outbox[0].body


def test_leads_are_taken_only_on_the_platform_site(api, school, lead):
    assert api.post(URL, lead, format="json").status_code == 404
    assert not Lead.objects.exists()


def test_lead_honeypot_and_validation(api, db, lead):
    trapped = api.post(URL, {**lead, "website": "spam"}, format="json", HTTP_HOST=PLATFORM)
    assert trapped.status_code == 201 and not Lead.objects.exists()

    refused = api.post(URL, {**lead, "data_consent": False}, format="json", HTTP_HOST=PLATFORM)
    assert refused.status_code == 400 and "data_consent" in refused.json()["fields"]


def test_fourth_lead_from_a_phone_in_a_day_is_refused(api, db, lead):
    for _ in range(3):
        assert api.post(URL, lead, format="json", HTTP_HOST=PLATFORM).status_code == 201

    response = api.post(URL, lead, format="json", HTTP_HOST=PLATFORM)

    assert response.status_code == 429 and response.json()["code"] == "too_many_requests"
```

`backend/tests/test_tenancy_matrix.py`:
```python
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/website/test_platform.py tests/test_tenancy_matrix.py -q`
Expected: ERROR, `ImportError: cannot import name 'Lead'`.

- [ ] **Step 3: Add the lead model, platform services, views and routes**

In `backend/apps/website/models.py`, append:
```python


class Lead(models.Model):
    """A "Get your school online" request from the platform site (amendment §6)."""

    class Status(models.TextChoices):
        NEW = "new", "New"
        CONTACTED = "contacted", "Contacted"
        ONBOARDED = "onboarded", "Onboarded"
        CLOSED = "closed", "Closed"

    school_name = models.CharField(max_length=120)
    contact_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=16)
    email = models.EmailField(blank=True)
    town = models.CharField(max_length=80)
    message = models.TextField(max_length=1000, blank=True)
    data_consent = models.BooleanField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.NEW)
    staff_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.school_name} ({self.town})"
```

In `backend/apps/website/serializers.py`, change the model import to `from apps.website.models import Enquiry, Lead`, and append:
```python


def _required_text(value: str, message: str) -> str:
    if len(value.strip()) < 2:
        raise serializers.ValidationError(message)
    return value.strip()


class LeadSerializer(serializers.ModelSerializer):
    data_consent = serializers.BooleanField()

    class Meta:
        model = Lead
        fields = ["school_name", "contact_name", "phone", "email", "town", "message", "data_consent"]
        extra_kwargs = {
            "email": {"required": False, "allow_blank": True},
            "message": {"required": False, "allow_blank": True},
        }

    def validate_school_name(self, value: str) -> str:
        return _required_text(value, "Enter the school's name.")

    def validate_contact_name(self, value: str) -> str:
        return _required_text(value, "Enter your full name.")

    def validate_town(self, value: str) -> str:
        return _required_text(value, "Enter the school's town.")

    def validate_phone(self, value: str) -> str:
        try:
            return normalise_gh_phone(value, mobile_only=True)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate_data_consent(self, value: bool) -> bool:
        if value is not True:
            raise serializers.ValidationError(
                "Please agree so we can use these details to reply to you."
            )
        return value
```

`backend/apps/website/platform.py`:
```python
"""The platform's own public site (amendment §6)."""

import logging
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from apps.consent.models import PrivacyNotice
from apps.core.phones import format_gh_local
from apps.school.models import School
from apps.website.models import Lead
from apps.website.services import is_site_public

logger = logging.getLogger(__name__)
MAX_LEADS_PER_PHONE_PER_DAY = 3


def platform_payload() -> dict:
    notice = PrivacyNotice.current(None)
    schools = School.objects.exclude(status=School.Status.SUSPENDED)
    return {
        "name": settings.PLATFORM_NAME,
        "email": settings.PLATFORM_EMAIL,
        "url": settings.SITE_URL_TEMPLATE.format(host=settings.PLATFORM_DOMAIN),
        "is_public": notice is not None and not notice.is_draft,
        "schools": [
            {"name": s.name, "town": s.town, "region": s.region, "url": s.base_url()}
            for s in schools
            if is_site_public(s)
        ],
    }


def lead_limit_reached(phone_e164: str) -> bool:
    since = timezone.now() - timedelta(days=1)
    recent = Lead.objects.filter(phone=phone_e164, created_at__gte=since).count()
    return recent >= MAX_LEADS_PER_PHONE_PER_DAY


def notify_platform(lead: Lead) -> None:
    if not settings.PLATFORM_EMAIL:
        logger.warning("Lead %s saved but PLATFORM_EMAIL is not set", lead.pk)
        return
    body = "\n".join(
        [
            f"School: {lead.school_name}, {lead.town}",
            f"Contact: {lead.contact_name}",
            f"Phone: {format_gh_local(lead.phone)}",
            f"Email: {lead.email or '—'}",
            "",
            "Message:",
            lead.message or "—",
        ]
    )
    try:
        send_mail(
            f"New school enquiry: {lead.school_name} ({lead.town})",
            body,
            None,
            [settings.PLATFORM_EMAIL],
        )
    except Exception:
        logger.exception("Could not email the platform about lead %s", lead.pk)
```

In `backend/apps/website/views.py`:
- Add the imports:
```python
from apps.school.hosts import PLATFORM, resolve_host
from apps.website.models import Lead
from apps.website.platform import lead_limit_reached, notify_platform, platform_payload
from apps.website.serializers import LeadSerializer
```
  Merge them into the existing import lines.
- Replace `PrivacyNoticeView` with a shared helper and both notice views:
```python
def _notice_response(notice: PrivacyNotice | None) -> Response:
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


class PrivacyNoticeView(PublicView):
    def get(self, request, host):
        return _notice_response(PrivacyNotice.current(school_for_host(host)))


class PlatformPrivacyNoticeView(PublicView):
    def get(self, request):
        return _notice_response(PrivacyNotice.current(None))
```
- Append:
```python


class PlatformView(PublicView):
    def get(self, request):
        return Response(platform_payload())


class LeadIpThrottle(AnonRateThrottle):
    scope = "lead_ip"


class LeadCreateView(PublicView):
    throttle_classes = [LeadIpThrottle]

    def post(self, request):
        site = resolve_host(request.get_host())
        if site is None or site.kind != PLATFORM:
            raise NotFound("Requests to join are taken on the platform's own website.")
        if request.data.get("website"):  # honeypot: pretend success, keep nothing
            return Response({"status": "received"}, status=201)
        check_form_token(str(request.data.get("form_token", "")))
        serializer = LeadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if lead_limit_reached(serializer.validated_data["phone"]):
            raise ApiError(
                "too_many_requests", "We already have your request and will call you soon.", 429
            )
        lead = Lead.objects.create(**serializer.validated_data)
        notify_platform(lead)
        return Response({"status": "received"}, status=201)
```

In `backend/apps/website/urls.py`, add:
```python
    path("platform", views.PlatformView.as_view(), name="public-platform"),
    path(
        "platform/privacy-notice",
        views.PlatformPrivacyNoticeView.as_view(),
        name="public-platform-privacy-notice",
    ),
    path("platform/leads", views.LeadCreateView.as_view(), name="lead-create"),
```

In `backend/config/settings.py` `DEFAULT_THROTTLE_RATES`, add `"lead_ip": "30/hour"`.

`backend/apps/website/seeding.py`:
```python
"""Development and first launch: the platform's first school and its own notice."""

from django.conf import settings
from django.utils import timezone

from apps.consent.models import PrivacyNotice
from apps.website import seed_data
from apps.website.provisioning import seed_first_school


def seed_platform() -> int:
    """The platform's draft privacy notice (amendment §6), if it has none yet."""
    if PrivacyNotice.objects.filter(school=None).exists():
        return 0
    PrivacyNotice.objects.create(
        version="draft-1",
        body=seed_data.PLATFORM_PRIVACY_NOTICE_BODY.format(platform=settings.PLATFORM_NAME),
        effective_from=timezone.localdate(),
    )
    return 1


def seed_website() -> int:
    """Create what is missing; existing rows are never changed. Returns how many were made."""
    return seed_first_school() + seed_platform()
```

In `backend/apps/website/admin.py`, change the import to include `Lead`, and append:
```python


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ["school_name", "town", "contact_name", "phone", "status", "created_at"]
    list_filter = ["status"]
```

Run `.venv/Scripts/python manage.py makemigrations website --name lead`.

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest -q`
Expected: all pass, including the route matrix.

- [ ] **Step 5: Check and commit**

Run: `.venv/Scripts/python -m ruff format . && .venv/Scripts/python -m ruff check . && .venv/Scripts/python manage.py migrate && .venv/Scripts/python manage.py seed_website`

```bash
git add backend
git commit -m "Add the platform API, school leads and a route classification check"
```

---

### Task 5: Frontend: one app serves every school's address

**Files:**
- Create: `frontend/src/proxy.ts`, `frontend/src/lib/hosts.ts`, `frontend/src/lib/hosts.test.ts`, `frontend/src/lib/levels.test.ts`, `frontend/src/app/unavailable/page.tsx`, `frontend/src/app/sites/[host]/robots.txt/route.ts`, `frontend/src/app/sites/[host]/sitemap.xml/route.ts`, `frontend/src/app/sites/[host]/opengraph-image.tsx`, `frontend/src/app/sites/[host]/seo.test.ts`
- Move (`git mv`) `frontend/src/app/(public)/` to `frontend/src/app/sites/[host]/`, then rewrite every page and the layout as below.
- Delete: `frontend/src/app/robots.ts`, `frontend/src/app/sitemap.ts`, `frontend/src/app/opengraph-image.tsx`, `frontend/src/app/seo.test.ts`, `frontend/src/lib/site-url.ts`
- Rewrite: `frontend/src/lib/api.ts`, `frontend/src/lib/api.test.ts`, `frontend/src/components/site/school-json-ld.tsx`, `frontend/src/test/site-fixture.ts`
- Modify: `frontend/src/lib/types.ts`, `frontend/src/lib/levels.ts`, `frontend/src/app/layout.tsx`, `frontend/src/app/not-found.tsx`, `frontend/src/components/site/header.tsx`, `frontend/src/components/site/mobile-menu.tsx`, `frontend/src/components/site/home/levels-section.tsx`, `frontend/src/components/site/enquiry-form.tsx`, `frontend/src/components/site/enquiry-form.test.tsx`, `frontend/src/components/site/home/home.test.tsx`, `frontend/src/components/site/chrome.test.tsx`, `frontend/vitest.setup.ts`

**Interfaces:**
- Consumes: Django's `/api/public/sites/<host>/…` (Task 2): `school.base_url`, `school.logo`, `school.levels_offered`, `brand`, nullable `founded_year`. Also 503 `suspended`.
- Produces:
  - `routeFor(host, pathname, platformDomain) -> string | null`, `publicPath(pathname) -> string`, `hostname(host) -> string`.
  - `getSite(host)` (unknown host goes to not-found; suspended goes to `/unavailable`), `getNewsList(host, limit)`, `getNewsPost(host, slug)`, `getPrivacyNotice(host)`.
  - `offeredLevels(codes)`, `levelsTitle(levels)`; `EnquiryForm` props `{ schoolName, schoolPhone, levels }`.
  - Types: `SchoolInfo` gains `logo`, `base_url`, `levels_offered`, nullable `founded_year` and `years_since_founding`; `SiteData` gains `brand: BrandTokens`.
  - Internal route trees: `/sites/[host]/…` (schools), `/platform-site/…` (Task 7), `/platform-admin/…` (Plan 5).

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/hosts.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { hostname, publicPath, routeFor } from "./hosts";

const route = (host: string, path: string) => routeFor(host, path, "localhost");

describe("routeFor", () => {
  it.each([
    ["localhost:3000", "/", "/platform-site"],
    ["www.localhost", "/privacy", "/platform-site/privacy"],
    ["admin.localhost:3000", "/", "/platform-admin"],
    ["adsmart.localhost:3000", "/", "/sites/adsmart.localhost"],
    ["AdSmart.Localhost:3000", "/news/hello", "/sites/adsmart.localhost/news/hello"],
    ["adsmartschool.edu.gh", "/robots.txt", "/sites/adsmartschool.edu.gh/robots.txt"],
    ["adsmart.localhost", "/sitemap.xml", "/sites/adsmart.localhost/sitemap.xml"],
  ])("sends %s%s to %s", (host, path, expected) => {
    expect(route(host, path)).toBe(expected);
  });

  it.each([
    ["adsmart.localhost", "/icon.svg"],
    ["adsmart.localhost", "/unavailable"],
    ["adsmart.localhost", "/sites/adsmart.localhost/opengraph-image"],
    ["localhost", "/platform-site/opengraph-image"],
  ])("leaves %s%s alone", (host, path) => {
    expect(route(host, path)).toBeNull();
  });

  it("never shows another site's internal pages", () => {
    expect(route("adsmart.localhost", "/sites/brightfuture.localhost")).toBe("/sites/adsmart.localhost/not-found");
    expect(route("adsmart.localhost", "/sites/brightfuture.localhost/about")).toBe("/sites/adsmart.localhost/not-found");
    expect(route("adsmart.localhost", "/platform-admin")).toBe("/sites/adsmart.localhost/not-found");
    expect(route("localhost", "/sites/adsmart.localhost/admissions")).toBe("/platform-site/not-found");
  });
});

describe("publicPath and hostname", () => {
  it("strip the internal prefix and the port", () => {
    expect(publicPath("/sites/adsmart.localhost/about")).toBe("/about");
    expect(publicPath("/sites/adsmart.localhost")).toBe("/");
    expect(publicPath("/platform-site/privacy")).toBe("/privacy");
    expect(publicPath("/about")).toBe("/about");
    expect(hostname(" AdSmart.Localhost:3000 ")).toBe("adsmart.localhost");
  });
});
```

`frontend/src/lib/levels.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { levelsTitle, offeredLevels } from "./levels";

describe("levels offered", () => {
  it("keeps school order and ignores unknown codes", () => {
    expect(offeredLevels(["jhs", "kg", "university"]).map((level) => level.code)).toEqual(["kg", "jhs"]);
  });

  it("titles the range of levels", () => {
    expect(levelsTitle(offeredLevels(["creche", "nursery", "kg", "lower_primary", "upper_primary", "jhs"]))).toBe(
      "From Crèche to JHS",
    );
    expect(levelsTitle(offeredLevels(["kg"]))).toBe("Kindergarten (KG1–KG2)");
    expect(levelsTitle([])).toBe("Our levels");
  });
});
```

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
  it("asks Django for one school's content and revalidates every five minutes", async () => {
    vi.stubEnv("DJANGO_ORIGIN", "http://django.test");
    const fetchMock = stubFetch(200, []);

    await getNewsList("adsmart.localhost", 3);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://django.test/api/public/sites/adsmart.localhost/news?limit=3",
      expect.objectContaining({ next: { revalidate: 300 } }),
    );
  });

  it("returns null for a missing news post", async () => {
    stubFetch(404, { code: "not_found" });
    expect(await getNewsPost("adsmart.localhost", "nope")).toBeNull();
  });

  it("shows the not-found page for an unknown school", async () => {
    stubFetch(404, { code: "not_found" });
    await expect(getSite("nobody.localhost")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("sends visitors of a suspended school to the unavailable page", async () => {
    stubFetch(503, { code: "suspended" });
    await expect(getSite("adsmart.localhost")).rejects.toThrow("NEXT_REDIRECT /unavailable");
  });

  it("fails loudly on other errors", async () => {
    stubFetch(500, { code: "error" });
    await expect(getSite("adsmart.localhost")).rejects.toThrow("500");
  });
});
```

`frontend/src/app/sites/[host]/seo.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { getNewsList, getSite } from "@/lib/api";
import { makeSite } from "@/test/site-fixture";
import { GET as robots } from "./robots.txt/route";
import { GET as sitemap } from "./sitemap.xml/route";

vi.mock("@/lib/api", () => ({ getSite: vi.fn(), getNewsList: vi.fn() }));

const context = { params: Promise.resolve({ host: "adsmart.localhost" }) };
const request = new Request("http://adsmart.localhost:3000/robots.txt");

describe("robots.txt and sitemap.xml", () => {
  it("keep search engines out while the site is in preview", async () => {
    vi.mocked(getSite).mockResolvedValue(makeSite({ is_public: false }));

    expect(await (await robots(request, context)).text()).toBe("User-Agent: *\nDisallow: /\n");
    expect(await (await sitemap(request, context)).text()).not.toContain("<url>");
  });

  it("list every page and news post at the school's own address once public", async () => {
    vi.mocked(getSite).mockResolvedValue(makeSite({ is_public: true }));
    vi.mocked(getNewsList).mockResolvedValue([
      { title: "Hi", slug: "hi", summary: "s", published_at: "2026-10-09T08:00:00+00:00", cover: null },
    ]);

    expect(await (await robots(request, context)).text()).toContain(
      "Sitemap: http://adsmart.localhost:3000/sitemap.xml",
    );
    const xml = await (await sitemap(request, context)).text();
    expect(xml).toContain("<loc>http://adsmart.localhost:3000/admissions</loc>");
    expect(xml).toContain("<loc>http://adsmart.localhost:3000/news/hi</loc>");
  });
});
```

In `frontend/src/components/site/home/home.test.tsx`, add inside `describe("LevelsSection", …)`:
```tsx
  it("shows only the levels the school teaches", () => {
    const site = makeSite();
    render(<LevelsSection site={{ ...site, school: { ...site.school, levels_offered: ["kg", "lower_primary"] } }} />);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("The levels we teach");
  });
```

In `frontend/src/components/site/enquiry-form.test.tsx`:
- Add `import { LEVEL_CODES } from "@/lib/enquiry-schema";` to the imports.
- Replace every `<EnquiryForm schoolPhone="054 587 5881" />` with `<EnquiryForm schoolName="AD Smart School" schoolPhone="054 587 5881" levels={LEVEL_CODES} />`.
- Add a test:
```tsx
  it("offers only the levels the school teaches", () => {
    render(<EnquiryForm schoolName="Bright Future Academy" schoolPhone="020 123 4567" levels={["kg", "jhs"]} />);
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["Choose a level", "Kindergarten (KG1–KG2)", "Junior High School (JHS 1–3)"]);
    expect(screen.getByText(/Bright Future Academy may use these details/)).toBeInTheDocument();
  });
```

In `frontend/src/components/site/chrome.test.tsx`, replace the `describe("schoolJsonLd", …)` block with:
```tsx
describe("schoolJsonLd", () => {
  it("describes the school for search engines at its own address", () => {
    const { school } = makeSite();

    expect(schoolJsonLd(school)).toMatchObject({
      "@type": "School",
      name: "AD Smart School",
      url: "http://adsmart.localhost:3000",
      foundingDate: "2001",
      telephone: "+233545875881",
      address: { addressLocality: "Kronom, Kumasi", addressCountry: "GH" },
    });
    expect(schoolJsonLd({ ...school, founded_year: null })).not.toHaveProperty("foundingDate");
  });

  it("cannot be broken out of by a school's name", () => {
    const { school } = makeSite();
    const { container } = render(<SchoolJsonLd school={{ ...school, name: "</script><script>alert(1)" }} />);
    expect(container.querySelector("script")?.innerHTML).toContain("\\u003c/script>");
  });
});
```
Also add `SchoolJsonLd` to the import from `./school-json-ld`, remove the now-unused `SchoolInfo` type import, and add `import { makeSite } from "@/test/site-fixture";`.

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend && npx vitest run`
Expected: FAIL. `./hosts`, `offeredLevels` and the new `api.ts` signatures are missing, and the route handlers do not exist.

- [ ] **Step 3: Write the host routing**

`frontend/src/lib/hosts.ts`:
```ts
/** Which internal route tree serves a web address (amendment §2.1, §2.4). */

const SEO_FILES = new Set(["/robots.txt", "/sitemap.xml"]);
const HAS_EXTENSION = /\.[a-z0-9]+$/i;
const NAMESPACE = /^\/(?:sites\/[^/]+|platform-site|platform-admin)(?=\/|$)/;

export function hostname(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/** The internal path for a request, or null to leave it as it is. */
export function routeFor(rawHost: string, pathname: string, platformDomain: string): string | null {
  const host = hostname(rawHost);
  const root = platformDomain.toLowerCase();
  const base =
    host === root || host === `www.${root}`
      ? "/platform-site"
      : host === `admin.${root}`
        ? "/platform-admin"
        : `/sites/${host}`;
  if (pathname === base || pathname.startsWith(`${base}/`)) return null; // this site's own URL
  if (NAMESPACE.test(pathname)) return `${base}/not-found`; // never another site's pages here
  if (pathname === "/unavailable") return null;
  if (HAS_EXTENSION.test(pathname) && !SEO_FILES.has(pathname)) return null; // shared files
  return pathname === "/" ? base : `${base}${pathname}`;
}

/** The address-bar path without the internal prefix, the same on server and client. */
export function publicPath(pathname: string): string {
  return pathname.replace(NAMESPACE, "") || "/";
}
```

`frontend/src/proxy.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { routeFor } from "@/lib/hosts";

/** Serves every school, the platform site and the admin area from one app (amendment §2.4). */
export function proxy(request: NextRequest) {
  const target = routeFor(
    request.headers.get("host") ?? "",
    request.nextUrl.pathname,
    process.env.PLATFORM_DOMAIN ?? "localhost",
  );
  if (target === null) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = target;
  return NextResponse.rewrite(url);
}

export const config = {
  // Everything except the API and media (forwarded to Django) and Next.js internals.
  matcher: ["/((?!api/|media/|_next/).*)"],
};
```

`frontend/src/lib/api.ts`:
```ts
import { notFound, redirect } from "next/navigation";
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
  if (response.status === 503 && ((await response.json()) as { code?: string }).code === "suspended") {
    redirect("/unavailable");
  }
  if (!response.ok) throw new Error(`Website API ${path} answered ${response.status}`);
  return (await response.json()) as T;
}

const sitePath = (host: string) => `/api/public/sites/${encodeURIComponent(host)}`;

/** The school at this address. Unknown addresses show the not-found page. */
export async function getSite(host: string): Promise<SiteData> {
  return (await fetchJson<SiteData>(`${sitePath(host)}/site`)) ?? notFound();
}

export async function getNewsList(host: string, limit = 20): Promise<NewsSummary[]> {
  return (await fetchJson<NewsSummary[]>(`${sitePath(host)}/news?limit=${limit}`)) ?? [];
}

export async function getNewsPost(host: string, slug: string): Promise<NewsPost | null> {
  return fetchJson<NewsPost>(`${sitePath(host)}/news/${encodeURIComponent(slug)}`);
}

export async function getPrivacyNotice(host: string): Promise<PrivacyNotice | null> {
  return fetchJson<PrivacyNotice>(`${sitePath(host)}/privacy-notice`);
}

export function contentOf(site: SiteData, key: string, fallback = ""): string {
  return site.content[key] ?? fallback;
}
```

In `frontend/vitest.setup.ts`, add to the `next/navigation` mock object:
```ts
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
```

In `frontend/src/lib/types.ts`:
- Add `import type { LevelCode } from "./levels";` at the top.
- In `SchoolInfo`, change `founded_year: number;` to `founded_year: number | null;` and `years_since_founding: number;` to `years_since_founding: number | null;`, and add:
```ts
  logo: ImageData | null;
  /** The school's primary address, e.g. https://adsmart.schoolsite.com */
  base_url: string;
  levels_offered: LevelCode[];
```
- Add before `SiteData`:
```ts
/** CSS variables replacing the platform palette for one school (amendment §7.2). */
export type BrandTokens = { light: Record<string, string>; dark: Record<string, string> };
```
- Add `brand: BrandTokens;` to `SiteData`.

In `frontend/src/lib/levels.ts`, append:
```ts

export type Level = (typeof LEVELS)[number];

/** The levels a school teaches, in school order (amendment §7.1). */
export function offeredLevels(codes: readonly string[]): Level[] {
  return LEVELS.filter((level) => codes.includes(level.code));
}

export function levelsTitle(levels: Level[]): string {
  if (levels.length === 0) return "Our levels";
  const first = levels[0];
  const last = levels[levels.length - 1];
  return first === last ? first.name : `From ${first.shortName} to ${last.shortName}`;
}
```

`frontend/src/test/site-fixture.ts`: in `makeSite`, add to `school`:
```ts
      logo: null,
      base_url: "http://adsmart.localhost:3000",
      levels_offered: ["creche", "nursery", "kg", "lower_primary", "upper_primary", "jhs"],
```
and add `brand: { light: {}, dark: {} },` after `school`.

- [ ] **Step 4: Move the public pages under `/sites/[host]` and rewrite them**

Run: `cd frontend && git mv "src/app/(public)" "src/app/sites/[host]" && git rm -q src/app/robots.ts src/app/sitemap.ts src/app/opengraph-image.tsx src/app/seo.test.ts src/lib/site-url.ts`

`frontend/src/app/sites/[host]/layout.tsx`:
```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { OfflineBar } from "@/components/site/offline-bar";
import { PreviewRibbon } from "@/components/site/preview-ribbon";
import { SchoolJsonLd } from "@/components/site/school-json-ld";
import { SkipLink } from "@/components/site/skip-link";
import { contentOf, getSite } from "@/lib/api";

type Params = { params: Promise<{ host: string }> };

// Each school's pages are built on its first visit, then cached per host (ISR).
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const site = await getSite((await params).host);
  const { school } = site;
  return {
    metadataBase: new URL(school.base_url),
    title: { default: `${school.name} · ${school.town}`, template: `%s · ${school.name}` },
    description: contentOf(site, "hero_intro", `${school.name} in ${school.town}.`),
    applicationName: school.name,
    // Preview pages must never be indexed (Phase 1 spec §6.5).
    robots: site.is_public ? { index: true, follow: true } : { index: false, follow: false },
    icons: school.logo ? { icon: school.logo.src } : undefined,
  };
}

export default async function SiteLayout({ children, params }: Params & { children: ReactNode }) {
  const site = await getSite((await params).host);
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

`frontend/src/app/sites/[host]/page.tsx`:
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

type Props = { params: Promise<{ host: string }> };

export const revalidate = 300;

export default async function HomePage({ params }: Props) {
  const { host } = await params;
  const [site, news] = await Promise.all([getSite(host), getNewsList(host, 3)]);
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

`frontend/src/app/sites/[host]/about/page.tsx`:
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

type Props = { params: Promise<{ host: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { school } = await getSite((await params).host);
  return { title: "About us", description: `The story of ${school.name} in ${school.town}.` };
}

export default async function AboutPage({ params }: Props) {
  const site = await getSite((await params).host);
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

`frontend/src/app/sites/[host]/levels/page.tsx`:
```tsx
import type { Metadata } from "next";
import { AdmissionsCta } from "@/components/site/home/admissions-cta";
import { PageHero } from "@/components/site/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { CategoryBadge } from "@/components/ui/category-badge";
import { Container } from "@/components/ui/container";
import { contentOf, getSite } from "@/lib/api";
import { levelsTitle, offeredLevels } from "@/lib/levels";

type Props = { params: Promise<{ host: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { school } = await getSite((await params).host);
  const names = offeredLevels(school.levels_offered).map((level) => level.shortName);
  return { title: "Levels", description: `${names.join(", ")} at ${school.name}, ${school.town}.` };
}

export default async function LevelsPage({ params }: Props) {
  const site = await getSite((await params).host);
  const levels = offeredLevels(site.school.levels_offered);
  return (
    <>
      <PageHero eyebrow="Our levels" title={levelsTitle(levels)} intro={contentOf(site, "levels_intro")} />
      <section className="py-16 sm:py-24">
        <Container className="space-y-6">
          {levels.map((level) => (
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

`frontend/src/app/sites/[host]/admissions/page.tsx`:
```tsx
import type { Metadata } from "next";
import { EnquiryForm } from "@/components/site/enquiry-form";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { RichText } from "@/components/ui/rich-text";
import { contentOf, getSite } from "@/lib/api";
import { offeredLevels } from "@/lib/levels";

type Props = { params: Promise<{ host: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { school } = await getSite((await params).host);
  return {
    title: "Admissions",
    description: `How to join ${school.name} in ${school.town}: steps, documents, ages and an online enquiry form.`,
  };
}

export default async function AdmissionsPage({ params }: Props) {
  const site = await getSite((await params).host);
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
                {offeredLevels(school.levels_offered).map((level) => (
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
          <EnquiryForm schoolName={school.name} schoolPhone={school.phone_display} levels={school.levels_offered} />
        </Container>
      </section>
    </>
  );
}
```

`frontend/src/app/sites/[host]/contact/page.tsx`:
```tsx
import type { Metadata } from "next";
import { Clock, Mail, MapPin, MessageCircle, Phone, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { MapEmbed } from "@/components/site/map-embed";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { contentOf, getSite } from "@/lib/api";

type Props = { params: Promise<{ host: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { school } = await getSite((await params).host);
  return { title: "Contact", description: `Call, message, email or visit ${school.name} in ${school.town}.` };
}

export default async function ContactPage({ params }: Props) {
  const site = await getSite((await params).host);
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

`frontend/src/app/sites/[host]/privacy/page.tsx`:
```tsx
import type { Metadata } from "next";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { RichText } from "@/components/ui/rich-text";
import { getPrivacyNotice, getSite } from "@/lib/api";
import { formatDate } from "@/lib/dates";

type Props = { params: Promise<{ host: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { school } = await getSite((await params).host);
  return {
    title: "Privacy notice",
    description: `How ${school.name} uses and protects personal information (Data Protection Act, 2012).`,
  };
}

export default async function PrivacyPage({ params }: Props) {
  const notice = await getPrivacyNotice((await params).host);
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

`frontend/src/app/sites/[host]/news/page.tsx`:
```tsx
import type { Metadata } from "next";
import { NewsCard } from "@/components/site/news-cards";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { getNewsList, getSite } from "@/lib/api";

type Props = { params: Promise<{ host: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { school } = await getSite((await params).host);
  return { title: "News", description: `News and updates from ${school.name}, ${school.town}.` };
}

export default async function NewsPage({ params }: Props) {
  const { host } = await params;
  const [site, posts] = await Promise.all([getSite(host), getNewsList(host, 50)]);
  return (
    <>
      <PageHero eyebrow="News" title="School news" intro={`Updates and stories from ${site.school.name}.`} />
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

`frontend/src/app/sites/[host]/news/[slug]/page.tsx`:
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { RichText } from "@/components/ui/rich-text";
import { getNewsPost } from "@/lib/api";
import { formatDate } from "@/lib/dates";

type Props = { params: Promise<{ host: string; slug: string }> };

export const revalidate = 300;

// Built on first visit per school, like every school page (see the [host] layout).
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { host, slug } = await params;
  const post = await getNewsPost(host, slug);
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
  const { host, slug } = await params;
  const post = await getNewsPost(host, slug);
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

`frontend/src/app/sites/[host]/robots.txt/route.ts`:
```ts
import { getSite } from "@/lib/api";

type Context = { params: Promise<{ host: string }> };

export const revalidate = 300;

export async function GET(_request: Request, { params }: Context) {
  const site = await getSite((await params).host);
  const body = site.is_public
    ? `User-Agent: *\nAllow: /\n\nSitemap: ${site.school.base_url}/sitemap.xml\n`
    : "User-Agent: *\nDisallow: /\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
```

`frontend/src/app/sites/[host]/sitemap.xml/route.ts`:
```ts
import { getNewsList, getSite } from "@/lib/api";

type Context = { params: Promise<{ host: string }> };

export const revalidate = 3600;

const PAGES = ["", "/about", "/levels", "/admissions", "/news", "/contact", "/privacy"];

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export async function GET(_request: Request, { params }: Context) {
  const { host } = await params;
  const site = await getSite(host);
  const base = site.school.base_url;
  const entries: { loc: string; lastmod?: string }[] = [];
  if (site.is_public) {
    entries.push(...PAGES.map((path) => ({ loc: `${base}${path}` })));
    const news = await getNewsList(host, 50);
    entries.push(...news.map((post) => ({ loc: `${base}/news/${post.slug}`, lastmod: post.published_at })));
  }
  const urls = entries
    .map(({ loc, lastmod }) => `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`)
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
```

`frontend/src/app/sites/[host]/opengraph-image.tsx`:
```tsx
import { ImageResponse } from "next/og";
import { contentOf, getSite } from "@/lib/api";

export const alt = "The school's website";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Link preview card for WhatsApp, Facebook and others, in the school's own colours. */
export default async function OpengraphImage({ params }: { params: Promise<{ host: string }> }) {
  const site = await getSite((await params).host);
  const brand = site.brand.light;
  const background = brand["--btn-primary"]
    ? `linear-gradient(135deg, ${brand["--mesh-a"]} 0%, ${brand["--mesh-b"]} 55%, ${brand["--mesh-c"]} 100%)`
    : "linear-gradient(135deg, #0f1a9e 0%, #0277bd 55%, #8806a8 100%)";
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
          background,
        }}
      >
        <div style={{ fontSize: 34, fontWeight: 600, color: brand["--brand-amber"] ?? "#f0ad1c" }}>
          {contentOf(site, "hero_subline")}
        </div>
        <div style={{ fontSize: 88, fontWeight: 700, marginTop: 16 }}>{site.school.name}</div>
        <div style={{ fontSize: 40, marginTop: 16 }}>{contentOf(site, "hero_headline")}</div>
      </div>
    ),
    size,
  );
}
```

`frontend/src/app/unavailable/page.tsx`:
```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Temporarily unavailable",
  robots: { index: false, follow: false },
};

/** Shown instead of a suspended school's pages (amendment §2.4). */
export default function UnavailablePage() {
  return (
    <main id="main" className="bg-brand-mesh on-dark flex min-h-dvh items-center justify-center p-6 text-white">
      <div className="glass-clear max-w-md rounded-card p-8 text-center">
        <h1 className="text-3xl font-bold">This school&apos;s website is temporarily unavailable</h1>
        <p className="mt-4 text-white/90">Please try again later, or contact the school directly.</p>
      </div>
    </main>
  );
}
```

In `frontend/src/app/layout.tsx`, replace the `metadata` export with the following. Each site sets its own title, description and `metadataBase`.
```tsx
export const metadata: Metadata = {
  title: { default: "School websites", template: "%s" },
};
```

In `frontend/src/app/not-found.tsx`, delete the "Read the news" link. Schools may have no news, and platform pages have none.

- [ ] **Step 5: Update the shared components**

In `frontend/src/components/site/header.tsx` and `frontend/src/components/site/mobile-menu.tsx`:
- Add `import { publicPath } from "@/lib/hosts";`.
- Replace `const pathname = usePathname();` with `const pathname = publicPath(usePathname());`.

`frontend/src/components/site/school-json-ld.tsx`:
```tsx
import type { SchoolInfo } from "@/lib/types";

export function schoolJsonLd(school: SchoolInfo) {
  return {
    "@context": "https://schema.org",
    "@type": "School",
    name: school.name,
    url: school.base_url,
    ...(school.founded_year ? { foundingDate: String(school.founded_year) } : {}),
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
  // "<" is escaped so a school's own text can never close the script element.
  const json = JSON.stringify(schoolJsonLd(school)).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
```

In `frontend/src/components/site/home/levels-section.tsx`:
- Replace `import { LEVELS } from "@/lib/levels";` with `import { LEVELS, offeredLevels } from "@/lib/levels";`.
- At the start of the component body add:
```tsx
  const levels = offeredLevels(site.school.levels_offered);
```
- Use `title={levels.length === LEVELS.length ? "From first steps to the BECE" : "The levels we teach"}`, and map over `levels` instead of `LEVELS`.

In `frontend/src/components/site/enquiry-form.tsx`:
- Replace `import { LEVELS } from "@/lib/levels";` with `import { offeredLevels } from "@/lib/levels";`.
- Change the signature to:
```tsx
type Props = { schoolName: string; schoolPhone: string; levels: readonly string[] };

export function EnquiryForm({ schoolName, schoolPhone, levels }: Props) {
```
- In the level `<select>`, map over `offeredLevels(levels)` instead of `LEVELS`.
- In the consent label, replace `AD Smart School` with `{schoolName}`.

- [ ] **Step 6: Run the tests and checks**

Run: `cd frontend && npm test && npm run lint && npm run typecheck`
Expected: all pass, and lint and typecheck are clean.

- [ ] **Step 7: See it work and commit**

With Django (`manage.py runserver`) and PostgreSQL running, start `npm run dev`. Open `http://adsmart.localhost:3000/` (AD Smart School), `http://adsmart.localhost:3000/levels` and `http://nobody.localhost:3000/` (not found).

```bash
git add -A frontend
git commit -m "Serve every school from its own address through the Next.js proxy"
```

---

### Task 6: Frontend: each school's logo and colours

**Files:**
- Create: `frontend/src/components/site/brand-style.tsx`, `frontend/src/components/brand/school-mark.tsx`, `frontend/src/components/brand/brand.test.tsx`
- Modify: `frontend/src/components/brand/brand-link.tsx`, `frontend/src/components/site/header.tsx`, `frontend/src/components/site/footer.tsx`, `frontend/src/app/sites/[host]/layout.tsx`
- Replace: `frontend/src/app/icon.svg` (a neutral platform icon)
- Delete: `frontend/src/components/brand/logo-mark.tsx` (AD Smart's logo is now an uploaded image)

**Interfaces:**
- Consumes: `SiteData.brand`, `SchoolInfo.logo` (Task 5).
- Produces:
  - `<BrandStyle brand={BrandTokens} />`.
  - `<SchoolMark name logo className? />` and `initials(name)`.
  - `<BrandLink name logo? />`; `<Header schoolName logo? portalUrl? />`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/components/brand/brand.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandStyle } from "@/components/site/brand-style";
import { BrandLink } from "./brand-link";
import { initials, SchoolMark } from "./school-mark";

const LOGO = { src: "/media/logo-480w.webp", srcset: "/media/logo-480w.webp 480w", width: 480, height: 480, alt: "x" };

describe("SchoolMark", () => {
  it("shows the uploaded logo, or the school's initials", () => {
    const { container, rerender } = render(<SchoolMark name="AD Smart School" logo={LOGO} />);
    expect(container.querySelector("img")).toHaveAttribute("src", LOGO.src);

    rerender(<SchoolMark name="Bright Future Academy" logo={null} />);
    expect(screen.getByText("BF")).toBeInTheDocument();
  });

  it.each([
    ["Bright Future Academy", "BF"],
    ["St. Mary's School", "SM"],
    ["Ɔdɔ Montessori", "ƆM"],
    ["SchoolSite", "S"],
  ])("takes initials from %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe("BrandLink", () => {
  it("links home with the school's name", () => {
    render(<BrandLink name="Bright Future Academy" />);
    expect(screen.getByRole("link", { name: /Bright Future Academy/ })).toHaveAttribute("href", "/");
  });
});

describe("BrandStyle", () => {
  it("prints nothing for the platform palette", () => {
    const { container } = render(<BrandStyle brand={{ light: {}, dark: {} }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("overrides the palette in both themes and drops anything unsafe", () => {
    const { container } = render(
      <BrandStyle
        brand={{
          light: { "--btn-primary": "#7a1f1f", "--mesh-glow": "rgb(255 209 102 / 0.35)", "--x": "red;}</style>" },
          dark: { "--accent-indigo": "#c58a8a" },
        }}
      />,
    );
    const css = container.querySelector("style")?.innerHTML ?? "";
    expect(css).toContain(':root:not([data-theme="dark"]){--btn-primary:#7a1f1f;--mesh-glow:rgb(255 209 102 / 0.35)}');
    expect(css).toContain('[data-theme="dark"]{--accent-indigo:#c58a8a}');
    expect(css).toContain("@media (prefers-color-scheme: dark){:root:not([data-theme]){--accent-indigo:#c58a8a}}");
    expect(css).not.toContain("</style>");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend && npx vitest run src/components/brand`
Expected: FAIL, because `./school-mark` and `@/components/site/brand-style` cannot be resolved.

- [ ] **Step 3: Write the components**

`frontend/src/components/brand/school-mark.tsx`:
```tsx
import { cn } from "@/lib/cn";
import type { ImageData } from "@/lib/types";

const SKIP = /^(the|of|and|school|schools|academy|complex)$/i;

/** Up to two initials for a school without a logo: "Bright Future Academy" gives "BF". */
export function initials(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const kept = words.filter((word) => !SKIP.test(word));
  return (kept.length ? kept : words)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

type Props = { name: string; logo: ImageData | null; className?: string };

/** The school's logo, or a monogram in its brand colour (amendment §7.2). Decorative: the
 * school's name is always written next to it. */
export function SchoolMark({ name, logo, className }: Props) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP renditions from Django
      <img
        src={logo.src}
        srcSet={logo.srcset}
        sizes="72px"
        alt=""
        width={logo.width}
        height={logo.height}
        className={cn("h-8 w-auto sm:h-9", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn("flex size-8 items-center justify-center rounded-[8px] bg-primary text-sm font-bold text-white sm:size-9", className)}
    >
      {initials(name)}
    </span>
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
import type { ImageData } from "@/lib/types";
import { SchoolMark } from "./school-mark";

type Props = { name: string; logo?: ImageData | null; className?: string };

export function BrandLink({ name, logo = null, className }: Props) {
  const [tileRef, animate] = useAnimate<HTMLSpanElement>();
  const reduceMotion = useReducedMotion();

  // The logo tile swings from its top edge (spec §8.6), whatever the school's logo is.
  const swing = useCallback(() => {
    if (reduceMotion || !tileRef.current) return;
    animate(tileRef.current, { rotate: [-7, 0] }, springs.swing);
  }, [animate, tileRef, reduceMotion]);

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
      <span ref={tileRef} className="logo-tile origin-top">
        <SchoolMark name={name} logo={logo} />
      </span>
      <span className="text-base leading-tight font-semibold sm:text-lg">{name}</span>
    </Link>
  );
}
```

`frontend/src/components/site/brand-style.tsx`:
```tsx
import type { BrandTokens } from "@/lib/types";

const NAME = /^--[a-z-]+$/;
const VALUE = /^[#a-z0-9(). /]+$/i;

function declarations(tokens: Record<string, string>): string {
  return Object.entries(tokens)
    .filter(([name, value]) => NAME.test(name) && VALUE.test(value))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
}

/**
 * A school's brand colours over the platform palette (amendment §7.2). The values are Django's
 * contrast-checked tokens; anything that is not a plain colour is dropped.
 */
export function BrandStyle({ brand }: { brand: BrandTokens }) {
  const light = declarations(brand.light);
  const dark = declarations(brand.dark);
  if (!light && !dark) return null;
  const css =
    `:root:not([data-theme="dark"]){${light}}` +
    `[data-theme="dark"]{${dark}}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme]){${dark}}}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
```

In `frontend/src/components/site/header.tsx`:
- Change `type Props` to `type Props = { schoolName: string; logo?: ImageData | null; portalUrl?: string };`, and add `import type { ImageData } from "@/lib/types";`.
- Destructure `logo` and render `<BrandLink name={schoolName} logo={logo} />`.

In `frontend/src/components/site/footer.tsx`:
- Replace `import { LogoMark } from "@/components/brand/logo-mark";` with `import { SchoolMark } from "@/components/brand/school-mark";`.
- Replace `<LogoMark className="h-9 w-auto" />` with `<SchoolMark name={school.name} logo={school.logo} />`.

In `frontend/src/app/sites/[host]/layout.tsx`:
- Add `import { BrandStyle } from "@/components/site/brand-style";`.
- Render `<BrandStyle brand={site.brand} />` as the first child of the fragment.
- Pass `logo={site.school.logo}` to `<Header>`.

`frontend/src/app/icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#0f1a9e"/>
  <path d="M16 6 5 13h3v12h6v-6h4v6h6V13h3z" fill="#ffffff"/>
  <circle cx="16" cy="13.5" r="2" fill="#f0ad1c"/>
</svg>
```

Run: `cd frontend && git rm -q src/components/brand/logo-mark.tsx`

- [ ] **Step 4: Run the tests and checks**

Run: `cd frontend && npm test && npm run lint && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A frontend
git commit -m "Show each school's own logo and colours, with readable dark-mode variants"
```

---

### Task 7: Frontend: the platform marketing site

**Files:**
- Create: `frontend/src/lib/lead-schema.ts`, `frontend/src/lib/lead-schema.test.ts`, `frontend/src/components/platform/lead-form.tsx`, `frontend/src/components/platform/lead-form.test.tsx`, `frontend/src/components/platform/platform-header.tsx`, `frontend/src/components/platform/platform-footer.tsx`, `frontend/src/components/site/privacy-notice-content.tsx`, `frontend/src/app/platform-site/layout.tsx`, `frontend/src/app/platform-site/page.tsx`, `frontend/src/app/platform-site/privacy/page.tsx`, `frontend/src/app/platform-site/robots.txt/route.ts`, `frontend/src/app/platform-site/sitemap.xml/route.ts`, `frontend/src/app/platform-site/opengraph-image.tsx`, `frontend/src/app/platform-site/seo.test.ts`
- Modify: `frontend/src/lib/api.ts` (+ test), `frontend/src/lib/types.ts`, `frontend/src/lib/enquiry-schema.ts` (export `GH_MOBILE`, `EMAIL`), `frontend/src/app/sites/[host]/privacy/page.tsx` (use the shared notice content)

**Interfaces:**
- Consumes: `GET /api/public/platform`, `GET /api/public/platform/privacy-notice`, `POST /api/public/platform/leads` and `GET /api/public/enquiries/form-token` (Task 4).
- Produces:
  - `getPlatform() -> PlatformData` and `getPlatformPrivacyNotice()`.
  - `PlatformData = {name, email, url, is_public, schools: PlatformSchool[]}`.
  - `<LeadForm platformName />`; `<PrivacyNoticeContent notice />`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/lead-schema.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { EMPTY_LEAD, leadSchema } from "./lead-schema";

const VALID = {
  ...EMPTY_LEAD,
  school_name: "Sunrise Academy",
  contact_name: "Kwame Asante",
  phone: "020 123 4567",
  town: "Ejisu",
  data_consent: true,
};

describe("lead schema", () => {
  it("accepts a complete request", () => {
    expect(leadSchema.safeParse(VALID).success).toBe(true);
  });

  it.each([
    ["school_name", "", "Enter the school's name."],
    ["phone", "0302123456", "Enter a Ghana mobile number, e.g. 024 123 4567."],
    ["email", "nope", "Enter a valid email address, or leave it blank."],
    ["data_consent", false, "Please agree so we can use these details to reply to you."],
  ])("explains a bad %s", (field, value, message) => {
    const result = leadSchema.safeParse({ ...VALID, [field]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(message);
  });
});
```

`frontend/src/components/platform/lead-form.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeadForm } from "./lead-form";

function stubApi(postStatus = 201, postBody: unknown = { status: "received" }) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? { ok: postStatus < 300, status: postStatus, json: async () => postBody }
      : { ok: true, status: 200, json: async () => ({ token: "signed-token" }) },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/school name/i), "Sunrise Academy");
  await user.type(screen.getByLabelText(/^town/i), "Ejisu");
  await user.type(screen.getByLabelText(/your name/i), "Kwame Asante");
  await user.type(screen.getByLabelText(/mobile number/i), "020 123 4567");
  await user.click(screen.getByLabelText(/I agree/i));
}

describe("LeadForm", () => {
  it("lists what is missing and moves focus to the summary", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<LeadForm platformName="SchoolSite" />);

    await user.click(screen.getByRole("button", { name: "Send request" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("School name: Enter the school's name.");
    await waitFor(() => expect(summary).toHaveFocus());
  });

  it("sends the request with its form token and says thank you", async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    render(<LeadForm platformName="SchoolSite" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findByRole("heading", { name: /received your request/i })).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/api/public/platform/leads");
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      school_name: "Sunrise Academy",
      phone: "020 123 4567",
      form_token: "signed-token",
      website: "",
    });
  });

  it("shows the server's field errors", async () => {
    stubApi(400, {
      code: "validation_error",
      message: "Please check the highlighted fields.",
      fields: { phone: ["Enter a Ghana mobile number, e.g. 024 123 4567."] },
    });
    const user = userEvent.setup();
    render(<LeadForm platformName="SchoolSite" />);
    await fillIn(user);

    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findAllByText(/Enter a Ghana mobile number/)).not.toHaveLength(0);
  });
});
```

`frontend/src/app/platform-site/seo.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { getPlatform } from "@/lib/api";
import type { PlatformData } from "@/lib/types";
import { GET as robots } from "./robots.txt/route";
import { GET as sitemap } from "./sitemap.xml/route";

vi.mock("@/lib/api", () => ({ getPlatform: vi.fn() }));

const PLATFORM: PlatformData = { name: "SchoolSite", email: "", url: "https://schoolsite.test", is_public: false, schools: [] };

describe("platform robots.txt and sitemap.xml", () => {
  it("keep search engines out until the platform is public", async () => {
    vi.mocked(getPlatform).mockResolvedValue(PLATFORM);
    expect(await (await robots()).text()).toBe("User-Agent: *\nDisallow: /\n");
    expect(await (await sitemap()).text()).not.toContain("<url>");
  });

  it("list the platform pages once public", async () => {
    vi.mocked(getPlatform).mockResolvedValue({ ...PLATFORM, is_public: true });
    expect(await (await robots()).text()).toContain("Sitemap: https://schoolsite.test/sitemap.xml");
    expect(await (await sitemap()).text()).toContain("<loc>https://schoolsite.test/privacy</loc>");
  });
});
```

In `frontend/src/lib/api.test.ts`, add `getPlatform` to the import and add inside the `describe`:
```ts
  it("reads the platform's details", async () => {
    vi.stubEnv("DJANGO_ORIGIN", "http://django.test");
    const fetchMock = stubFetch(200, { name: "SchoolSite" });

    expect((await getPlatform()).name).toBe("SchoolSite");
    expect(fetchMock).toHaveBeenCalledWith("http://django.test/api/public/platform", expect.anything());
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend && npx vitest run src/lib src/components/platform src/app/platform-site`
Expected: FAIL, because the modules cannot be resolved.

- [ ] **Step 3: Write the data helpers and the form**

In `frontend/src/lib/enquiry-schema.ts`, change `const GH_MOBILE` to `export const GH_MOBILE` and `const EMAIL` to `export const EMAIL`.

In `frontend/src/lib/types.ts`, append:
```ts

export type PlatformSchool = { name: string; town: string; region: string; url: string };

/** GET /api/public/platform (amendment §6). */
export type PlatformData = { name: string; email: string; url: string; is_public: boolean; schools: PlatformSchool[] };
```

In `frontend/src/lib/api.ts`, add `PlatformData` to the type import and append:
```ts

export async function getPlatform(): Promise<PlatformData> {
  const platform = await fetchJson<PlatformData>("/api/public/platform");
  if (!platform) throw new Error("Website API is missing /api/public/platform");
  return platform;
}

export async function getPlatformPrivacyNotice(): Promise<PrivacyNotice | null> {
  return fetchJson<PrivacyNotice>("/api/public/platform/privacy-notice");
}
```

`frontend/src/lib/lead-schema.ts`:
```ts
import { z } from "zod";
import { EMAIL, GH_MOBILE } from "./enquiry-schema";

/** Mirrors the server's rules for "Get your school online" (amendment §6). */
export const leadSchema = z.object({
  school_name: z.string().trim().min(2, "Enter the school's name.").max(120, "Use 120 characters or fewer."),
  town: z.string().trim().min(2, "Enter the school's town.").max(80, "Use 80 characters or fewer."),
  contact_name: z.string().trim().min(2, "Enter your full name.").max(120, "Use 120 characters or fewer."),
  phone: z
    .string()
    .trim()
    .refine((value) => GH_MOBILE.test(value.replace(/[\s-]/g, "")), "Enter a Ghana mobile number, e.g. 024 123 4567."),
  email: z
    .string()
    .trim()
    .max(254, "Use 254 characters or fewer.")
    .refine((value) => value === "" || EMAIL.test(value), "Enter a valid email address, or leave it blank."),
  message: z.string().max(1000, "Use 1,000 characters or fewer."),
  data_consent: z.boolean().refine((value) => value, "Please agree so we can use these details to reply to you."),
});

export type LeadValues = z.infer<typeof leadSchema>;

export const EMPTY_LEAD: LeadValues = {
  school_name: "",
  town: "",
  contact_name: "",
  phone: "",
  email: "",
  message: "",
  data_consent: false,
};
```

`frontend/src/components/platform/lead-form.tsx`:
```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type BaseSyntheticEvent } from "react";
import { useForm } from "react-hook-form";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { ApiRequestError, getJson, postJson } from "@/lib/client-api";
import { EMPTY_LEAD, leadSchema, type LeadValues } from "@/lib/lead-schema";

const LABELS: Record<keyof LeadValues, string> = {
  school_name: "School name",
  town: "Town",
  contact_name: "Your name",
  phone: "Mobile number",
  email: "Email",
  message: "Message",
  data_consent: "Agreement",
};
const OFFLINE = "We couldn't send your request. Please check your connection and try again.";
const isField = (name: string): name is keyof LeadValues => name in EMPTY_LEAD;

/** "Get your school online" (amendment §6), with the enquiry form's spam protection. */
export function LeadForm({ platformName }: { platformName: string }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<LeadValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: EMPTY_LEAD,
    mode: "onBlur",
    reValidateMode: "onChange",
    shouldFocusError: false, // the error summary takes focus instead (spec §8.7)
  });
  const [token, setToken] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<LeadValues | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const handledFocusRequest = useRef(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<{ token: string }>("/api/public/enquiries/form-token").then(
      (data) => {
        if (!cancelled) setToken(data.token);
      },
      () => {
        if (!cancelled) setFormError(OFFLINE);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sent) successRef.current?.focus();
  }, [sent]);

  // Focus the error summary on the first commit where it exists (spec §8.7).
  useEffect(() => {
    if (focusRequest > handledFocusRequest.current && summaryRef.current) {
      handledFocusRequest.current = focusRequest;
      summaryRef.current.focus();
    }
  });
  const focusSummary = () => setFocusRequest((count) => count + 1);

  async function onValid(values: LeadValues, event?: BaseSyntheticEvent) {
    const form = event?.target as HTMLFormElement | undefined;
    const honeypot = (form?.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "";
    setFormError(null);
    if (!token) {
      setFormError(OFFLINE);
      return focusSummary();
    }
    try {
      await postJson("/api/public/platform/leads", { ...values, form_token: token, website: honeypot });
      setSent(values);
    } catch (error) {
      const body = error instanceof ApiRequestError ? error.body : null;
      if (body?.code === "validation_error") {
        for (const [name, messages] of Object.entries(body.fields)) {
          if (isField(name)) setError(name, { message: messages[0] });
          else setFormError(messages[0]);
        }
      } else {
        setFormError(body?.message ?? OFFLINE);
      }
      focusSummary();
    }
  }

  if (sent) {
    return (
      <div className="surface rounded-card p-8 text-center" role="status">
        <CircleCheck aria-hidden className="animate-pop mx-auto size-16 text-success" />
        <h3 ref={successRef} tabIndex={-1} className="mt-4 text-2xl font-semibold outline-none">
          Thank you. We&apos;ve received your request.
        </h3>
        <p className="mt-3 text-ink-muted">
          We&apos;ll call you on {sent.phone} to talk about getting {sent.school_name} online.
        </p>
      </div>
    );
  }

  const fieldErrors = (Object.keys(LABELS) as (keyof LeadValues)[]).filter((name) => errors[name]?.message);
  const showSummary = Boolean(formError) || (submitCount > 0 && fieldErrors.length > 0);
  const text = (name: "school_name" | "town" | "contact_name", autoComplete: string, required = true) => (
    <Field id={`lead-${name}`} label={LABELS[name]} required={required} error={errors[name]?.message}>
      {(props) => <input {...props} {...register(name)} type="text" autoComplete={autoComplete} className={inputClasses} />}
    </Field>
  );

  return (
    <form noValidate onSubmit={handleSubmit(onValid, focusSummary)} className="surface space-y-6 rounded-card p-6 sm:p-8">
      <p className="text-sm text-ink-muted">Fields marked * are required.</p>

      {showSummary && (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-control border border-danger bg-danger/10 p-4 outline-none">
          <h3 className="font-semibold">Please check the form</h3>
          {formError && <p className="mt-1">{formError}</p>}
          {fieldErrors.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {fieldErrors.map((name) => (
                <li key={name}>
                  <a className="link" href={`#lead-${name}`}>
                    {LABELS[name]}: {errors[name]?.message}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {text("school_name", "organization")}
        {text("town", "address-level2")}
        {text("contact_name", "name")}
        <Field id="lead-phone" label={LABELS.phone} required hint="We'll call you on this number." error={errors.phone?.message}>
          {(props) => <input {...props} {...register("phone")} type="tel" inputMode="tel" autoComplete="tel" className={inputClasses} />}
        </Field>
      </div>
      <Field id="lead-email" label={LABELS.email} error={errors.email?.message}>
        {(props) => <input {...props} {...register("email")} type="email" autoComplete="email" className={inputClasses} />}
      </Field>
      <Field id="lead-message" label={LABELS.message} hint="For example how many pupils you have, or what you need most." error={errors.message?.message}>
        {(props) => <textarea {...props} {...register("message")} rows={4} maxLength={1000} className={inputClasses} />}
      </Field>

      {/* Honeypot: hidden from people, filled in by bots (Phase 1 spec §6.4). */}
      <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
        <label htmlFor="lead-website">Leave this field empty</label>
        <input id="lead-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div>
        <div className="flex items-start gap-3">
          <input
            id="lead-data_consent"
            type="checkbox"
            {...register("data_consent")}
            aria-invalid={errors.data_consent ? true : undefined}
            aria-describedby={errors.data_consent ? "lead-data_consent-error" : undefined}
            className="mt-1 size-6 shrink-0 accent-[var(--btn-primary)]"
          />
          <label htmlFor="lead-data_consent">
            I agree that {platformName} may use these details to reply to me, as described in the{" "}
            <Link href="/privacy" className="link">
              privacy notice
            </Link>
            .<span aria-hidden className="text-danger"> *</span>
          </label>
        </div>
        {errors.data_consent && (
          <p id="lead-data_consent-error" className="mt-2 text-sm font-medium text-danger">
            {errors.data_consent.message}
          </p>
        )}
      </div>

      <Button type="submit" variant="amber" size="lg" disabled={isSubmitting} className="w-full sm:w-auto">
        {isSubmitting ? "Sending…" : "Send request"}
      </Button>
    </form>
  );
}
```

`frontend/src/components/site/privacy-notice-content.tsx`:
```tsx
import { RichText } from "@/components/ui/rich-text";
import { formatDate } from "@/lib/dates";
import type { PrivacyNotice } from "@/lib/types";

/** The body of a privacy notice page, for a school or the platform (Act 843). */
export function PrivacyNoticeContent({ notice }: { notice: PrivacyNotice | null }) {
  if (!notice) return <p className="text-lg">Our privacy notice will be published here soon.</p>;
  return (
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
  );
}
```

In `frontend/src/app/sites/[host]/privacy/page.tsx`:
- Replace the `{notice ? (…) : (…)}` expression with `<PrivacyNoticeContent notice={notice} />`.
- Import `PrivacyNoticeContent` from `@/components/site/privacy-notice-content`, and drop the `RichText` and `formatDate` imports.

- [ ] **Step 4: Write the platform pages**

`frontend/src/components/platform/platform-header.tsx`:
```tsx
import { BrandLink } from "@/components/brand/brand-link";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export function PlatformHeader({ name }: { name: string }) {
  return (
    <header className="glass-frosted fixed inset-x-0 top-0 z-40 text-ink shadow-elev-1">
      <Container className="flex h-18 items-center justify-between gap-3">
        <BrandLink name={name} />
        <ButtonLink href="/#get-online" className="px-4">
          Get online
        </ButtonLink>
      </Container>
    </header>
  );
}
```

`frontend/src/components/platform/platform-footer.tsx`:
```tsx
import Link from "next/link";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { Container } from "@/components/ui/container";

export function PlatformFooter({ name, email }: { name: string; email: string }) {
  const link = "inline-flex min-h-11 items-center hover:text-indigo";
  return (
    <footer className="border-t border-line bg-card pt-12 pb-24 sm:pb-12">
      <Container className="flex flex-wrap items-center justify-between gap-6">
        <div>
          <p className="text-lg font-semibold">{name}</p>
          <p className="mt-1 text-ink-muted">Websites and school systems for schools in Ghana.</p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6">
            <li>
              <Link href="/#get-online" className={link}>Get your school online</Link>
            </li>
            <li>
              <Link href="/privacy" className={link}>Privacy notice</Link>
            </li>
            {email && (
              <li>
                <a href={`mailto:${email}`} className={link}>{email}</a>
              </li>
            )}
          </ul>
        </nav>
        <ThemeToggle showLabels className="bg-ink/5" />
      </Container>
      <Container className="mt-8 text-sm text-ink-muted">© {new Date().getFullYear()} {name}.</Container>
    </footer>
  );
}
```

`frontend/src/app/platform-site/layout.tsx`:
```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PlatformFooter } from "@/components/platform/platform-footer";
import { PlatformHeader } from "@/components/platform/platform-header";
import { OfflineBar } from "@/components/site/offline-bar";
import { PreviewRibbon } from "@/components/site/preview-ribbon";
import { SkipLink } from "@/components/site/skip-link";
import { getPlatform } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  const platform = await getPlatform();
  return {
    metadataBase: new URL(platform.url),
    title: { default: `${platform.name} · School websites for Ghana`, template: `%s · ${platform.name}` },
    description: "A website and school system made for schools in Ghana: quick on any phone, simple for staff and clear for parents.",
    applicationName: platform.name,
    robots: platform.is_public ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const platform = await getPlatform();
  return (
    <>
      <SkipLink />
      <PlatformHeader name={platform.name} />
      <OfflineBar />
      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <PlatformFooter name={platform.name} email={platform.email} />
      {!platform.is_public && <PreviewRibbon />}
    </>
  );
}
```

`frontend/src/app/platform-site/page.tsx`:
```tsx
import { Globe, Inbox, ShieldCheck, Smartphone, type LucideIcon } from "lucide-react";
import { SwingIn } from "@/components/motion/swing-in";
import { LeadForm } from "@/components/platform/lead-form";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { getPlatform } from "@/lib/api";

export const revalidate = 300;

// Only what a school gets today; new features join this list as they ship (amendment §6).
const FEATURES: { title: string; text: string; Icon: LucideIcon }[] = [
  {
    title: "Your own website",
    text: "A fast, accessible school website at your own address, or on your school's own domain.",
    Icon: Globe,
  },
  {
    title: "Admissions enquiries",
    text: "Parents enquire online and the school is emailed straight away, with spam kept out.",
    Icon: Inbox,
  },
  {
    title: "Made for phones",
    text: "Quick on mobile data, with light and dark modes and a lighter mode for older phones.",
    Icon: Smartphone,
  },
  {
    title: "Your information stays yours",
    text: "Each school's records are kept apart from every other school's, and nothing goes public until you say so.",
    Icon: ShieldCheck,
  },
];

export default async function PlatformHomePage() {
  const platform = await getPlatform();
  return (
    <>
      <section className="bg-brand-mesh on-dark relative isolate overflow-hidden pt-32 pb-20 text-white sm:pt-40 sm:pb-28">
        <Container>
          <div className="glass-clear animate-rise max-w-2xl rounded-card p-6 sm:p-10">
            <p className="text-sm font-semibold tracking-wider uppercase">{platform.name}</p>
            <h1 className="mt-3 text-4xl font-bold sm:text-5xl">Your school, online</h1>
            <p className="mt-5 text-lg text-white/90">
              A website and school system made for schools in Ghana: quick on any phone, simple for staff and clear
              for parents.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="#get-online" variant="amber" size="lg">
                Get your school online
              </ButtonLink>
              {platform.schools.length > 0 && (
                <ButtonLink href="#schools" variant="glass" size="lg">
                  See our schools
                </ButtonLink>
              )}
            </div>
          </div>
        </Container>
      </section>

      <section aria-labelledby="features-title" className="py-20 sm:py-28">
        <Container>
          <SectionHeading id="features-title" eyebrow="What your school gets" title="Everything in one place" />
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ title, text, Icon }, index) => (
              <li key={title}>
                <SwingIn index={index} className="h-full">
                  <article className="surface h-full rounded-card p-6 shadow-elev-1">
                    <span className="inline-flex size-12 items-center justify-center rounded-control bg-indigo/10 text-indigo">
                      <Icon aria-hidden className="size-6" />
                    </span>
                    <h3 className="mt-4 text-xl font-semibold">{title}</h3>
                    <p className="mt-2 text-ink-muted">{text}</p>
                  </article>
                </SwingIn>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {platform.schools.length > 0 && (
        <section id="schools" aria-labelledby="schools-title" className="scroll-mt-24 pb-20 sm:pb-28">
          <Container>
            <SectionHeading id="schools-title" eyebrow="Already online" title={`Schools on ${platform.name}`} />
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {platform.schools.map((school) => (
                <li key={school.url}>
                  <a href={school.url} className="surface press block rounded-card p-6 hover:shadow-elev-2">
                    <span className="text-lg font-semibold">{school.name}</span>
                    <span className="mt-1 block text-ink-muted">
                      {school.town}, {school.region}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}

      <section id="get-online" aria-labelledby="get-online-title" className="scroll-mt-24 bg-card py-20 sm:py-28">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 id="get-online-title" className="text-3xl font-bold">Get your school online</h2>
            <p className="mt-4 text-lg text-ink-muted">
              Tell us about your school and we&apos;ll call you to talk it through.
            </p>
            {platform.email && (
              <p className="mt-4">
                Or email{" "}
                <a className="link" href={`mailto:${platform.email}`}>
                  {platform.email}
                </a>
                .
              </p>
            )}
          </div>
          <LeadForm platformName={platform.name} />
        </Container>
      </section>
    </>
  );
}
```

`frontend/src/app/platform-site/privacy/page.tsx`:
```tsx
import type { Metadata } from "next";
import { PageHero } from "@/components/site/page-hero";
import { PrivacyNoticeContent } from "@/components/site/privacy-notice-content";
import { Container } from "@/components/ui/container";
import { getPlatformPrivacyNotice } from "@/lib/api";

export const revalidate = 300;
export const metadata: Metadata = { title: "Privacy notice", description: "How we use and protect personal information (Data Protection Act, 2012)." };

export default async function PlatformPrivacyPage() {
  const notice = await getPlatformPrivacyNotice();
  return (
    <>
      <PageHero eyebrow="Your data" title={notice?.title ?? "Privacy notice"} />
      <section className="py-16 sm:py-24">
        <Container>
          <div className="mx-auto max-w-3xl">
            <PrivacyNoticeContent notice={notice} />
          </div>
        </Container>
      </section>
    </>
  );
}
```

`frontend/src/app/platform-site/robots.txt/route.ts`:
```ts
import { getPlatform } from "@/lib/api";

export const revalidate = 300;

export async function GET() {
  const platform = await getPlatform();
  const body = platform.is_public
    ? `User-Agent: *\nAllow: /\n\nSitemap: ${platform.url}/sitemap.xml\n`
    : "User-Agent: *\nDisallow: /\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
```

`frontend/src/app/platform-site/sitemap.xml/route.ts`:
```ts
import { getPlatform } from "@/lib/api";

export const revalidate = 3600;

export async function GET() {
  const platform = await getPlatform();
  const urls = platform.is_public
    ? ["", "/privacy"].map((path) => `  <url><loc>${platform.url}${path}</loc></url>`).join("\n")
    : "";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
```

`frontend/src/app/platform-site/opengraph-image.tsx`:
```tsx
import { ImageResponse } from "next/og";
import { getPlatform } from "@/lib/api";

export const alt = "School websites for Ghana";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const platform = await getPlatform();
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
        <div style={{ fontSize: 34, fontWeight: 600, color: "#f0ad1c" }}>{platform.name}</div>
        <div style={{ fontSize: 88, fontWeight: 700, marginTop: 16 }}>Your school, online</div>
        <div style={{ fontSize: 40, marginTop: 16 }}>Websites and school systems for Ghana</div>
      </div>
    ),
    size,
  );
}
```

- [ ] **Step 5: Run the tests and checks**

Run: `cd frontend && npm test && npm run lint && npm run typecheck`
Expected: all pass.

- [ ] **Step 6: See it and commit**

With Django and `npm run dev` running, open `http://localhost:3000/` (the platform site) and send a request from the form. Django's console shows the email.

```bash
git add -A frontend
git commit -m "Add the platform marketing site with a Get your school online form"
```

---

### Task 8: Browser tests across schools, Lighthouse and docs

**Files:**
- Modify: `frontend/e2e/serve.mjs`, `frontend/playwright.config.ts`, `frontend/e2e/lighthouse.mjs`, `frontend/.env.local.example`, `README.md`
- Create: `frontend/e2e/platform.spec.ts`

**Interfaces:**
- Consumes: everything above, through the real Next.js proxy.

- [ ] **Step 1: Write the browser tests**

`frontend/e2e/platform.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { expectNoAccessibilityViolations } from "./axe";

const PLATFORM = "http://localhost:3100";
const BRIGHT_FUTURE = "http://brightfuture.localhost:3100";

for (const scheme of ["light", "dark"] as const) {
  test(`the platform home page is usable and accessible in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto(PLATFORM);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your school, online");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expectNoAccessibilityViolations(page);
  });
}

test("a school owner can ask to get their school online", async ({ page }) => {
  await page.goto(`${PLATFORM}/#get-online`);
  await page.getByLabel(/school name/i).fill("Sunrise Academy");
  await page.getByLabel(/^town/i).fill("Ejisu");
  await page.getByLabel(/your name/i).fill("Kwame Asante");
  await page.getByLabel(/mobile number/i).fill("020 123 4567");
  await page.getByLabel(/I agree/i).check();
  await page.waitForTimeout(3200); // spam protection: the form must be open for 3 seconds

  await page.getByRole("button", { name: "Send request" }).click();

  await expect(page.getByRole("heading", { name: /received your request/i })).toBeFocused();
});

test("each school has its own site and only its own levels", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(BRIGHT_FUTURE);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bright beginnings, from KG to Basic 6");
  await expect(page.getByRole("link", { name: /Bright Future Academy/ }).first()).toBeVisible();

  await page.goto(`${BRIGHT_FUTURE}/levels`);
  await expect(page.getByRole("heading", { level: 2, name: "Kindergarten (KG1–KG2)" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /Junior High/ })).toHaveCount(0);
  await expectNoAccessibilityViolations(page);
});

test("a school's address never shows another school's pages", async ({ page }) => {
  const response = await page.goto(`${BRIGHT_FUTURE}/sites/adsmart.localhost/about`);
  expect(response?.status()).toBe(404);
});

test("an unknown school address shows the not-found page", async ({ page }) => {
  const response = await page.goto("http://nobody.localhost:3100/");
  expect(response?.status()).toBe(404);
});
```

- [ ] **Step 2: Point the browser tests at the school addresses**

In `frontend/playwright.config.ts`:
- Set `baseURL: "http://adsmart.localhost:3100"`. Chromium resolves `*.localhost` itself.
- Set `webServer.url` to `"http://localhost:3100"`. Node cannot resolve `*.localhost` on Windows.

In `frontend/e2e/serve.mjs`:
- In `djangoEnv`, delete `DJANGO_ALLOWED_HOSTS` and add:
```js
  PLATFORM_DOMAIN: "localhost",
  PLATFORM_EMAIL: "hello@schoolsite.test",
  SITE_URL_TEMPLATE: "http://{host}:3100",
```
- Replace `nextEnv` with `const nextEnv = { ...process.env, DJANGO_ORIGIN: DJANGO, PLATFORM_DOMAIN: "localhost" };`.
- After the `seed_website` line, add a second school. There is no shell, so names with spaces arrive intact:
```js
await run(
  python,
  ["manage.py", "create_school", "--slug", "brightfuture", "--name", "Bright Future Academy", "--town", "Ejisu",
   "--region", "Ashanti Region", "--phone", "0201234567", "--email", "office@brightfuture.test",
   "--levels", "kg,lower_primary,upper_primary"],
  { cwd: backend, env: djangoEnv, shell: false },
);
```

In `frontend/e2e/lighthouse.mjs`, replace the `BASE` and `PAGES` constants with:
```js
const BASE = "http://localhost:3100"; // Node cannot resolve *.localhost on Windows; Chromium can
const SCHOOL = "http://adsmart.localhost:3100";
const PAGES = [`${SCHOOL}/`, `${SCHOOL}/admissions`, `${SCHOOL}/?lite=1`, `${BASE}/`];
```
Then:
- Change `lighthouse(\`${BASE}${page}\`, …)` to `lighthouse(page, …)`.
- Set the report name to `const name = page.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");`.
- Pad with `page.padEnd(40)`.

In `frontend/.env.local.example`, add:
```
# The platform's main domain: localhost in development, so schools are <slug>.localhost:3000
PLATFORM_DOMAIN=localhost
```

- [ ] **Step 3: Run the browser tests and Lighthouse**

Run: `cd frontend && npm run e2e && npm run lighthouse`
Expected:
- Every spec passes in both projects. AD Smart School's existing specs run unchanged at `adsmart.localhost`.
- Lighthouse meets the budget for the four pages, including the platform home page.

- [ ] **Step 4: Document the platform**

In `README.md`, add a section "One platform, many schools":
```markdown
## One platform, many schools

- **Addresses in development:** `http://localhost:3000` is the platform site; each school is at
  `http://<slug>.localhost:3000` (AD Smart School: `http://adsmart.localhost:3000`). Chrome, Edge
  and Firefox resolve `*.localhost` on their own.
- **Seed the first school:** `cd backend && .venv/Scripts/python manage.py seed_website`
  (AD Smart School, with its logo, plus the platform's draft privacy notice).
- **Add a school:** `.venv/Scripts/python manage.py create_school --slug brightfuture
  --name "Bright Future Academy" --town Ejisu --region "Ashanti Region" --phone 0201234567
  --email office@brightfuture.example --levels kg,lower_primary,upper_primary`.
  Its placeholder site is live at once, in preview, until the school completes its go-live checks.
- **Platform settings** (`backend/.env`): `PLATFORM_NAME`, `PLATFORM_DOMAIN`, `PLATFORM_EMAIL`,
  `SITE_URL_TEMPLATE`. The frontend needs the same `PLATFORM_DOMAIN` in `frontend/.env.local`.
```

- [ ] **Step 5: Run every check and commit**

Run: `scripts/check.sh`, then `WITH_E2E=1 scripts/check.sh`.
Expected: "All checks passed."

```bash
git add frontend README.md
git commit -m "Test the platform and a second school in the browser; document the platform"
```
