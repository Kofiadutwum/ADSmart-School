# Plan 2: Sign-in and Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every school user can sign in safely: staff, parents and students. Staff who need it use a second factor, parents activate by SMS code, sessions time out by role, and every security event lands in an append-only audit log.

**Architecture:** There are three new Django apps:
- `accounts`: custom User, roles, sign-in, second factor, sessions.
- `audit`: an append-only log, enforced by a PostgreSQL trigger in development.
- `notifications`: an SMS gateway with guards and a delivery log.

Development and tests move to PostgreSQL. It runs from the npm package `embedded-postgres`, so nothing is installed system-wide. The frontend gains `(auth)` pages (sign-in, activation) and a minimal `(portal)` shell with an Account page. All of it uses the same-origin session cookie and the `X-CSRFToken` header.

**Tech Stack:** Django 6.1.2, DRF 3.18.3, argon2-cffi 25.1.0, pyotp 2.10.0, qrcode 8.2, psycopg[binary] 3.3.6, embedded-postgres 18.4.0-beta.17; Next.js 16.4, React 19.3, Vitest 5, Playwright 1.64.

**Spec:** `docs/superpowers/specs/2026-10-09-ad-smart-school-website-phase1-design.md` (§3.7, §3.8, §4, §5, §10, §11, §12, §13)

## Global Constraints

- **Generic sign-in failure:** every wrong username or password gives exactly `Incorrect username or password.`. Inactive accounts get `Account unavailable. Contact the school.`, and only after the right password (§5.1).
- **Parent code requests:** always reply `If this number is registered, a code has been sent.` (§5.2). Codes are 6 digits, stored hashed, valid 10 minutes, allow 5 attempts and work once.
- **Second factor:** required for Administrator, Head Teacher, Accountant and Proprietor. TOTP is primary, SMS is the fallback, and there are 10 one-time backup codes (§5.3).
- **Passwords:** Argon2 in production, Django validators, minimum 8 characters, no complexity rules (§5.4).
- **SMS codes:** at most 3 per hour per number and 10 per hour per IP address (§5.5).
- **Session timeouts:**
  - Staff with second factor: 30 min idle, 12 h maximum.
  - Other staff and students: 2 h idle, 12 h maximum.
  - Parents: 2 h idle, or 30 days if "Keep me signed in" is ticked; 30 days maximum.
  - Changing a password or second factor signs out all other sessions (§5.6).
- **Audited events:** sign-ins, failures, lockouts, password resets, second-factor setup and reset, activation, user creation (§5.7, §11.3).
- **API errors:** always `{code, message, fields}` (§10).
- **Hosting:** no system-wide installs, so PostgreSQL comes from `embedded-postgres` in `tools/postgres`.
- **NUM_PROXIES:** stays 1. Client IPs come from `apps.audit.services.client_ip`, which follows the same rule.
- **Copy:** UK English and plain language. Phone numbers are shown locally (`024 123 4567`).

## Review Focus

1. **Session cookies through the Next.js proxy:** `Set-Cookie` and the `Origin` check must survive the `/api` rewrite (Host becomes 127.0.0.1:8000). CSRF_TRUSTED_ORIGINS must list the site origin, or every sign-in is refused. The Task 10 browser test pins this.
2. **Enumeration through side channels:** request-code and set-password must answer identically for unknown numbers. That includes password-validation errors, so the passwords are validated before the account is looked up. Task 7 tests pin this.
3. **TOTP replay:** a code accepted once must be refused for the rest of its window. Task 6 pins this.
4. **Lockout window with the database cache:** `cache.incr` resets the expiry on DatabaseCache, so counters store their own deadline. Task 4 pins this with a clock override.
5. **Revoked sessions:** a session signed out from another device must stop working on its next request, not at its next timeout. Task 5 pins this.

---

### Task 0: Development PostgreSQL

**Files:**
- Create: `tools/postgres/package.json`, `tools/postgres/start.mjs`
- Modify: `backend/requirements.txt`, `backend/.env.example`, `scripts/check.sh`, `.gitignore`, `README.md`
- Local only (not committed): `backend/.env` gets `DATABASE_URL`
- Test: `backend/tests/test_database.py`

**Interfaces:**
- Produces: PostgreSQL on `127.0.0.1:5433`, database `adss`, role `adss` / `adss-dev-only` with CREATEDB. `DATABASE_URL=postgres://adss:adss-dev-only@127.0.0.1:5433/adss`. Browser tests keep SQLite.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_database.py`:
```python
from django.db import connection


def test_tests_run_on_postgresql():
    # Spec §13: from Plan 2 on, development and tests use PostgreSQL.
    assert connection.vendor == "postgresql"
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_database.py`
Expected: FAIL, `assert 'sqlite' == 'postgresql'`

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

Run: `cd tools/postgres && npm install`, then start it in the background: `node start.mjs > server.log 2>&1 &`. Wait until `server.log` contains `PostgreSQL ready`.

- [ ] **Step 4: Add the driver and point Django at PostgreSQL**

In `backend/requirements.txt`, add the line `psycopg[binary]==3.3.6`, then run `.venv/Scripts/python -m pip install -r requirements-dev.txt`.

In `backend/.env.example`, replace the two DATABASE_URL comment lines with:
```
# Development PostgreSQL from tools/postgres (cd tools/postgres && npm install && npm start).
# Production: the real server's URL. Unset falls back to SQLite (used only by the browser tests).
DATABASE_URL=postgres://adss:adss-dev-only@127.0.0.1:5433/adss
```
Add the same `DATABASE_URL=` line to the local `backend/.env`. It is not committed.

- [ ] **Step 5: Run the tests on PostgreSQL**

Run: `cd backend && .venv/Scripts/python -m pytest`
Expected: all tests pass, including `test_tests_run_on_postgresql`.

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

### Task 1: Accounts: user model, roles and the create_user command

**Files:**
- Create: `backend/apps/accounts/__init__.py`, `apps.py`, `models.py`, `roles.py`, `identifiers.py`, `admin.py`, `management/__init__.py`, `management/commands/__init__.py`, `management/commands/create_user.py`, `migrations/__init__.py`, `migrations/0001_initial.py` (generated), `migrations/0002_role_groups.py`
- Modify: `backend/config/settings.py`, `backend/requirements.txt`, `backend/tests/helpers.py`
- Test: `backend/tests/accounts/__init__.py`, `backend/tests/accounts/conftest.py`, `backend/tests/accounts/test_users.py`

**Interfaces:**
- Produces:
  - `apps.accounts.models.User` with `Kind.STAFF|PARENT|STUDENT`. Fields: `username` (unique), `kind`, `display_name`, `phone`, `email`, `is_active`, `is_staff`, `must_change_password`, `activated_at`, `date_joined`. `User.objects.create_user(username, *, kind, password=None, **fields)`. A password of `None` makes it unusable, meaning the account is awaiting activation.
  - `apps.accounts.roles`: the 13 role constants, `ALL_ROLES`, `SECOND_FACTOR_ROLES`, `roles_of(user) -> list[str]`, `has_role(user, *names) -> bool`, `needs_second_factor(user) -> bool`.
  - `apps.accounts.identifiers.normalise_identifier(kind, raw) -> str`, which raises `ValueError`.
  - `manage.py create_user --kind --username [--name] [--role ...] [--password] [--phone]`.
  - Test fixture `make_user(username="k.mensah", *, kind="staff", role=None, password=PASSWORD, **fields)`, plus `tests.helpers.PASSWORD` and `tests.helpers.sign_in(api, identifier, password=PASSWORD, kind="staff", **extra)`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/accounts/__init__.py`:
```python

```

`backend/tests/accounts/conftest.py`:
```python
import pytest
from django.contrib.auth.models import Group

from apps.accounts.models import User
from tests.helpers import PASSWORD


@pytest.fixture
def make_user(db):
    def make(username="k.mensah", *, kind="staff", role=None, password=PASSWORD, **fields):
        user = User.objects.create_user(username, kind=kind, password=password, **fields)
        if role:
            user.groups.add(Group.objects.get(name=role))
        return user

    return make
```

In `backend/tests/helpers.py`, append:
```python

PASSWORD = "correct horse battery"


def sign_in(api, identifier, password=PASSWORD, kind="staff", **extra):
    payload = {"kind": kind, "identifier": identifier, "password": password, **extra}
    return api.post("/api/auth/login", payload, format="json")
```

`backend/tests/accounts/test_users.py`:
```python
import pytest
from django.conf import settings
from django.contrib.auth.models import Group
from django.core.management import CommandError, call_command

from apps.accounts import roles
from apps.accounts.identifiers import normalise_identifier
from apps.accounts.models import User

pytestmark = pytest.mark.django_db


def test_every_role_exists_as_a_group():
    assert len(roles.ALL_ROLES) == 13
    assert set(roles.ALL_ROLES) <= set(Group.objects.values_list("name", flat=True))


def test_second_factor_roles():
    assert roles.SECOND_FACTOR_ROLES == {"Administrator", "Head Teacher", "Accountant", "Proprietor"}


def test_needs_second_factor_follows_roles(make_user):
    user = make_user()
    assert not roles.needs_second_factor(user)
    user.groups.add(Group.objects.get(name=roles.HEAD_TEACHER))
    assert roles.needs_second_factor(user)
    assert roles.roles_of(user) == ["Head Teacher"]


def test_production_hashes_passwords_with_argon2():
    import config.settings as base

    assert base.PASSWORD_HASHERS[0] == "django.contrib.auth.hashers.Argon2PasswordHasher"
    assert settings.AUTH_USER_MODEL == "accounts.User"


@pytest.mark.parametrize(
    ("kind", "raw", "expected"),
    [
        ("staff", "  K.Mensah ", "k.mensah"),
        ("parent", "024 123 4567", "+233241234567"),
        ("parent", "+233 24 123 4567", "+233241234567"),
        ("student", "26-0147-3", "2601473"),
        ("student", " 26 0147 3 ", "2601473"),
    ],
)
def test_normalise_identifier(kind, raw, expected):
    assert normalise_identifier(kind, raw) == expected


@pytest.mark.parametrize(
    ("kind", "raw"),
    [
        ("staff", "1234"),
        ("staff", "+233241234567"),
        ("staff", "ab"),
        ("parent", "12345"),
        ("student", "26-0147"),
        ("student", "abc1234"),
        ("other", "someone"),
    ],
)
def test_normalise_identifier_rejects(kind, raw):
    with pytest.raises(ValueError):
        normalise_identifier(kind, raw)


def test_create_user_command_makes_an_administrator():
    call_command(
        "create_user",
        kind="staff",
        username="Admin",
        name="School Admin",
        role=["Administrator"],
        password="correct horse battery",
    )
    user = User.objects.get(username="admin")
    assert user.kind == "staff" and user.display_name == "School Admin"
    assert user.check_password("correct horse battery")
    assert roles.roles_of(user) == ["Administrator"]


def test_create_user_command_leaves_a_parent_awaiting_activation():
    call_command("create_user", kind="parent", username="024 123 4567", name="Ama Mensah")
    user = User.objects.get(username="+233241234567")
    assert user.phone == "+233241234567" and roles.roles_of(user) == ["Parent"]
    assert user.is_active and user.activated_at is None and not user.has_usable_password()


def test_create_user_command_makes_students_change_their_first_password():
    call_command("create_user", kind="student", username="26-0147-3", password="first password 1")
    user = User.objects.get(username="2601473")
    assert user.must_change_password and roles.roles_of(user) == ["Student"]


def test_create_user_command_refuses_duplicates_and_weak_passwords():
    call_command("create_user", kind="staff", username="admin", password="correct horse battery")
    with pytest.raises(CommandError, match="already exists"):
        call_command("create_user", kind="staff", username="ADMIN", password="correct horse battery")
    with pytest.raises(CommandError, match="too common"):
        call_command("create_user", kind="staff", username="teacher", password="password")
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/accounts -q`
Expected: ERROR during collection, `ModuleNotFoundError: No module named 'apps.accounts'`

- [ ] **Step 3: Write the accounts app**

`backend/apps/accounts/__init__.py`:
```python

```

`backend/apps/accounts/migrations/__init__.py`:
```python

```

`backend/apps/accounts/apps.py`:
```python
from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "apps.accounts"
    label = "accounts"
    default_auto_field = "django.db.models.BigAutoField"
```

`backend/apps/accounts/roles.py`:
```python
"""The 13 role groups (spec §4.1) and who needs a second factor (§5.3)."""

ADMINISTRATOR = "Administrator"
PROPRIETOR = "Proprietor"
HEAD_TEACHER = "Head Teacher"
ACCOUNTANT = "Accountant"
TEACHER = "Teacher"
CAREGIVER = "Early Years Caregiver"
FRONT_DESK = "Front Desk Officer"
NURSE = "School Nurse"
BOOKSHOP = "Bookshop Keeper"
CANTEEN = "Canteen Officer"
TRANSPORT = "Transport Officer"
PARENT = "Parent"
STUDENT = "Student"

ALL_ROLES = (
    ADMINISTRATOR,
    PROPRIETOR,
    HEAD_TEACHER,
    ACCOUNTANT,
    TEACHER,
    CAREGIVER,
    FRONT_DESK,
    NURSE,
    BOOKSHOP,
    CANTEEN,
    TRANSPORT,
    PARENT,
    STUDENT,
)
SECOND_FACTOR_ROLES = frozenset({ADMINISTRATOR, HEAD_TEACHER, ACCOUNTANT, PROPRIETOR})


def roles_of(user) -> list[str]:
    return sorted(user.groups.values_list("name", flat=True))


def has_role(user, *names: str) -> bool:
    return bool(user.is_authenticated) and user.groups.filter(name__in=names).exists()


def needs_second_factor(user) -> bool:
    return has_role(user, *SECOND_FACTOR_ROLES)
```

`backend/apps/accounts/identifiers.py`:
```python
"""Sign-in identifiers by account kind (spec §5.1): staff username, parent phone, student ID."""

import re

from apps.core.phones import normalise_gh_phone

STAFF_USERNAME = re.compile(r"^[a-z][a-z0-9._-]{2,149}$")
STUDENT_ID = re.compile(r"^\d{7}$")


def normalise_identifier(kind: str, raw: str) -> str:
    value = (raw or "").strip()
    if kind == "staff":
        value = value.lower()
        if not STAFF_USERNAME.match(value):
            raise ValueError(
                "Usernames start with a letter and use letters, numbers, dots, dashes or "
                "underscores."
            )
        return value
    if kind == "parent":
        return normalise_gh_phone(value)
    if kind == "student":
        value = re.sub(r"[\s-]", "", value)
        if not STUDENT_ID.match(value):
            raise ValueError("Enter the 7-digit Student ID, e.g. 26-0147-3.")
        return value
    raise ValueError("Unknown account type.")
```

`backend/apps/accounts/models.py`:
```python
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, username, *, kind, password=None, **fields):
        user = self.model(username=username, kind=kind, **fields)
        user.set_password(password)  # None gives an unusable password: awaiting activation
        user.save(using=self._db)
        return user

    def create_superuser(self, username, password=None, **fields):
        fields.update(is_staff=True, is_superuser=True)
        return self.create_user(username, kind=User.Kind.STAFF, password=password, **fields)


class User(AbstractBaseUser, PermissionsMixin):
    """One account per person. Roles are Django groups (apps.accounts.roles)."""

    class Kind(models.TextChoices):
        STAFF = "staff", "Staff"
        PARENT = "parent", "Parent"
        STUDENT = "student", "Student"

    # Staff username, parent phone (E.164) or student ID digits: see identifiers.py.
    username = models.CharField(max_length=150, unique=True)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    display_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=16, blank=True)
    email = models.EmailField(blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(
        default=False, help_text="Django admin access (development only)."
    )
    must_change_password = models.BooleanField(default=False)
    activated_at = models.DateTimeField(null=True, blank=True)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "username"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    def __str__(self):
        return self.display_name or self.username
```

`backend/apps/accounts/admin.py`:
```python
from django.contrib import admin

from apps.accounts.models import User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ["username", "display_name", "kind", "is_active", "activated_at"]
    list_filter = ["kind", "is_active", "groups"]
    search_fields = ["username", "display_name", "phone"]
    exclude = ["password"]
```

`backend/apps/accounts/management/__init__.py`:
```python

```

`backend/apps/accounts/management/commands/__init__.py`:
```python

```

`backend/apps/accounts/management/commands/create_user.py`:
```python
from getpass import getpass

from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts import roles
from apps.accounts.identifiers import normalise_identifier
from apps.accounts.models import User
from apps.core.phones import normalise_gh_phone

DEFAULT_ROLE = {User.Kind.PARENT: roles.PARENT, User.Kind.STUDENT: roles.STUDENT}


class Command(BaseCommand):
    help = (
        "Create a user account, e.g. the first Administrator. Parents are left awaiting "
        "activation by SMS code unless a password is given."
    )

    def add_arguments(self, parser):
        parser.add_argument("--kind", required=True, choices=[kind.value for kind in User.Kind])
        parser.add_argument(
            "--username", required=True, help="Staff username, parent phone or Student ID"
        )
        parser.add_argument("--name", default="", help="Name shown on screens")
        parser.add_argument("--role", action="append", default=[], choices=roles.ALL_ROLES)
        parser.add_argument("--password", default=None, help="Omit to be asked for it")
        parser.add_argument("--phone", default="", help="Staff mobile for SMS codes")

    @transaction.atomic
    def handle(self, *args, kind, username, name, role, password, phone, **options):
        try:
            identifier = normalise_identifier(kind, username)
            phone = normalise_gh_phone(phone) if phone else ""
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        if kind == User.Kind.PARENT:
            phone = identifier
        if User.objects.filter(username=identifier).exists():
            raise CommandError(f"A user called {identifier} already exists.")

        user = User(username=identifier, kind=kind, display_name=name, phone=phone)
        user.must_change_password = kind == User.Kind.STUDENT
        if password is None and kind != User.Kind.PARENT:
            password = getpass("Password: ")
            if getpass("Password again: ") != password:
                raise CommandError("The passwords did not match.")
        if password is not None:
            try:
                validate_password(password, user)
            except ValidationError as exc:
                raise CommandError(" ".join(exc.messages)) from exc
        user.set_password(password)
        user.save()

        names = set(role) | ({DEFAULT_ROLE[kind]} if kind in DEFAULT_ROLE else set())
        user.groups.set(Group.objects.filter(name__in=names))
        self.stdout.write(self.style.SUCCESS(f"Created {kind} {identifier}."))
```

`backend/apps/accounts/migrations/0002_role_groups.py`:
```python
from django.db import migrations

# Copied from apps.accounts.roles: migrations must not change when that module does.
ROLES = (
    "Administrator",
    "Proprietor",
    "Head Teacher",
    "Accountant",
    "Teacher",
    "Early Years Caregiver",
    "Front Desk Officer",
    "School Nurse",
    "Bookshop Keeper",
    "Canteen Officer",
    "Transport Officer",
    "Parent",
    "Student",
)


def create_groups(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    for name in ROLES:
        Group.objects.get_or_create(name=name)


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]

    operations = [migrations.RunPython(create_groups, migrations.RunPython.noop)]
```

In `backend/config/settings.py`:
- Add `"apps.accounts",` to INSTALLED_APPS after `"rest_framework",`.
- After `DEFAULT_AUTO_FIELD`, add:
```python
AUTH_USER_MODEL = "accounts.User"

# Spec §5.4: Argon2; PBKDF2 stays listed so any older hashes still verify.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]
```

In `backend/requirements.txt`, add `argon2-cffi==25.1.0` and run `pip install -r requirements-dev.txt`.

Generate the first migration: `.venv/Scripts/python manage.py makemigrations accounts --name initial` (it must be named `0001_initial`). The data migration `0002_role_groups.py` above depends on it. Write `0002` after generating `0001`, or makemigrations will number around it.

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/accounts -q`
Expected: all pass.

- [ ] **Step 5: Rebuild the development database and run everything**

The user model changed, so the old development database cannot be migrated. The PostgreSQL database `adss` is new and has nothing to lose. Run:
`.venv/Scripts/python manage.py migrate && .venv/Scripts/python manage.py createcachetable && .venv/Scripts/python manage.py seed_website`

Then run `.venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff check . && .venv/Scripts/python -m ruff format --check .`
Expected: all pass, and ruff is clean.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/accounts backend/config/settings.py backend/requirements.txt backend/tests/accounts backend/tests/helpers.py
git commit -m "Add accounts: user model, the 13 role groups and the create_user command"
```

---

### Task 2: Audit: append-only log

**Files:**
- Create: `backend/apps/audit/__init__.py`, `apps.py`, `models.py`, `services.py`, `migrations/__init__.py`, `migrations/0001_initial.py` (generated), `migrations/0002_append_only_trigger.py`
- Modify: `backend/config/settings.py` (INSTALLED_APPS), `backend/apps/accounts/management/commands/create_user.py`
- Test: `backend/tests/audit/__init__.py`, `backend/tests/audit/test_audit.py`

**Interfaces:**
- Consumes: `apps.accounts.models.User`.
- Produces:
  - `apps.audit.models.AuditLog`, with `AuditLog.Action` constants.
  - `apps.audit.models.AppendOnlyError`.
  - `apps.audit.services.record(action, *, actor=None, entity=None, entity_type="", entity_id="", old=None, new=None, reason="", request=None) -> AuditLog`.
  - `apps.audit.services.client_ip(request) -> str | None`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/audit/__init__.py`:
```python

```

`backend/tests/audit/test_audit.py`:
```python
import pytest
from django.contrib.auth.models import AnonymousUser
from django.core.management import call_command
from django.db import DatabaseError, connection, transaction
from django.test import RequestFactory

from apps.accounts.models import User
from apps.audit.models import AppendOnlyError, AuditLog
from apps.audit.services import client_ip, record

pytestmark = pytest.mark.django_db


@pytest.fixture
def actor():
    return User.objects.create_user("ama.admin", kind="staff", display_name="Ama Admin")


def test_record_stores_actor_entity_values_and_address(actor):
    request = RequestFactory().post("/", REMOTE_ADDR="10.0.0.1", HTTP_X_FORWARDED_FOR="41.66.1.2")
    request.user = actor
    entry = record(AuditLog.Action.USER_CREATED, entity=actor, new={"kind": "staff"}, request=request)
    entry.refresh_from_db()
    assert entry.actor_id == actor.pk and entry.actor_name == "Ama Admin"
    assert entry.entity_type == "accounts.user" and entry.entity_id == str(actor.pk)
    assert entry.new_value == {"kind": "staff"} and entry.ip_address == "41.66.1.2"


def test_anonymous_requests_have_no_actor_and_junk_addresses_are_dropped():
    request = RequestFactory().post("/", HTTP_X_FORWARDED_FOR="unknown")
    request.user = AnonymousUser()
    entry = record(AuditLog.Action.SIGN_IN_FAILED, request=request)
    assert entry.actor is None and entry.actor_name == "" and entry.ip_address is None


def test_client_ip_trusts_only_the_proxy_added_address():
    request = RequestFactory().get(
        "/", REMOTE_ADDR="127.0.0.1", HTTP_X_FORWARDED_FOR="6.6.6.6, 41.66.1.2"
    )
    assert client_ip(request) == "41.66.1.2"


def test_entries_cannot_be_changed_or_deleted():
    entry = record(AuditLog.Action.SIGN_IN_FAILED, new={"identifier": "someone"})
    entry.reason = "edited"
    with pytest.raises(AppendOnlyError):
        entry.save()
    with pytest.raises(AppendOnlyError):
        entry.delete()
    with pytest.raises(AppendOnlyError):
        AuditLog.objects.filter(pk=entry.pk).update(reason="edited")
    with pytest.raises(AppendOnlyError):
        AuditLog.objects.filter(pk=entry.pk).delete()


def test_the_database_refuses_changes_too():
    assert connection.vendor == "postgresql"
    entry = record(AuditLog.Action.SIGN_IN_FAILED)
    with pytest.raises(DatabaseError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("UPDATE audit_auditlog SET reason = 'x' WHERE id = %s", [entry.pk])
    with pytest.raises(DatabaseError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("DELETE FROM audit_auditlog WHERE id = %s", [entry.pk])


def test_entries_outlive_the_actor(actor):
    entry = record(AuditLog.Action.SIGN_IN, actor=actor)
    actor.delete()
    entry.refresh_from_db()
    assert entry.actor_name == "Ama Admin"


def test_create_user_command_is_audited():
    call_command("create_user", kind="parent", username="024 123 4567")
    user = User.objects.get()
    entry = AuditLog.objects.get(action=AuditLog.Action.USER_CREATED)
    assert entry.entity_id == str(user.pk)
    assert entry.new_value == {"kind": "parent", "roles": ["Parent"]}
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/audit -q`
Expected: ERROR, `ModuleNotFoundError: No module named 'apps.audit'`

- [ ] **Step 3: Write the audit app**

`backend/apps/audit/__init__.py`:
```python

```

`backend/apps/audit/migrations/__init__.py`:
```python

```

`backend/apps/audit/apps.py`:
```python
from django.apps import AppConfig


class AuditConfig(AppConfig):
    name = "apps.audit"
    label = "audit"
    default_auto_field = "django.db.models.BigAutoField"
```

`backend/apps/audit/models.py`:
```python
"""Append-only audit trail (spec §3.8, §11.3). Write entries with services.record()."""

from django.conf import settings
from django.db import models


class AppendOnlyError(Exception):
    """Raised on any attempt to change or remove an audit entry."""


class AuditLogQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise AppendOnlyError("Audit entries cannot be changed.")

    def delete(self):
        raise AppendOnlyError("Audit entries cannot be deleted.")


class AuditLog(models.Model):
    class Action(models.TextChoices):
        SIGN_IN = "SIGN_IN", "Signed in"
        SIGN_IN_FAILED = "SIGN_IN_FAILED", "Sign-in failed"
        LOCKED_OUT = "LOCKED_OUT", "Locked out"
        SIGN_OUT = "SIGN_OUT", "Signed out"
        SESSION_REVOKED = "SESSION_REVOKED", "Signed out another session"
        PASSWORD_CHANGED = "PASSWORD_CHANGED", "Password changed"
        PASSWORD_RESET = "PASSWORD_RESET", "Password reset"
        ACCOUNT_ACTIVATED = "ACCOUNT_ACTIVATED", "Account activated"
        ACCOUNT_DEACTIVATED = "ACCOUNT_DEACTIVATED", "Account deactivated"
        ACCOUNT_REACTIVATED = "ACCOUNT_REACTIVATED", "Account reactivated"
        SECOND_FACTOR_SET_UP = "SECOND_FACTOR_SET_UP", "Second factor set up"
        SECOND_FACTOR_RESET = "SECOND_FACTOR_RESET", "Second factor reset"
        BACKUP_CODE_USED = "BACKUP_CODE_USED", "Backup code used"
        USER_CREATED = "USER_CREATED", "User created"
        ROLES_CHANGED = "ROLES_CHANGED", "Roles changed"
        CREATED = "CREATED", "Created"
        UPDATED = "UPDATED", "Updated"
        STATUS_CHANGED = "STATUS_CHANGED", "Status changed"
        WEBSITE_LIVE = "WEBSITE_LIVE", "Website went live"
        VIEWED_RESTRICTED = "VIEWED_RESTRICTED", "Viewed a restricted record"

    # No database constraint: entries must survive the deletion of demo users (Plan 3).
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        db_constraint=False,
        related_name="+",
    )
    actor_name = models.CharField(max_length=150, blank=True)
    action = models.CharField(max_length=40, db_index=True)
    entity_type = models.CharField(max_length=60, blank=True)
    entity_id = models.CharField(max_length=64, blank=True)
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    reason = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    objects = AuditLogQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["entity_type", "entity_id"])]

    def __str__(self):
        return f"{self.action} {self.entity_type}:{self.entity_id}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise AppendOnlyError("Audit entries cannot be changed.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise AppendOnlyError("Audit entries cannot be deleted.")
```

`backend/apps/audit/services.py`:
```python
"""The only way to write audit entries (spec §3.8)."""

import ipaddress

from rest_framework.throttling import BaseThrottle

from apps.audit.models import AuditLog


def client_ip(request) -> str | None:
    """The visitor's address, trusting X-Forwarded-For only as far as NUM_PROXIES allows."""
    value = BaseThrottle().get_ident(request)
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        return None


def record(
    action: str,
    *,
    actor=None,
    entity=None,
    entity_type: str = "",
    entity_id="",
    old=None,
    new=None,
    reason: str = "",
    request=None,
) -> AuditLog:
    if actor is None and request is not None:
        user = getattr(request, "user", None)
        actor = user if user is not None and user.is_authenticated else None
    if entity is not None:
        entity_type, entity_id = entity._meta.label_lower, entity.pk
    return AuditLog.objects.create(
        actor=actor,
        actor_name=str(actor) if actor else "",
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        old_value=old,
        new_value=new,
        reason=reason,
        ip_address=client_ip(request) if request is not None else None,
    )
```

`backend/apps/audit/migrations/0002_append_only_trigger.py`:
```python
from django.db import migrations

CREATE = """
CREATE OR REPLACE FUNCTION audit_auditlog_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_auditlog is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_auditlog_no_change BEFORE UPDATE OR DELETE ON audit_auditlog
FOR EACH ROW EXECUTE FUNCTION audit_auditlog_append_only();
"""

DROP = """
DROP TRIGGER IF EXISTS audit_auditlog_no_change ON audit_auditlog;
DROP FUNCTION IF EXISTS audit_auditlog_append_only();
"""


def forwards(apps, schema_editor):
    # PostgreSQL only; production also denies UPDATE/DELETE to the app's role (Plan 5).
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(CREATE)


def backwards(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(DROP)


class Migration(migrations.Migration):
    dependencies = [("audit", "0001_initial")]

    operations = [migrations.RunPython(forwards, backwards)]
```

In `backend/config/settings.py`, add `"apps.audit",` to INSTALLED_APPS after `"apps.accounts",`. Then run `.venv/Scripts/python manage.py makemigrations audit --name initial` before writing `0002`.

In `backend/apps/accounts/management/commands/create_user.py`, add the imports `from apps.audit.models import AuditLog` and `from apps.audit.services import record`. After `user.groups.set(...)`, add:
```python
        record(
            AuditLog.Action.USER_CREATED,
            entity=user,
            new={"kind": kind, "roles": sorted(names)},
            reason="Created with manage.py create_user",
        )
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/audit tests/accounts -q`
Expected: all pass.

- [ ] **Step 5: Migrate the development database and commit**

Run: `.venv/Scripts/python manage.py migrate && .venv/Scripts/python -m ruff check . && .venv/Scripts/python -m ruff format --check .`

```bash
git add backend/apps/audit backend/apps/accounts backend/config/settings.py backend/tests/audit
git commit -m "Add the append-only audit log with a PostgreSQL guard"
```

---

### Task 3: Notifications: SMS gateway and delivery log

**Files:**
- Create: `backend/apps/notifications/__init__.py`, `apps.py`, `models.py`, `backends.py`, `sms.py`, `admin.py`, `migrations/__init__.py`, `migrations/0001_initial.py` (generated)
- Modify: `backend/config/settings.py`, `backend/config/settings_test.py`, `backend/.env.example`, `backend/tests/conftest.py`
- Test: `backend/tests/notifications/__init__.py`, `backend/tests/notifications/test_sms.py`

**Interfaces:**
- Produces:
  - `apps.notifications.sms.send_sms(to, body, *, purpose, redacted_body=None) -> SmsMessage`.
  - `apps.notifications.sms.Purpose.SIGN_IN_CODE == "sign_in_code"`.
  - `SmsMessage.Status.SENT|FAILED|REFUSED`.
  - `apps.notifications.backends.ConsoleBackend`, which logs and, when `SMS_FILE_PATH` is set, appends `{"to", "body", "at"}` JSON lines.
  - `apps.notifications.backends.MemoryBackend.outbox` (list of `{"to", "body"}`, cleared before every test).
  - Settings `SMS_BACKEND` and `SMS_FILE_PATH`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/notifications/__init__.py`:
```python

```

`backend/tests/notifications/test_sms.py`:
```python
import json

import pytest

from apps.notifications import sms
from apps.notifications.backends import ConsoleBackend, MemoryBackend
from apps.notifications.models import SmsMessage

pytestmark = pytest.mark.django_db
TO = "+233241234567"


class BrokenBackend:
    def send(self, to, body):
        raise RuntimeError("gateway down")


def test_send_logs_the_redacted_body_and_delivers_the_real_one():
    message = sms.send_sms(
        TO,
        "Your code is 123456",
        purpose=sms.Purpose.SIGN_IN_CODE,
        redacted_body="Your code is ******",
    )
    assert message.status == SmsMessage.Status.SENT
    assert SmsMessage.objects.get().body == "Your code is ******"
    assert MemoryBackend.outbox == [{"to": TO, "body": "Your code is 123456"}]


def test_sign_in_codes_are_limited_to_three_an_hour_per_number():
    for _ in range(3):
        assert sms.send_sms(TO, "code", purpose=sms.Purpose.SIGN_IN_CODE).status == "SENT"
    refused = sms.send_sms(TO, "code", purpose=sms.Purpose.SIGN_IN_CODE)
    assert refused.status == SmsMessage.Status.REFUSED and refused.error == "rate_limited"
    assert len(MemoryBackend.outbox) == 3
    assert sms.send_sms("+233201234567", "code", purpose=sms.Purpose.SIGN_IN_CODE).status == "SENT"


def test_backend_failures_are_logged_not_raised(settings):
    settings.SMS_BACKEND = "tests.notifications.test_sms.BrokenBackend"
    message = sms.send_sms(TO, "hello", purpose=sms.Purpose.SIGN_IN_CODE)
    assert message.status == SmsMessage.Status.FAILED and "gateway down" in message.error


def test_console_backend_appends_to_the_outbox_file(tmp_path, settings):
    settings.SMS_FILE_PATH = str(tmp_path / "sms.jsonl")
    ConsoleBackend().send(TO, "Your code is 123456")
    line = json.loads((tmp_path / "sms.jsonl").read_text(encoding="utf-8").splitlines()[-1])
    assert line["to"] == TO and line["body"] == "Your code is 123456"
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/notifications -q`
Expected: ERROR, `ModuleNotFoundError: No module named 'apps.notifications'`

- [ ] **Step 3: Write the notifications app**

`backend/apps/notifications/__init__.py`:
```python

```

`backend/apps/notifications/migrations/__init__.py`:
```python

```

`backend/apps/notifications/apps.py`:
```python
from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    name = "apps.notifications"
    label = "notifications"
    default_auto_field = "django.db.models.BigAutoField"
```

`backend/apps/notifications/models.py`:
```python
from django.db import models


class SmsMessage(models.Model):
    """Every SMS the system tried to send (spec §3.7)."""

    class Status(models.TextChoices):
        SENT = "SENT", "Sent"
        FAILED = "FAILED", "Failed"
        REFUSED = "REFUSED", "Refused"

    to = models.CharField(max_length=16, db_index=True)
    purpose = models.CharField(max_length=40)
    body = models.TextField(help_text="Sign-in codes are stored redacted.")
    status = models.CharField(max_length=10, choices=Status.choices)
    provider_reference = models.CharField(max_length=100, blank=True)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.to} {self.purpose} {self.status}"
```

`backend/apps/notifications/backends.py`:
```python
"""SMS backends. A provider backend is added before launch (spec §3.7)."""

import json
import logging

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


class ConsoleBackend:
    """Development: logs each message and appends it to SMS_FILE_PATH when that is set."""

    def send(self, to: str, body: str) -> str:
        logger.info("SMS to %s: %s", to, body)
        if settings.SMS_FILE_PATH:
            line = json.dumps({"to": to, "body": body, "at": timezone.now().isoformat()})
            with open(settings.SMS_FILE_PATH, "a", encoding="utf-8") as outbox:
                outbox.write(line + "\n")
        return ""


class MemoryBackend:
    """Tests: keeps messages in MemoryBackend.outbox (emptied before every test)."""

    outbox: list[dict] = []

    def send(self, to: str, body: str) -> str:
        self.outbox.append({"to": to, "body": body})
        return ""
```

`backend/apps/notifications/sms.py`:
```python
"""Sending SMS (spec §3.7): guards first, then the configured backend, always a log row."""

from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from django.utils.module_loading import import_string

from apps.notifications.models import SmsMessage


class Purpose:
    SIGN_IN_CODE = "sign_in_code"


# Per-number limits by purpose (spec §5.5): (messages, window).
LIMITS = {Purpose.SIGN_IN_CODE: (3, timedelta(hours=1))}


def send_sms(to: str, body: str, *, purpose: str, redacted_body: str | None = None) -> SmsMessage:
    message = SmsMessage(to=to, purpose=purpose, body=redacted_body or body)
    limit = LIMITS.get(purpose)
    if limit and _sent_recently(to, purpose, limit[1]) >= limit[0]:
        message.status, message.error = SmsMessage.Status.REFUSED, "rate_limited"
    else:
        try:
            message.provider_reference = import_string(settings.SMS_BACKEND)().send(to, body)
            message.status = SmsMessage.Status.SENT
        except Exception as exc:  # a gateway error is logged for staff, never shown raw
            message.status, message.error = SmsMessage.Status.FAILED, str(exc)[:500]
    message.save()
    return message


def _sent_recently(to: str, purpose: str, window: timedelta) -> int:
    since = timezone.now() - window
    return SmsMessage.objects.filter(
        to=to, purpose=purpose, status=SmsMessage.Status.SENT, created_at__gte=since
    ).count()
```

`backend/apps/notifications/admin.py`:
```python
from django.contrib import admin

from apps.notifications.models import SmsMessage


@admin.register(SmsMessage)
class SmsMessageAdmin(admin.ModelAdmin):
    list_display = ["created_at", "to", "purpose", "status", "error"]
    list_filter = ["status", "purpose"]
```

In `backend/config/settings.py`:
- Add `"apps.notifications",` to INSTALLED_APPS after `"apps.audit",`.
- After `DEFAULT_FROM_EMAIL`, add:
```python
# SMS (spec §3.7). Development logs codes to the console (and SMS_FILE_PATH, if set).
SMS_BACKEND = env("SMS_BACKEND", default="apps.notifications.backends.ConsoleBackend")
SMS_FILE_PATH = env("SMS_FILE_PATH", default="")
```

In `backend/config/settings_test.py`, append `SMS_BACKEND = "apps.notifications.backends.MemoryBackend"`.

In `backend/.env.example`, append:
```
# SMS: the console backend prints codes in the Django log. A provider backend comes before launch.
SMS_BACKEND=apps.notifications.backends.ConsoleBackend
```

In `backend/tests/conftest.py`, inside `_isolated_media_and_cache`, before `yield`, add:
```python
    from apps.notifications.backends import MemoryBackend

    MemoryBackend.outbox.clear()
```

Run `.venv/Scripts/python manage.py makemigrations notifications --name initial`.

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/notifications -q`
Expected: 4 passed.

- [ ] **Step 5: Migrate and commit**

Run: `.venv/Scripts/python manage.py migrate && .venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff check . && .venv/Scripts/python -m ruff format --check .`

```bash
git add backend/apps/notifications backend/config backend/.env.example backend/tests/conftest.py backend/tests/notifications
git commit -m "Add the SMS gateway with per-number limits and a delivery log"
```

---

### Task 4: Sign-in API: password step, lockouts, sign-out and "me"

**Files:**
- Modify: `backend/apps/accounts/models.py` (adds UserSession, TotpDevice, BackupCode, SmsCode), `backend/apps/core/views.py`, `backend/config/urls.py`, `backend/config/settings.py`, `backend/.env.example`
- Create: `backend/apps/accounts/signin.py`, `backend/apps/accounts/views.py`, `backend/apps/accounts/urls.py`, `backend/apps/accounts/migrations/0003_security.py` (generated)
- Test: `backend/tests/accounts/test_sign_in.py`

**Interfaces:**
- Consumes: `normalise_identifier`, `roles.needs_second_factor`, `audit.services.record`, `client_ip`, `ApiError`.
- Produces:
  - `POST /api/auth/login` with `{kind, identifier, password, remember}`. Returns `{"status": "signed_in", "user": Me}` or `{"status": "second_factor", "totp_ready": bool, "sms_available": bool}`.
  - `POST /api/auth/logout` returns 204.
  - `GET /api/auth/me` returns `Me` (`{id, kind, username, display_name, roles, must_change_password, has_authenticator}`), or 403 `not_authenticated`. It always sets the `csrftoken` cookie.
  - `signin.py` exports: `check_password_sign_in(request, kind, identifier, password) -> User`, `start_second_factor(request, user, *, remember) -> dict`, `pending_user(request) -> User`, `complete_login(request, user, *, remember) -> None`, `me_payload(user) -> dict`, `has_authenticator(user) -> bool`, `PENDING_KEY`, `_now()` (overridable clock).
  - `views.py` exports: `OpenView` (AllowAny plus csrf_protect), `validated(serializer_class, request) -> dict`, `PASSWORD_MAX = 256`.
  - Models: `UserSession`, `TotpDevice`, `BackupCode`, `SmsCode` (`Purpose.SIGN_IN|ACTIVATION`).

- [ ] **Step 1: Write the failing tests**

`backend/tests/accounts/test_sign_in.py`:
```python
import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts import roles, signin
from apps.accounts.models import TotpDevice
from apps.audit.models import AuditLog
from tests.helpers import PASSWORD, sign_in

pytestmark = pytest.mark.django_db
GENERIC = {"code": "invalid_credentials", "message": "Incorrect username or password.", "fields": {}}


def actions():
    return list(AuditLog.objects.order_by("id").values_list("action", flat=True))


def test_staff_sign_in_and_me(api, make_user):
    make_user(role=roles.TEACHER, display_name="Kofi Mensah")
    response = sign_in(api, "K.Mensah")
    assert response.status_code == 200 and response.json()["status"] == "signed_in"
    me = api.get("/api/auth/me").json()
    assert me["username"] == "k.mensah" and me["display_name"] == "Kofi Mensah"
    assert me["roles"] == ["Teacher"] and me["kind"] == "staff"
    assert me["must_change_password"] is False and me["has_authenticator"] is False
    assert actions() == ["SIGN_IN"]


def test_parents_sign_in_with_their_phone_number(api, make_user):
    make_user("+233241234567", kind="parent")
    assert sign_in(api, "024 123 4567", kind="parent").json()["status"] == "signed_in"


def test_wrong_password_and_unknown_user_get_the_same_answer(api, make_user):
    make_user()
    wrong = sign_in(api, "k.mensah", "wrong password!")
    unknown = sign_in(api, "nobody.here")
    assert wrong.status_code == unknown.status_code == 400
    assert wrong.json() == unknown.json() == GENERIC
    assert actions() == ["SIGN_IN_FAILED", "SIGN_IN_FAILED"]


def test_malformed_identifiers_and_the_wrong_tab_get_the_generic_answer(api, make_user):
    make_user("+233241234567", kind="parent")
    assert sign_in(api, "024", kind="parent").json() == GENERIC
    assert sign_in(api, "024 123 4567", kind="staff").json() == GENERIC
    assert sign_in(api, "024 123 4567", kind="student").json() == GENERIC


def test_accounts_awaiting_activation_cannot_sign_in(api, make_user):
    make_user("+233241234567", kind="parent", password=None)
    assert sign_in(api, "024 123 4567", "anything at all", kind="parent").json() == GENERIC


def test_inactive_accounts_are_told_only_after_the_right_password(api, make_user):
    make_user(is_active=False)
    assert sign_in(api, "k.mensah", "wrong password!").json() == GENERIC
    response = sign_in(api, "k.mensah")
    assert response.status_code == 403
    assert response.json()["message"] == "Account unavailable. Contact the school."


def test_five_failures_lock_the_account(api, make_user):
    make_user()
    for _ in range(5):
        sign_in(api, "k.mensah", "wrong password!")
    locked = sign_in(api, "k.mensah")
    assert locked.status_code == 429 and locked.json()["code"] == "locked_out"
    assert actions().count("LOCKED_OUT") == 1


def test_the_lockout_ends_after_fifteen_minutes(api, make_user, monkeypatch):
    make_user()
    start = signin._now()
    for _ in range(5):
        sign_in(api, "k.mensah", "wrong password!")
    monkeypatch.setattr(signin, "_now", lambda: start + 15 * 60 + 1)
    assert sign_in(api, "k.mensah").json()["status"] == "signed_in"


def test_a_success_clears_earlier_failures(api, make_user):
    make_user()
    for _ in range(4):
        sign_in(api, "k.mensah", "wrong password!")
    sign_in(api, "k.mensah")
    api.post("/api/auth/logout")
    for _ in range(4):
        sign_in(api, "k.mensah", "wrong password!")
    assert sign_in(api, "k.mensah").json()["status"] == "signed_in"


def test_thirty_failures_from_one_address_lock_that_address(api, make_user):
    make_user()
    for n in range(30):
        sign_in(api, f"user{n}", "wrong password!")
    assert sign_in(api, "k.mensah").json()["code"] == "locked_out"


def test_second_factor_roles_are_not_signed_in_by_password_alone(api, make_user):
    make_user(role=roles.ADMINISTRATOR, phone="+233241234567")
    response = sign_in(api, "k.mensah")
    assert response.json() == {"status": "second_factor", "totp_ready": False, "sms_available": True}
    assert api.get("/api/auth/me").json()["code"] == "not_authenticated"


def test_second_factor_reports_a_ready_authenticator(api, make_user):
    user = make_user(role=roles.PROPRIETOR)
    TotpDevice.objects.create(user=user, secret="JBSWY3DPEHPK3PXP", confirmed_at=timezone.now())
    assert sign_in(api, "k.mensah").json() == {
        "status": "second_factor",
        "totp_ready": True,
        "sms_available": False,
    }


def test_sign_out(api, make_user):
    make_user()
    sign_in(api, "k.mensah")
    assert api.post("/api/auth/logout").status_code == 204
    assert api.get("/api/auth/me").json()["code"] == "not_authenticated"
    assert actions() == ["SIGN_IN", "SIGN_OUT"]


def test_sign_in_needs_a_csrf_token_and_a_trusted_origin(make_user):
    make_user()
    browser = APIClient(enforce_csrf_checks=True)
    refused = sign_in(browser, "k.mensah")
    assert refused.status_code == 403 and refused.json()["code"] == "csrf_failed"

    browser.get("/api/auth/me")  # hands out the CSRF cookie even when signed out
    token = browser.cookies["csrftoken"].value
    payload = {"kind": "staff", "identifier": "k.mensah", "password": PASSWORD}
    foreign = browser.post(
        "/api/auth/login",
        payload,
        format="json",
        HTTP_X_CSRFTOKEN=token,
        HTTP_ORIGIN="https://evil.example",
    )
    assert foreign.json()["code"] == "csrf_failed"
    ok = browser.post(
        "/api/auth/login",
        payload,
        format="json",
        HTTP_X_CSRFTOKEN=token,
        HTTP_ORIGIN="http://localhost:3000",
    )
    assert ok.json()["status"] == "signed_in"
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/accounts/test_sign_in.py -q`
Expected: ERROR, `ImportError: cannot import name 'signin' from 'apps.accounts'`

- [ ] **Step 3: Add the security models**

`backend/apps/accounts/models.py`:
```python
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, username, *, kind, password=None, **fields):
        user = self.model(username=username, kind=kind, **fields)
        user.set_password(password)  # None gives an unusable password: awaiting activation
        user.save(using=self._db)
        return user

    def create_superuser(self, username, password=None, **fields):
        fields.update(is_staff=True, is_superuser=True)
        return self.create_user(username, kind=User.Kind.STAFF, password=password, **fields)


class User(AbstractBaseUser, PermissionsMixin):
    """One account per person. Roles are Django groups (apps.accounts.roles)."""

    class Kind(models.TextChoices):
        STAFF = "staff", "Staff"
        PARENT = "parent", "Parent"
        STUDENT = "student", "Student"

    # Staff username, parent phone (E.164) or student ID digits: see identifiers.py.
    username = models.CharField(max_length=150, unique=True)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    display_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=16, blank=True)
    email = models.EmailField(blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(
        default=False, help_text="Django admin access (development only)."
    )
    must_change_password = models.BooleanField(default=False)
    activated_at = models.DateTimeField(null=True, blank=True)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "username"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    def __str__(self):
        return self.display_name or self.username


class UserSession(models.Model):
    """One signed-in browser (spec §5.6). Django's own session row holds the session data."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sessions")
    session_key = models.CharField(max_length=40, unique=True)
    user_agent = models.CharField(max_length=300, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField()
    idle_seconds = models.PositiveIntegerField()
    expires_at = models.DateTimeField()

    def __str__(self):
        return f"{self.user} since {self.created_at:%Y-%m-%d %H:%M}"


class TotpDevice(models.Model):
    """The authenticator app used as a second factor (spec §5.3)."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="totp_device")
    # shortcut: stored as-is (as django-otp does); encrypt at rest if the database is ever shared
    secret = models.CharField(max_length=64)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    last_used_step = models.BigIntegerField(null=True, blank=True)

    def __str__(self):
        return f"Authenticator for {self.user}"


class BackupCode(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="backup_codes")
    code_hash = models.CharField(max_length=64)
    used_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Backup code for {self.user}"


class SmsCode(models.Model):
    """A 6-digit code sent by SMS: hashed, 10 minutes, 5 attempts, single use (spec §5.2)."""

    class Purpose(models.TextChoices):
        SIGN_IN = "sign_in", "Second factor"
        ACTIVATION = "activation", "Activation or password reset"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sms_codes")
    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    code_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.get_purpose_display()} code for {self.user}"
```

Run `.venv/Scripts/python manage.py makemigrations accounts --name security`.

- [ ] **Step 4: Write the sign-in service, views and URLs**

`backend/apps/accounts/signin.py`:
```python
"""Password sign-in (spec §5.1, §5.5): one generic failure message and temporary lockouts.

Lockout counters store their own deadline because DatabaseCache.incr() resets the expiry.
"""

import time

from django.contrib.auth import login
from django.core.cache import cache

from apps.accounts import roles
from apps.accounts.identifiers import normalise_identifier
from apps.accounts.models import TotpDevice, User
from apps.audit.models import AuditLog
from apps.audit.services import client_ip, record
from apps.core.exceptions import ApiError

WINDOW_SECONDS = 15 * 60
MAX_FAILURES_PER_ACCOUNT = 5
MAX_FAILURES_PER_ADDRESS = 30
GENERIC_FAILURE = "Incorrect username or password."
LOCKED_MESSAGE = "Too many attempts. Please wait 15 minutes and try again."
UNAVAILABLE = "Account unavailable. Contact the school."

PENDING_KEY = "pending_second_factor"
PENDING_SECONDS = 10 * 60


def _now() -> float:
    return time.time()


def _failures(key: str) -> int:
    count, until = cache.get(key, (0, 0.0))
    return count if until > _now() else 0


def _add_failure(key: str) -> int:
    now = _now()
    count, until = cache.get(key, (0, 0.0))
    if until <= now:
        count, until = 0, now + WINDOW_SECONDS
    cache.set(key, (count + 1, until), timeout=int(until - now) + 1)
    return count + 1


def check_password_sign_in(request, kind: str, raw_identifier: str, password: str) -> User:
    """The user whose password matches, or ApiError. Callers decide what happens next."""
    try:
        identifier = normalise_identifier(kind, raw_identifier)
    except ValueError:
        identifier = (raw_identifier or "").strip().lower()[:150]
    account_key = f"signin:account:{kind}:{identifier}"
    address_key = f"signin:address:{client_ip(request)}"
    if (
        _failures(account_key) >= MAX_FAILURES_PER_ACCOUNT
        or _failures(address_key) >= MAX_FAILURES_PER_ADDRESS
    ):
        raise ApiError("locked_out", LOCKED_MESSAGE, 429)

    user = User.objects.filter(kind=kind, username=identifier).first()
    if user is None or not user.has_usable_password():
        User().set_password(password)  # same hashing time as a real check: timing reveals nothing
        matched = False
    else:
        matched = user.check_password(password)

    if not matched:
        attempt = {"kind": kind, "identifier": identifier}
        record(AuditLog.Action.SIGN_IN_FAILED, entity=user, new=attempt, request=request)
        account_count = _add_failure(account_key)
        address_count = _add_failure(address_key)
        if account_count == MAX_FAILURES_PER_ACCOUNT or address_count == MAX_FAILURES_PER_ADDRESS:
            record(AuditLog.Action.LOCKED_OUT, entity=user, new=attempt, request=request)
        raise ApiError("invalid_credentials", GENERIC_FAILURE, 400)
    if not user.is_active:
        record(
            AuditLog.Action.SIGN_IN_FAILED, entity=user, reason="Account inactive", request=request
        )
        raise ApiError("account_unavailable", UNAVAILABLE, 403)
    cache.delete(account_key)
    return user


def has_authenticator(user: User) -> bool:
    return TotpDevice.objects.filter(user=user, confirmed_at__isnull=False).exists()


def start_second_factor(request, user: User, *, remember: bool) -> dict:
    """Password accepted: hold the user in the session until the second factor (spec §5.3)."""
    request.session.cycle_key()
    request.session[PENDING_KEY] = {
        "user_id": user.pk,
        "remember": remember,
        "started": _now(),
        "failures": 0,
    }
    return {
        "status": "second_factor",
        "totp_ready": has_authenticator(user),
        "sms_available": bool(user.phone),
    }


def pending_user(request) -> User:
    pending = request.session.get(PENDING_KEY)
    user = None
    if pending and _now() - pending["started"] <= PENDING_SECONDS:
        user = User.objects.filter(pk=pending["user_id"], is_active=True).first()
    if user is None:
        raise ApiError(
            "second_factor_expired", "Your sign-in has expired. Please start again.", 400
        )
    return user


def complete_login(request, user: User, *, remember: bool) -> None:
    request.session.pop(PENDING_KEY, None)
    login(request, user)
    record(AuditLog.Action.SIGN_IN, actor=user, entity=user, request=request)


def me_payload(user: User) -> dict:
    return {
        "id": user.pk,
        "kind": user.kind,
        "username": user.username,
        "display_name": str(user),
        "roles": roles.roles_of(user),
        "must_change_password": user.must_change_password,
        "has_authenticator": has_authenticator(user),
    }
```

`backend/apps/accounts/views.py`:
```python
"""Sign-in API (spec §5). Errors use the shared {code, message, fields} shape."""

from django.contrib.auth import logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.roles import needs_second_factor
from apps.accounts.signin import (
    check_password_sign_in,
    complete_login,
    me_payload,
    start_second_factor,
)
from apps.audit.models import AuditLog
from apps.audit.services import record

PASSWORD_MAX = 256


def validated(serializer_class, request) -> dict:
    serializer = serializer_class(data=request.data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


@method_decorator(csrf_protect, name="dispatch")
class OpenView(APIView):
    """Usable before sign-in, but cross-site posts are still refused (login CSRF)."""

    permission_classes = [AllowAny]


class LoginSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=User.Kind.choices)
    identifier = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=PASSWORD_MAX, trim_whitespace=False)
    remember = serializers.BooleanField(default=False)


class LoginView(OpenView):
    def post(self, request):
        data = validated(LoginSerializer, request)
        user = check_password_sign_in(request, data["kind"], data["identifier"], data["password"])
        if needs_second_factor(user):
            return Response(start_second_factor(request, user, remember=data["remember"]))
        complete_login(request, user, remember=data["remember"])
        return Response({"status": "signed_in", "user": me_payload(user)})


class LogoutView(OpenView):
    def post(self, request):
        if request.user.is_authenticated:
            record(AuditLog.Action.SIGN_OUT, entity=request.user, request=request)
        logout(request)
        return Response(status=204)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class MeView(APIView):
    """Who is signed in. Also gives the browser its CSRF cookie, even when signed out."""

    def get(self, request):
        return Response(me_payload(request.user))
```

`backend/apps/accounts/urls.py`:
```python
from django.urls import path

from apps.accounts import views

urlpatterns = [
    path("login", views.LoginView.as_view()),
    path("logout", views.LogoutView.as_view()),
    path("me", views.MeView.as_view()),
]
```

`backend/apps/core/views.py`:
```python
from django.http import JsonResponse
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok"})


def csrf_failure(request, reason=""):
    """Django's CSRF rejection in the API's error shape (spec §10)."""
    message = "Your session has expired. Refresh the page and try again."
    return JsonResponse({"code": "csrf_failed", "message": message, "fields": {}}, status=403)
```

In `backend/config/urls.py`, add `path("api/auth/", include("apps.accounts.urls")),` after the `api/public/` line.

In `backend/config/settings.py`, after `APPEND_SLASH = False`, add:
```python
CSRF_FAILURE_VIEW = "apps.core.views.csrf_failure"
# Browsers reach Django through the Next.js proxy, so the site's own origin must be trusted.
CSRF_TRUSTED_ORIGINS = env.list(
    "DJANGO_CSRF_TRUSTED_ORIGINS", default=["http://localhost:3000", "http://127.0.0.1:3000"]
)
```

In `backend/.env.example`, append:
```
# The site's own address(es), as the browser sees them. Production: https://<your domain>
DJANGO_CSRF_TRUSTED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

- [ ] **Step 5: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/accounts -q`
Expected: all pass.

- [ ] **Step 6: Migrate, check and commit**

Run: `.venv/Scripts/python manage.py migrate && .venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff check . && .venv/Scripts/python -m ruff format --check .`

```bash
git add backend/apps/accounts backend/apps/core/views.py backend/config backend/.env.example backend/tests/accounts
git commit -m "Add password sign-in with generic failures, lockouts and CSRF protection"
```

---

### Task 5: Sessions: timeouts, "where you're signed in" and changing password

**Files:**
- Create: `backend/apps/accounts/sessions.py`, `backend/apps/accounts/middleware.py`
- Modify: `backend/apps/accounts/signin.py` (`complete_login`), `backend/apps/accounts/views.py`, `backend/apps/accounts/urls.py`, `backend/config/settings.py` (MIDDLEWARE)
- Test: `backend/tests/accounts/test_sessions.py`

**Interfaces:**
- Consumes: `UserSession`, `complete_login`, `me_payload`, `OpenView`, `validated`, `PASSWORD_MAX`.
- Produces:
  - `sessions.py`: `session_policy(user, remember) -> (idle_s, max_s)`, `start_session(request, user, *, remember) -> UserSession`, `is_expired(session, now=None) -> bool`, `end_session(session)`, `end_other_sessions(user, keep_key) -> int`, `describe_device(user_agent) -> str`, `MINUTE`, `HOUR`, `DAY`.
  - `GET /api/auth/sessions` returns `[{id, device, ip_address, signed_in_at, last_seen, current}]`.
  - `DELETE /api/auth/sessions/<id>` returns 204.
  - `POST /api/auth/password` with `{current_password, new_password}` returns `Me`.
  - `views.check_new_password(password, user=None, field="new_password")`.
  - Middleware `apps.accounts.middleware.SessionActivityMiddleware`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/accounts/test_sessions.py`:
```python
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts import roles
from apps.accounts.models import UserSession
from apps.accounts.sessions import DAY, HOUR, MINUTE, describe_device, session_policy
from apps.audit.models import AuditLog
from tests.helpers import PASSWORD, sign_in

pytestmark = pytest.mark.django_db
NEW_PASSWORD = "a brand new passphrase"
ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36"


def change_password(api, current=PASSWORD, new=NEW_PASSWORD):
    return api.post(
        "/api/auth/password", {"current_password": current, "new_password": new}, format="json"
    )


@pytest.mark.parametrize(
    ("kind", "username", "role", "remember", "expected"),
    [
        ("staff", "k.mensah", roles.ADMINISTRATOR, False, (30 * MINUTE, 12 * HOUR)),
        ("staff", "k.mensah", roles.TEACHER, True, (2 * HOUR, 12 * HOUR)),
        ("student", "2601473", roles.STUDENT, True, (2 * HOUR, 12 * HOUR)),
        ("parent", "+233241234567", roles.PARENT, False, (2 * HOUR, 30 * DAY)),
        ("parent", "+233241234567", roles.PARENT, True, (30 * DAY, 30 * DAY)),
    ],
)
def test_session_policy(make_user, kind, username, role, remember, expected):
    assert session_policy(make_user(username, kind=kind, role=role), remember) == expected


def test_remembered_parents_stay_signed_in_for_thirty_days(api, make_user):
    make_user("+233241234567", kind="parent")
    response = sign_in(api, "0241234567", kind="parent", remember=True)
    assert response.cookies["sessionid"]["max-age"] == 30 * DAY
    assert UserSession.objects.get().idle_seconds == 30 * DAY


def test_idle_sessions_are_signed_out(api, make_user):
    make_user()
    sign_in(api, "k.mensah")
    UserSession.objects.update(last_seen=timezone.now() - timedelta(hours=2, seconds=1))
    assert api.get("/api/auth/me").json()["code"] == "not_authenticated"
    assert not UserSession.objects.exists()


def test_sessions_end_at_their_maximum_age(api, make_user):
    make_user()
    sign_in(api, "k.mensah")
    UserSession.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
    assert api.get("/api/auth/me").json()["code"] == "not_authenticated"


def test_activity_keeps_a_session_alive(api, make_user):
    make_user()
    sign_in(api, "k.mensah")
    earlier = timezone.now() - timedelta(minutes=5)
    UserSession.objects.update(last_seen=earlier)
    assert api.get("/api/auth/me").status_code == 200
    assert UserSession.objects.get().last_seen > earlier


def test_where_you_are_signed_in_and_signing_out_another_device(api, make_user):
    make_user()
    phone = APIClient(HTTP_USER_AGENT=ANDROID_CHROME)
    sign_in(phone, "k.mensah")
    sign_in(api, "k.mensah")
    listed = api.get("/api/auth/sessions").json()
    assert sorted(row["current"] for row in listed) == [False, True]
    other = next(row for row in listed if not row["current"])
    assert other["device"] == "Chrome on Android"

    assert api.delete(f"/api/auth/sessions/{other['id']}").status_code == 204
    assert phone.get("/api/auth/me").json()["code"] == "not_authenticated"
    assert api.get("/api/auth/me").status_code == 200
    assert AuditLog.objects.filter(action="SESSION_REVOKED").count() == 1


def test_the_current_session_ends_with_sign_out_not_revoke(api, make_user):
    make_user()
    sign_in(api, "k.mensah")
    current = api.get("/api/auth/sessions").json()[0]
    assert api.delete(f"/api/auth/sessions/{current['id']}").json()["code"] == "current_session"


def test_other_peoples_sessions_cannot_be_revoked(api, make_user):
    make_user()
    other_user = make_user("ama.boateng")
    sign_in(APIClient(), "ama.boateng")
    sign_in(api, "k.mensah")
    theirs = UserSession.objects.get(user=other_user)
    assert api.delete(f"/api/auth/sessions/{theirs.pk}").status_code == 404


def test_changing_the_password_signs_out_other_sessions(api, make_user):
    user = make_user()
    other = APIClient()
    sign_in(other, "k.mensah")
    sign_in(api, "k.mensah")
    assert change_password(api).status_code == 200
    assert api.get("/api/auth/me").status_code == 200
    assert other.get("/api/auth/me").json()["code"] == "not_authenticated"
    user.refresh_from_db()
    assert user.check_password(NEW_PASSWORD)
    assert UserSession.objects.count() == 1  # this one, still tracked under its new key
    assert AuditLog.objects.filter(action="PASSWORD_CHANGED").count() == 1


def test_password_change_errors_are_field_errors(api, make_user):
    make_user()
    sign_in(api, "k.mensah")
    wrong = change_password(api, current="not it at all")
    assert wrong.json()["fields"] == {"current_password": ["That isn't your current password."]}
    assert "new_password" in change_password(api, new="password").json()["fields"]


def test_students_must_change_their_first_password_before_anything_else(api, make_user):
    make_user("2601473", kind="student", role=roles.STUDENT, must_change_password=True)
    sign_in(api, "26-0147-3", kind="student")
    assert api.get("/api/auth/me").json()["must_change_password"] is True
    assert api.get("/api/anything-else").json()["code"] == "password_change_required"
    change_password(api)
    assert api.get("/api/anything-else").status_code == 404


@pytest.mark.parametrize(
    ("agent", "expected"),
    [
        (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1",
            "Safari on iPhone",
        ),
        (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36 Edg/130.0",
            "Edge on Windows",
        ),
        ("Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox on Linux"),
        (ANDROID_CHROME, "Chrome on Android"),
        ("", "Unknown browser on unknown device"),
    ],
)
def test_describe_device(agent, expected):
    assert describe_device(agent) == expected
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/accounts/test_sessions.py -q`
Expected: ERROR, `ModuleNotFoundError: No module named 'apps.accounts.sessions'`

- [ ] **Step 3: Write sessions and the middleware**

`backend/apps/accounts/sessions.py`:
```python
"""Signed-in sessions (spec §5.6): timeouts by role and the "Where you're signed in" list."""

from datetime import timedelta
from importlib import import_module

from django.conf import settings
from django.utils import timezone

from apps.accounts import roles
from apps.accounts.models import User, UserSession
from apps.audit.services import client_ip

MINUTE, HOUR, DAY = 60, 60 * 60, 24 * 60 * 60

BROWSERS = (
    ("Edg/", "Edge"),
    ("OPR/", "Opera"),
    ("SamsungBrowser/", "Samsung Internet"),
    ("Chrome/", "Chrome"),
    ("Firefox/", "Firefox"),
    ("Safari/", "Safari"),
)
SYSTEMS = (
    ("Android", "Android"),
    ("iPhone", "iPhone"),
    ("iPad", "iPad"),
    ("Windows", "Windows"),
    ("Mac OS X", "Mac"),
    ("CrOS", "Chromebook"),
    ("Linux", "Linux"),
)


def session_policy(user: User, remember: bool) -> tuple[int, int]:
    """(idle seconds, maximum seconds) for a new session."""
    if roles.needs_second_factor(user):
        return 30 * MINUTE, 12 * HOUR
    if user.kind == User.Kind.PARENT:
        return (30 * DAY if remember else 2 * HOUR), 30 * DAY
    return 2 * HOUR, 12 * HOUR


def start_session(request, user: User, *, remember: bool) -> UserSession:
    idle, maximum = session_policy(user, remember)
    request.session.set_expiry(idle)
    now = timezone.now()
    UserSession.objects.filter(user=user, expires_at__lte=now).delete()
    return UserSession.objects.create(
        user=user,
        session_key=request.session.session_key,
        user_agent=request.META.get("HTTP_USER_AGENT", "")[:300],
        ip_address=client_ip(request),
        last_seen=now,
        idle_seconds=idle,
        expires_at=now + timedelta(seconds=maximum),
    )


def is_expired(session: UserSession, now=None) -> bool:
    now = now or timezone.now()
    idle_for = now - session.last_seen
    return now >= session.expires_at or idle_for > timedelta(seconds=session.idle_seconds)


def end_session(session: UserSession) -> None:
    import_module(settings.SESSION_ENGINE).SessionStore(session_key=session.session_key).delete()
    session.delete()


def end_other_sessions(user: User, keep_key: str | None) -> int:
    others = list(UserSession.objects.filter(user=user).exclude(session_key=keep_key or ""))
    for session in others:
        end_session(session)
    return len(others)


def describe_device(user_agent: str) -> str:
    browser = next((name for token, name in BROWSERS if token in user_agent), "Unknown browser")
    system = next((name for token, name in SYSTEMS if token in user_agent), "unknown device")
    return f"{browser} on {system}"
```

`backend/apps/accounts/middleware.py`:
```python
"""Ends idle or over-age sessions (spec §5.6) and holds users who must change their password."""

from datetime import timedelta

from django.contrib.auth import logout
from django.http import JsonResponse
from django.utils import timezone

from apps.accounts.models import UserSession
from apps.accounts.sessions import is_expired

TOUCH_EVERY = timedelta(minutes=1)
OPEN_WHILE_PASSWORD_CHANGE = ("/api/auth/", "/api/public/", "/api/health")
PASSWORD_CHANGE_REQUIRED = {
    "code": "password_change_required",
    "message": "Choose a new password to continue.",
    "fields": {},
}


class SessionActivityMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_authenticated:
            key = request.session.session_key
            session = UserSession.objects.filter(session_key=key, user=request.user).first()
            now = timezone.now()
            # Sessions started outside the API (Django admin in development) are not tracked.
            if session is not None and is_expired(session, now):
                session.delete()
                logout(request)
            elif session is not None and now - session.last_seen >= TOUCH_EVERY:
                UserSession.objects.filter(pk=session.pk).update(last_seen=now)
                request.session.modified = True  # re-sends the cookie, extending its idle expiry
        if (
            request.user.is_authenticated
            and request.user.must_change_password
            and request.path.startswith("/api/")
            and not request.path.startswith(OPEN_WHILE_PASSWORD_CHANGE)
        ):
            return JsonResponse(PASSWORD_CHANGE_REQUIRED, status=403)
        return self.get_response(request)
```

In `backend/config/settings.py` MIDDLEWARE, add `"apps.accounts.middleware.SessionActivityMiddleware",` right after `"django.contrib.auth.middleware.AuthenticationMiddleware",`.

In `backend/apps/accounts/signin.py`, add `from apps.accounts.sessions import start_session`, and replace `complete_login` with:
```python
def complete_login(request, user: User, *, remember: bool) -> None:
    request.session.pop(PENDING_KEY, None)
    login(request, user)
    start_session(request, user, remember=remember)
    record(AuditLog.Action.SIGN_IN, actor=user, entity=user, request=request)
```

- [ ] **Step 4: Add the session and password views**

`backend/apps/accounts/views.py`:
```python
"""Sign-in API (spec §5). Errors use the shared {code, message, fields} shape."""

from django.contrib.auth import logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User, UserSession
from apps.accounts.roles import needs_second_factor
from apps.accounts.sessions import describe_device, end_other_sessions, end_session, is_expired
from apps.accounts.signin import (
    check_password_sign_in,
    complete_login,
    me_payload,
    start_second_factor,
)
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError

PASSWORD_MAX = 256


def validated(serializer_class, request) -> dict:
    serializer = serializer_class(data=request.data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def check_new_password(password: str, user=None, field: str = "new_password") -> None:
    try:
        validate_password(password, user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError({field: list(exc.messages)}) from exc


@method_decorator(csrf_protect, name="dispatch")
class OpenView(APIView):
    """Usable before sign-in, but cross-site posts are still refused (login CSRF)."""

    permission_classes = [AllowAny]


class LoginSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=User.Kind.choices)
    identifier = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=PASSWORD_MAX, trim_whitespace=False)
    remember = serializers.BooleanField(default=False)


class LoginView(OpenView):
    def post(self, request):
        data = validated(LoginSerializer, request)
        user = check_password_sign_in(request, data["kind"], data["identifier"], data["password"])
        if needs_second_factor(user):
            return Response(start_second_factor(request, user, remember=data["remember"]))
        complete_login(request, user, remember=data["remember"])
        return Response({"status": "signed_in", "user": me_payload(user)})


class LogoutView(OpenView):
    def post(self, request):
        if request.user.is_authenticated:
            UserSession.objects.filter(session_key=request.session.session_key).delete()
            record(AuditLog.Action.SIGN_OUT, entity=request.user, request=request)
        logout(request)
        return Response(status=204)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class MeView(APIView):
    """Who is signed in. Also gives the browser its CSRF cookie, even when signed out."""

    def get(self, request):
        return Response(me_payload(request.user))


class SessionsView(APIView):
    def get(self, request):
        now = timezone.now()
        current = request.session.session_key
        sessions = request.user.sessions.order_by("-last_seen")
        return Response(
            [
                {
                    "id": session.pk,
                    "device": describe_device(session.user_agent),
                    "ip_address": session.ip_address,
                    "signed_in_at": session.created_at,
                    "last_seen": session.last_seen,
                    "current": session.session_key == current,
                }
                for session in sessions
                if not is_expired(session, now)
            ]
        )


class SessionDetailView(APIView):
    def delete(self, request, pk):
        session = get_object_or_404(UserSession, pk=pk, user=request.user)
        if session.session_key == request.session.session_key:
            raise ApiError("current_session", "To end this session, use Sign out.", 400)
        device = describe_device(session.user_agent)
        end_session(session)
        record(
            AuditLog.Action.SESSION_REVOKED,
            entity=request.user,
            new={"device": device},
            request=request,
        )
        return Response(status=204)


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(max_length=PASSWORD_MAX, trim_whitespace=False)
    new_password = serializers.CharField(max_length=PASSWORD_MAX, trim_whitespace=False)


class PasswordView(APIView):
    def post(self, request):
        data = validated(PasswordChangeSerializer, request)
        user = request.user
        if not user.check_password(data["current_password"]):
            raise serializers.ValidationError(
                {"current_password": ["That isn't your current password."]}
            )
        check_new_password(data["new_password"], user)
        user.set_password(data["new_password"])
        user.must_change_password = False
        user.save()
        old_key = request.session.session_key
        update_session_auth_hash(request, user)  # keeps this session, under a new key
        new_key = request.session.session_key
        UserSession.objects.filter(session_key=old_key).update(session_key=new_key)
        end_other_sessions(user, keep_key=new_key)
        record(AuditLog.Action.PASSWORD_CHANGED, entity=user, request=request)
        return Response(me_payload(user))
```

`backend/apps/accounts/urls.py`:
```python
from django.urls import path

from apps.accounts import views

urlpatterns = [
    path("login", views.LoginView.as_view()),
    path("logout", views.LogoutView.as_view()),
    path("me", views.MeView.as_view()),
    path("sessions", views.SessionsView.as_view()),
    path("sessions/<int:pk>", views.SessionDetailView.as_view()),
    path("password", views.PasswordView.as_view()),
]
```

- [ ] **Step 5: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/accounts -q`
Expected: all pass.

- [ ] **Step 6: Check and commit**

Run: `.venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff check . && .venv/Scripts/python -m ruff format --check .`

```bash
git add backend/apps/accounts backend/config/settings.py backend/tests/accounts
git commit -m "Add role-based session timeouts, the signed-in devices list and password changes"
```

---

### Task 6: Second factor: authenticator app, SMS fallback and backup codes

**Files:**
- Create: `backend/apps/accounts/second_factor.py`, `backend/apps/accounts/sms_codes.py`, `backend/apps/accounts/management/commands/reset_second_factor.py`
- Modify: `backend/apps/accounts/views.py` (four views), `backend/apps/accounts/urls.py`, `backend/requirements.txt`
- Test: `backend/tests/accounts/test_second_factor.py`

**Interfaces:**
- Consumes: `pending_user`, `complete_login`, `me_payload`, `has_authenticator`, `PENDING_KEY`, `end_other_sessions`, `send_sms`, `SmsMessage.Status`.
- Produces:
  - `POST /api/auth/second-factor/setup` returns `{secret, otpauth_url, qr_image}` (`qr_image` is an SVG data URI).
  - `POST /api/auth/second-factor/confirm` with `{code}` returns `{status: "signed_in", user, backup_codes: [10]}`.
  - `POST /api/auth/second-factor/sms` returns `{sent: true}`.
  - `POST /api/auth/second-factor/verify` with `{method: "totp"|"sms"|"backup", code}` returns `{status: "signed_in", user}`.
  - `second_factor.py`: `matching_step(secret, code, *, after=None, now=None)`, `verify_totp(device, code)`, `new_device(user)`, `provisioning(user, secret)`, `issue_backup_codes(user) -> list[str]`, `use_backup_code(user, code) -> bool`, `reset_second_factor(user, *, by=None, request=None, reason="")`, `reject_code(request)` (always raises), `finish_second_factor(request, user) -> dict`.
  - `sms_codes.py`: `send_code(user, purpose, phone) -> SmsMessage`, `check_code(user, purpose, code) -> SmsCode | None`, `consume(row) -> bool`, `sms_failed_message() -> str`.
  - `manage.py reset_second_factor <username>`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/accounts/test_second_factor.py`:
```python
import re
import time
from datetime import timedelta

import pyotp
import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.accounts import roles, signin
from apps.accounts.models import BackupCode, SmsCode, TotpDevice
from apps.accounts.second_factor import issue_backup_codes, matching_step
from apps.accounts.sms_codes import check_code, consume, send_code
from apps.audit.models import AuditLog
from apps.notifications.backends import MemoryBackend
from apps.notifications.models import SmsMessage
from tests.helpers import sign_in

pytestmark = pytest.mark.django_db
PHONE = "+233241234567"
WRONG = "nope00"


@pytest.fixture
def admin(make_user):
    return make_user("admin", role=roles.ADMINISTRATOR, phone=PHONE)


def with_authenticator(user):
    secret = pyotp.random_base32()
    TotpDevice.objects.create(user=user, secret=secret, confirmed_at=timezone.now())
    return secret


def verify(api, method, code):
    payload = {"method": method, "code": code}
    return api.post("/api/auth/second-factor/verify", payload, format="json")


def texted_code():
    return re.search(r"\d{6}", MemoryBackend.outbox[-1]["body"]).group()


def test_first_sign_in_sets_up_an_authenticator(api, admin):
    sign_in(api, "admin")
    setup = api.post("/api/auth/second-factor/setup").json()
    assert setup["qr_image"].startswith("data:image/svg+xml;base64,")
    assert setup["otpauth_url"].startswith("otpauth://totp/")
    assert "issuer=AD%20Smart%20School" in setup["otpauth_url"]
    code = pyotp.TOTP(setup["secret"]).now()
    body = api.post("/api/auth/second-factor/confirm", {"code": code}, format="json").json()
    assert body["status"] == "signed_in" and len(body["backup_codes"]) == 10
    assert api.get("/api/auth/me").json()["has_authenticator"] is True
    assert AuditLog.objects.filter(action="SECOND_FACTOR_SET_UP").count() == 1


def test_setup_is_refused_once_an_authenticator_exists(api, admin):
    with_authenticator(admin)
    sign_in(api, "admin")
    assert api.post("/api/auth/second-factor/setup").json()["code"] == "already_set_up"


def test_returning_staff_sign_in_with_their_app(api, admin):
    secret = with_authenticator(admin)
    assert sign_in(api, "admin").json()["totp_ready"] is True
    assert verify(api, "totp", pyotp.TOTP(secret).now()).json()["status"] == "signed_in"
    assert api.get("/api/auth/me").status_code == 200


def test_an_authenticator_code_works_only_once(api, admin):
    secret = with_authenticator(admin)
    code = pyotp.TOTP(secret).now()
    sign_in(api, "admin")
    verify(api, "totp", code)
    api.post("/api/auth/logout")
    sign_in(api, "admin")
    assert verify(api, "totp", code).json()["code"] == "invalid_code"


def test_neighbouring_steps_are_accepted_for_clock_drift():
    secret = pyotp.random_base32()
    totp, now = pyotp.TOTP(secret), time.time()
    current = int(now // 30)
    assert matching_step(secret, totp.at(now - 30), now=now) == current - 1
    assert matching_step(secret, totp.at(now + 30), now=now) == current + 1
    assert matching_step(secret, "12345", now=now) is None
    assert matching_step(secret, "١٢٣٤٥٦", now=now) is None


def test_sms_fallback_sends_a_code_and_logs_it_redacted(api, admin):
    with_authenticator(admin)
    sign_in(api, "admin")
    assert api.post("/api/auth/second-factor/sms").json() == {"sent": True}
    assert MemoryBackend.outbox[-1]["to"] == PHONE
    assert "******" in SmsMessage.objects.get().body
    assert verify(api, "sms", texted_code()).json()["status"] == "signed_in"


def test_staff_without_a_phone_cannot_use_sms(api, make_user):
    make_user("head", role=roles.HEAD_TEACHER)
    assert sign_in(api, "head").json()["sms_available"] is False
    assert api.post("/api/auth/second-factor/sms").json()["code"] == "no_phone"


def test_a_failed_text_tells_the_user_to_call_the_school(api, admin, settings):
    settings.SMS_BACKEND = "tests.notifications.test_sms.BrokenBackend"
    sign_in(api, "admin")
    response = api.post("/api/auth/second-factor/sms")
    assert response.status_code == 503
    assert response.json()["message"].startswith(
        "We couldn't send the code. Try again, or call the school"
    )


def test_sms_codes_are_stored_hashed_and_expire_after_ten_minutes(admin):
    send_code(admin, SmsCode.Purpose.SIGN_IN, PHONE)
    code = texted_code()
    assert code not in SmsCode.objects.get().code_hash
    SmsCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
    assert check_code(admin, SmsCode.Purpose.SIGN_IN, code) is None


def test_sms_codes_allow_five_attempts(admin):
    send_code(admin, SmsCode.Purpose.SIGN_IN, PHONE)
    code = texted_code()
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert check_code(admin, SmsCode.Purpose.SIGN_IN, wrong) is None
    assert check_code(admin, SmsCode.Purpose.SIGN_IN, code) is None


def test_sms_codes_work_once_and_a_new_code_replaces_the_old(admin):
    send_code(admin, SmsCode.Purpose.SIGN_IN, PHONE)
    first = texted_code()
    send_code(admin, SmsCode.Purpose.SIGN_IN, PHONE)
    second = texted_code()
    if first != second:
        assert check_code(admin, SmsCode.Purpose.SIGN_IN, first) is None
    row = check_code(admin, SmsCode.Purpose.SIGN_IN, second)
    assert row is not None and consume(row)
    assert not consume(row)
    assert check_code(admin, SmsCode.Purpose.SIGN_IN, second) is None


def test_backup_codes_work_once(api, admin):
    with_authenticator(admin)
    codes = issue_backup_codes(admin)
    assert len(set(codes)) == 10
    assert not any(codes[1].replace("-", "") in row.code_hash for row in BackupCode.objects.all())
    sign_in(api, "admin")
    assert verify(api, "backup", codes[0].upper()).json()["status"] == "signed_in"
    api.post("/api/auth/logout")
    sign_in(api, "admin")
    assert verify(api, "backup", codes[0]).json()["code"] == "invalid_code"
    assert AuditLog.objects.filter(action="BACKUP_CODE_USED").count() == 1


def test_five_wrong_codes_end_the_attempt(api, admin):
    secret = with_authenticator(admin)
    sign_in(api, "admin")
    for _ in range(4):
        assert verify(api, "totp", WRONG).json()["code"] == "invalid_code"
    assert verify(api, "totp", WRONG).status_code == 429
    assert verify(api, "totp", pyotp.TOTP(secret).now()).json()["code"] == "second_factor_expired"


def test_second_factor_steps_need_a_recent_password(api, admin, monkeypatch):
    assert api.post("/api/auth/second-factor/setup").json()["code"] == "second_factor_expired"
    start = signin._now()
    sign_in(api, "admin")
    monkeypatch.setattr(signin, "_now", lambda: start + 10 * 60 + 1)
    assert api.post("/api/auth/second-factor/setup").json()["code"] == "second_factor_expired"


def test_reset_second_factor_command(api, admin):
    with_authenticator(admin)
    issue_backup_codes(admin)
    call_command("reset_second_factor", "Admin")
    assert not TotpDevice.objects.filter(user=admin).exists()
    assert not BackupCode.objects.filter(user=admin).exists()
    assert AuditLog.objects.filter(action="SECOND_FACTOR_RESET").count() == 1
    assert sign_in(api, "admin").json()["totp_ready"] is False
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/accounts/test_second_factor.py -q`
Expected: ERROR, `ModuleNotFoundError: No module named 'pyotp'`. After `pip install`, the error becomes `No module named 'apps.accounts.second_factor'`.

- [ ] **Step 3: Add the libraries and the second-factor code**

In `backend/requirements.txt`, add `pyotp==2.10.0` and `qrcode==8.2`, then run `.venv/Scripts/python -m pip install -r requirements-dev.txt`.

`backend/apps/accounts/sms_codes.py`:
```python
"""Six-digit SMS codes (spec §5.2, §5.3): hashed, valid 10 minutes, 5 attempts, single use."""

import hmac
import secrets
from datetime import timedelta

from django.db.models import F
from django.utils import timezone
from django.utils.crypto import salted_hmac

from apps.accounts.models import SmsCode, User
from apps.core.phones import format_gh_local
from apps.notifications.models import SmsMessage
from apps.notifications.sms import Purpose, send_sms
from apps.school.models import SchoolProfile

LIFETIME = timedelta(minutes=10)
MAX_ATTEMPTS = 5
TEXT = "Your AD Smart School code is {code}. It expires in 10 minutes. Never share it with anyone."


def _digest(code: str) -> str:
    return salted_hmac("accounts.sms-code", code, algorithm="sha256").hexdigest()


def send_code(user: User, purpose: str, phone: str) -> SmsMessage:
    """Text a new code. Only once it is sent does it replace any earlier code."""
    code = f"{secrets.randbelow(10**6):06d}"
    message = send_sms(
        phone,
        TEXT.format(code=code),
        purpose=Purpose.SIGN_IN_CODE,
        redacted_body=TEXT.format(code="******"),
    )
    if message.status == SmsMessage.Status.SENT:
        now = timezone.now()
        SmsCode.objects.filter(user=user, purpose=purpose, used_at__isnull=True).update(used_at=now)
        SmsCode.objects.create(
            user=user, purpose=purpose, code_hash=_digest(code), expires_at=now + LIFETIME
        )
    return message


def check_code(user: User, purpose: str, code: str) -> SmsCode | None:
    """The live code matching `code`, or None. Wrong guesses use up attempts."""
    row = (
        SmsCode.objects.filter(
            user=user, purpose=purpose, used_at__isnull=True, expires_at__gt=timezone.now()
        )
        .order_by("-created_at")
        .first()
    )
    if row is None or row.attempts >= MAX_ATTEMPTS:
        return None
    if not hmac.compare_digest(row.code_hash, _digest(code.strip())):
        SmsCode.objects.filter(pk=row.pk).update(attempts=F("attempts") + 1)
        return None
    return row


def consume(row: SmsCode) -> bool:
    """Mark the code used; False if another request used it first."""
    return SmsCode.objects.filter(pk=row.pk, used_at__isnull=True).update(used_at=timezone.now()) == 1


def sms_failed_message() -> str:
    school = SchoolProfile.load()
    phone = format_gh_local(school.phone) if school and school.phone else ""
    return "We couldn't send the code. Try again, or call the school" + (
        f" on {phone}." if phone else "."
    )
```

`backend/apps/accounts/second_factor.py`:
```python
"""Authenticator app and backup codes for the second factor (spec §5.3)."""

import base64
import hmac
import secrets
import time

import pyotp
import qrcode
import qrcode.image.svg
from django.utils import timezone
from django.utils.crypto import salted_hmac

from apps.accounts.models import BackupCode, TotpDevice, User
from apps.accounts.sessions import end_other_sessions
from apps.accounts.signin import PENDING_KEY, complete_login, me_payload
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError

ISSUER = "AD Smart School"
BACKUP_CODE_COUNT = 10
BACKUP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no 0/o or 1/i/l to misread
MAX_WRONG_CODES = 5


def new_device(user: User) -> TotpDevice:
    device, _ = TotpDevice.objects.update_or_create(
        user=user,
        defaults={"secret": pyotp.random_base32(), "confirmed_at": None, "last_used_step": None},
    )
    return device


def provisioning(user: User, secret: str) -> dict:
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.username, issuer_name=ISSUER)
    svg = qrcode.make(uri, image_factory=qrcode.image.svg.SvgPathImage).to_string()
    return {
        "secret": secret,
        "otpauth_url": uri,
        "qr_image": "data:image/svg+xml;base64," + base64.b64encode(svg).decode(),
    }


def matching_step(
    secret: str, code: str, *, after: int | None = None, now: float | None = None
) -> int | None:
    """The 30-second step the code belongs to, allowing one step of clock drift."""
    if len(code) != 6 or not code.isascii() or not code.isdigit():
        return None
    totp = pyotp.TOTP(secret)
    current = int((time.time() if now is None else now) // totp.interval)
    for step in (current - 1, current, current + 1):
        if (after is None or step > after) and hmac.compare_digest(totp.generate_otp(step), code):
            return step
    return None


def verify_totp(device: TotpDevice, code: str) -> bool:
    step = matching_step(device.secret, code.strip(), after=device.last_used_step)
    if step is None:
        return False
    device.last_used_step = step  # a used code is refused for the rest of its window
    device.save(update_fields=["last_used_step"])
    return True


def _backup_digest(code: str) -> str:
    normalised = code.replace("-", "").strip().lower()
    return salted_hmac("accounts.backup-code", normalised, algorithm="sha256").hexdigest()


def issue_backup_codes(user: User) -> list[str]:
    BackupCode.objects.filter(user=user).delete()
    codes = []
    for _ in range(BACKUP_CODE_COUNT):
        raw = "".join(secrets.choice(BACKUP_ALPHABET) for _ in range(8))
        codes.append(f"{raw[:4]}-{raw[4:]}")
    BackupCode.objects.bulk_create(
        BackupCode(user=user, code_hash=_backup_digest(code)) for code in codes
    )
    return codes


def use_backup_code(user: User, code: str) -> bool:
    matching = BackupCode.objects.filter(
        user=user, code_hash=_backup_digest(code), used_at__isnull=True
    )
    return matching.update(used_at=timezone.now()) == 1


def reset_second_factor(user: User, *, by: User | None = None, request=None, reason="") -> None:
    TotpDevice.objects.filter(user=user).delete()
    BackupCode.objects.filter(user=user).delete()
    end_other_sessions(user, keep_key=None)
    record(
        AuditLog.Action.SECOND_FACTOR_RESET, actor=by, entity=user, reason=reason, request=request
    )


def reject_code(request):
    """Count a wrong code; the fifth ends the attempt (spec §5.5). Always raises."""
    pending = request.session[PENDING_KEY]
    pending["failures"] = pending.get("failures", 0) + 1
    if pending["failures"] >= MAX_WRONG_CODES:
        del request.session[PENDING_KEY]
        raise ApiError("second_factor_expired", "Too many wrong codes. Please sign in again.", 429)
    request.session[PENDING_KEY] = pending
    raise ApiError("invalid_code", "That code didn't work. Check it and try again.", 400)


def finish_second_factor(request, user: User) -> dict:
    complete_login(request, user, remember=request.session[PENDING_KEY]["remember"])
    return {"status": "signed_in", "user": me_payload(user)}
```

`backend/apps/accounts/management/commands/reset_second_factor.py`:
```python
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import User
from apps.accounts.second_factor import reset_second_factor


class Command(BaseCommand):
    help = (
        "Remove a user's authenticator app and backup codes. They set up a new one at their "
        "next sign-in. Use this when the only Administrator has lost their phone (spec §5.3)."
    )

    def add_arguments(self, parser):
        parser.add_argument("username")

    def handle(self, *args, username, **options):
        user = User.objects.filter(username__iexact=username.strip()).first()
        if user is None:
            raise CommandError(f"No user called {username}.")
        reset_second_factor(user, reason="Reset with manage.py reset_second_factor")
        self.stdout.write(self.style.SUCCESS(f"Second factor reset for {user.username}."))
```

In `backend/apps/accounts/views.py`:
- Extend the imports:
```python
from apps.accounts.models import SmsCode, TotpDevice, User, UserSession
from apps.accounts.second_factor import (
    finish_second_factor,
    issue_backup_codes,
    new_device,
    provisioning,
    reject_code,
    use_backup_code,
    verify_totp,
)
from apps.accounts.signin import (
    check_password_sign_in,
    complete_login,
    has_authenticator,
    me_payload,
    pending_user,
    start_second_factor,
)
from apps.accounts.sms_codes import check_code, consume, send_code, sms_failed_message
from apps.notifications.models import SmsMessage
```
  These replace the old `models` and `signin` import lines.
- Append the four views:
```python


class CodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=20)


class VerifySerializer(CodeSerializer):
    method = serializers.ChoiceField(choices=["totp", "sms", "backup"])


class SecondFactorSetupView(OpenView):
    def post(self, request):
        user = pending_user(request)
        if has_authenticator(user):
            raise ApiError(
                "already_set_up", "An authenticator app is already set up for this account.", 400
            )
        return Response(provisioning(user, new_device(user).secret))


class SecondFactorConfirmView(OpenView):
    def post(self, request):
        user = pending_user(request)
        code = validated(CodeSerializer, request)["code"]
        device = TotpDevice.objects.filter(user=user, confirmed_at__isnull=True).first()
        if device is None or not verify_totp(device, code):
            reject_code(request)
        device.confirmed_at = timezone.now()
        device.save(update_fields=["confirmed_at"])
        codes = issue_backup_codes(user)
        record(AuditLog.Action.SECOND_FACTOR_SET_UP, actor=user, entity=user, request=request)
        return Response({**finish_second_factor(request, user), "backup_codes": codes})


class SecondFactorSmsView(OpenView):
    def post(self, request):
        user = pending_user(request)
        if not user.phone:
            raise ApiError(
                "no_phone",
                "There's no mobile number on your account. Use your authenticator app or a "
                "backup code.",
                400,
            )
        message = send_code(user, SmsCode.Purpose.SIGN_IN, user.phone)
        if message.status == SmsMessage.Status.REFUSED:
            raise ApiError(
                "too_many_codes",
                "Too many codes have been sent to your phone. Wait an hour, or use your "
                "authenticator app or a backup code.",
                429,
            )
        if message.status != SmsMessage.Status.SENT:
            raise ApiError("sms_failed", sms_failed_message(), 503)
        return Response({"sent": True})


class SecondFactorVerifyView(OpenView):
    def post(self, request):
        user = pending_user(request)
        data = validated(VerifySerializer, request)
        method, code = data["method"], data["code"]
        if method == "totp":
            device = TotpDevice.objects.filter(user=user, confirmed_at__isnull=False).first()
            ok = device is not None and verify_totp(device, code)
        elif method == "sms":
            row = check_code(user, SmsCode.Purpose.SIGN_IN, code)
            ok = row is not None and consume(row)
        else:
            ok = use_backup_code(user, code)
            if ok:
                record(AuditLog.Action.BACKUP_CODE_USED, actor=user, entity=user, request=request)
        if not ok:
            reject_code(request)
        return Response(finish_second_factor(request, user))
```

In `backend/apps/accounts/urls.py`, add:
```python
    path("second-factor/setup", views.SecondFactorSetupView.as_view()),
    path("second-factor/confirm", views.SecondFactorConfirmView.as_view()),
    path("second-factor/sms", views.SecondFactorSmsView.as_view()),
    path("second-factor/verify", views.SecondFactorVerifyView.as_view()),
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/accounts -q`
Expected: all pass.

- [ ] **Step 5: Check and commit**

Run: `.venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff check . && .venv/Scripts/python -m ruff format --check .`

```bash
git add backend/apps/accounts backend/requirements.txt backend/tests/accounts
git commit -m "Add the second factor: authenticator app, SMS fallback and backup codes"
```

---

### Task 7: Parent activation and password reset by SMS code

**Files:**
- Modify: `backend/apps/accounts/views.py`, `backend/apps/accounts/urls.py`, `backend/config/settings.py` (throttle rate)
- Test: `backend/tests/accounts/test_parent_activation.py`

**Interfaces:**
- Consumes: `send_code`, `check_code`, `consume`, `check_new_password`, `complete_login`, `end_other_sessions`, `normalise_gh_phone`.
- Produces:
  - `POST /api/auth/parent/request-code` with `{phone}` always returns `{message: "If this number is registered, a code has been sent."}`. Limited to 10 per hour per IP (scope `sms_code_ip`).
  - `POST /api/auth/parent/set-password` with `{phone, code, password, remember}` returns `{status: "signed_in", user}`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/accounts/test_parent_activation.py`:
```python
import re

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.core.phones import MOBILE_MESSAGE
from apps.notifications.backends import MemoryBackend
from tests.helpers import PASSWORD, sign_in

pytestmark = pytest.mark.django_db
PHONE = "+233241234567"
NEW = "our family passphrase"
SENT = {"message": "If this number is registered, a code has been sent."}
BAD_CODE = {
    "code": "invalid_code",
    "message": "That code is wrong or has expired. Request a new code.",
    "fields": {},
}


@pytest.fixture
def parent(make_user):
    return make_user(PHONE, kind="parent", password=None, display_name="Ama Mensah", phone=PHONE)


def request_code(api, phone="024 123 4567"):
    return api.post("/api/auth/parent/request-code", {"phone": phone}, format="json")


def set_password(api, code, password=NEW, phone="024 123 4567"):
    payload = {"phone": phone, "code": code, "password": password}
    return api.post("/api/auth/parent/set-password", payload, format="json")


def texted_code():
    return re.search(r"\d{6}", MemoryBackend.outbox[-1]["body"]).group()


def test_registered_and_unknown_numbers_get_the_same_reply(api, parent):
    assert request_code(api).json() == request_code(api, "020 123 4567").json() == SENT
    assert [message["to"] for message in MemoryBackend.outbox] == [PHONE]


def test_an_invalid_number_is_a_field_error(api):
    assert request_code(api, "12345").json()["fields"] == {"phone": [MOBILE_MESSAGE]}


def test_a_parent_activates_and_is_signed_in(api, parent):
    request_code(api)
    assert set_password(api, texted_code()).json()["status"] == "signed_in"
    assert api.get("/api/auth/me").json()["display_name"] == "Ama Mensah"
    parent.refresh_from_db()
    assert parent.activated_at is not None and parent.check_password(NEW)
    assert AuditLog.objects.filter(action="ACCOUNT_ACTIVATED").count() == 1
    assert sign_in(APIClient(), "024 123 4567", NEW, kind="parent").json()["status"] == "signed_in"


def test_forgotten_passwords_are_reset_and_other_sessions_end(api, parent):
    parent.set_password(PASSWORD)
    parent.activated_at = timezone.now()
    parent.save()
    elsewhere = APIClient()
    sign_in(elsewhere, "024 123 4567", kind="parent")
    request_code(api)
    assert set_password(api, texted_code()).json()["status"] == "signed_in"
    assert elsewhere.get("/api/auth/me").json()["code"] == "not_authenticated"
    assert AuditLog.objects.filter(action="PASSWORD_RESET").count() == 1


def test_wrong_codes_and_unknown_numbers_get_the_same_answer(api, parent):
    request_code(api)
    wrong = "000000" if texted_code() != "000000" else "111111"
    assert set_password(api, wrong).json() == BAD_CODE
    assert set_password(api, "123456", phone="020 123 4567").json() == BAD_CODE


def test_weak_passwords_are_refused_the_same_way_for_any_number(api, parent):
    request_code(api)
    known = set_password(api, texted_code(), password="password")
    unknown = set_password(api, "123456", password="password", phone="020 123 4567")
    assert known.json() == unknown.json()
    assert "password" in known.json()["fields"]
    assert set_password(api, texted_code()).json()["status"] == "signed_in"  # code still valid


def test_deactivated_parents_get_no_code(api, make_user):
    make_user(PHONE, kind="parent", password=None, is_active=False)
    assert request_code(api).json() == SENT
    assert MemoryBackend.outbox == []


def test_three_codes_an_hour_per_number(api, parent):
    for _ in range(4):
        assert request_code(api).json() == SENT
    assert len(MemoryBackend.outbox) == 3


def test_ten_requests_an_hour_per_address(api):
    for _ in range(10):
        request_code(api, "020 123 4567")
    assert request_code(api, "020 123 4567").status_code == 429
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/Scripts/python -m pytest tests/accounts/test_parent_activation.py -q`
Expected: FAIL, 404s on `/api/auth/parent/...`.

- [ ] **Step 3: Add the views, URLs and throttle rate**

In `backend/apps/accounts/views.py`, add `from rest_framework.throttling import AnonRateThrottle` and `from apps.core.phones import normalise_gh_phone`, then append:
```python


class SmsCodeAddressThrottle(AnonRateThrottle):
    scope = "sms_code_ip"


class PhoneField(serializers.CharField):
    def to_internal_value(self, data):
        try:
            return normalise_gh_phone(super().to_internal_value(data))
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc


class RequestCodeSerializer(serializers.Serializer):
    phone = PhoneField(max_length=20)


class SetPasswordSerializer(RequestCodeSerializer):
    code = serializers.RegexField(
        r"^\d{6}$", error_messages={"invalid": "Enter the 6-digit code from the SMS."}
    )
    password = serializers.CharField(max_length=PASSWORD_MAX, trim_whitespace=False)
    remember = serializers.BooleanField(default=False)


CODE_SENT = "If this number is registered, a code has been sent."
BAD_CODE = "That code is wrong or has expired. Request a new code."


def active_parent(phone: str) -> User | None:
    return User.objects.filter(kind=User.Kind.PARENT, username=phone, is_active=True).first()


class ParentRequestCodeView(OpenView):
    throttle_classes = [SmsCodeAddressThrottle]

    def post(self, request):
        phone = validated(RequestCodeSerializer, request)["phone"]
        user = active_parent(phone)
        if user is not None:
            send_code(user, SmsCode.Purpose.ACTIVATION, phone)  # outcome not revealed (spec §5.2)
        return Response({"message": CODE_SENT})


class ParentSetPasswordView(OpenView):
    def post(self, request):
        data = validated(SetPasswordSerializer, request)
        # Checked before the lookup, so a weak password says nothing about the number.
        check_new_password(data["password"], field="password")
        user = active_parent(data["phone"])
        row = check_code(user, SmsCode.Purpose.ACTIVATION, data["code"]) if user else None
        if row is None:
            raise ApiError("invalid_code", BAD_CODE, 400)
        check_new_password(data["password"], user, field="password")
        if not consume(row):
            raise ApiError("invalid_code", BAD_CODE, 400)

        first_time = user.activated_at is None
        user.set_password(data["password"])
        user.activated_at = user.activated_at or timezone.now()
        user.save()
        end_other_sessions(user, keep_key=None)
        action = AuditLog.Action.ACCOUNT_ACTIVATED if first_time else AuditLog.Action.PASSWORD_RESET
        record(action, actor=user, entity=user, request=request)
        complete_login(request, user, remember=data["remember"])
        return Response({"status": "signed_in", "user": me_payload(user)})
```

In `backend/apps/accounts/urls.py`, add:
```python
    path("parent/request-code", views.ParentRequestCodeView.as_view()),
    path("parent/set-password", views.ParentSetPasswordView.as_view()),
```

In `backend/config/settings.py` `DEFAULT_THROTTLE_RATES`, add `"sms_code_ip": "10/hour"` (spec §5.5).

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/accounts -q`
Expected: all pass.

- [ ] **Step 5: Check and commit**

Run: `.venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff check . && .venv/Scripts/python -m ruff format --check .`

```bash
git add backend/apps/accounts backend/config/settings.py backend/tests/accounts
git commit -m "Let parents activate or reset their account with an SMS code"
```

---

### Task 8: Frontend: the sign-in page and second-factor step

**Files:**
- Modify: `frontend/src/lib/types.ts`, `frontend/src/lib/client-api.ts`, `frontend/src/lib/client-api.test.ts`, `frontend/src/lib/enquiry-schema.ts` (export `GH_MOBILE`), `frontend/vitest.setup.ts`
- Create: `frontend/src/test/http.ts`, `frontend/src/lib/safe-next.ts`, `frontend/src/lib/safe-next.test.ts`, `frontend/src/components/ui/form-alert.tsx`, `frontend/src/components/auth/password-input.tsx`, `frontend/src/components/auth/sign-in-form.tsx`, `frontend/src/components/auth/sign-in-form.test.tsx`, `frontend/src/components/auth/second-factor.tsx`, `frontend/src/components/auth/second-factor.test.tsx`, `frontend/src/app/(auth)/layout.tsx`, `frontend/src/app/(auth)/sign-in/page.tsx`

**Interfaces:**
- Consumes: the Task 4 and Task 6 endpoints.
- Produces:
  - `client-api.ts`: `getJson`, `postJson(path, data?)`, `deleteJson(path)` (both send `X-CSRFToken` from the `csrftoken` cookie; a 204 resolves to `undefined`), `errorMessage(caught) -> string`, `fieldErrors(caught) -> Record<string, string>`, `OFFLINE_MESSAGE`.
  - `safeNext(next, fallback = "/account")`.
  - Types: `AccountKind`, `Me`, `SignInResult`, `SessionInfo`.
  - `<FormAlert message focusKey />`, `<PasswordInput />`.
  - Test helpers `respond`, `mockApi(routes)` and `bodyOf(fetchMock, method, path)` in `@/test/http`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/test/http.ts`:
```ts
import { vi } from "vitest";

export function respond(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

type Route = [method: string, path: string, status: number, body?: unknown];

/** Stubs fetch with canned responses; each route answers once, in order. Others get a 404. */
export function mockApi(routes: Route[]) {
  const queue = [...routes];
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const index = queue.findIndex(([m, p]) => m === method && p === path);
    if (index === -1) return respond(404, { code: "not_found", message: "Not found.", fields: {} });
    const [, , status, body] = queue.splice(index, 1)[0];
    return respond(status, body ?? null);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function bodyOf(fetchMock: ReturnType<typeof mockApi>, method: string, path: string): unknown {
  const call = fetchMock.mock.calls.find(([p, init]) => p === path && (init?.method ?? "GET") === method);
  return call ? JSON.parse(String(call[1]?.body)) : undefined;
}
```

`frontend/src/lib/client-api.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiRequestError,
  deleteJson,
  errorMessage,
  fieldErrors,
  OFFLINE_MESSAGE,
  postJson,
} from "./client-api";

afterEach(() => {
  document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

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

  it("sends Django's CSRF token with every change and accepts empty replies", async () => {
    document.cookie = "csrftoken=abc123; path=/";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new SyntaxError("empty"); } });
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteJson("/api/auth/sessions/4")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/sessions/4",
      expect.objectContaining({ method: "DELETE", headers: expect.objectContaining({ "X-CSRFToken": "abc123" }) }),
    );
  });

  it("raises ApiRequestError carrying the error body", async () => {
    const body = { code: "validation_error", message: "Check", fields: { phone: ["Bad"] } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => body }));

    const error = await postJson("/x", {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(400);
    expect((error as ApiRequestError).body).toEqual(body);
    expect(errorMessage(error)).toBe("Check");
    expect(fieldErrors(error)).toEqual({ phone: "Bad" });
  });

  it("copes with error responses that are not JSON, and with no connection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => { throw new SyntaxError("html"); } }),
    );

    const error = (await postJson("/x", {}).catch((caught: unknown) => caught)) as ApiRequestError;

    expect(error.status).toBe(502);
    expect(error.body).toBeNull();
    expect(errorMessage(error)).toBe(OFFLINE_MESSAGE);
    expect(errorMessage(new TypeError("Failed to fetch"))).toBe(OFFLINE_MESSAGE);
    expect(fieldErrors(new TypeError("Failed to fetch"))).toEqual({});
  });
});
```

`frontend/src/lib/safe-next.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/account?tab=security")).toBe("/account?tab=security");
  });

  it("refuses anything that could leave the site", () => {
    for (const next of [null, undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "account"]) {
      expect(safeNext(next)).toBe("/account");
    }
  });
});
```

`frontend/src/components/auth/sign-in-form.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter, useSearchParams } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { SignInForm } from "./sign-in-form";

const INVALID = { code: "invalid_credentials", message: "Incorrect username or password.", fields: {} };

describe("sign-in form", () => {
  it("asks parents for their mobile number and offers to keep them signed in", () => {
    mockApi([]);
    render(<SignInForm />);
    expect(screen.getByRole("tab", { name: "Parent" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText(/mobile number/i)).toHaveAttribute("type", "tel");
    expect(screen.getByLabelText(/keep me signed in/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /first time/i })).toHaveAttribute("href", "/activate");
  });

  it("moves between tabs with the arrow keys", async () => {
    mockApi([]);
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.click(screen.getByRole("tab", { name: "Parent" }));
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Staff" })).toHaveFocus();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/keep me signed in/i)).not.toBeInTheDocument();
  });

  it("signs in and goes on to the page that was asked for", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("next=/account/security") as unknown as ReturnType<typeof useSearchParams>,
    );
    const fetchMock = mockApi([["POST", "/api/auth/login", 200, { status: "signed_in", user: {} }]]);
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.type(screen.getByLabelText(/mobile number/i), "024 123 4567");
    await user.type(screen.getByLabelText(/^password/i), "correct horse battery");
    await user.click(screen.getByLabelText(/keep me signed in/i));
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(useRouter().replace).toHaveBeenCalledWith("/account/security"));
    expect(bodyOf(fetchMock, "POST", "/api/auth/login")).toEqual({
      kind: "parent",
      identifier: "024 123 4567",
      password: "correct horse battery",
      remember: true,
    });
  });

  it("skips the form when already signed in", async () => {
    mockApi([["GET", "/api/auth/me", 200, { id: 1 }]]);
    render(<SignInForm />);
    await waitFor(() => expect(useRouter().replace).toHaveBeenCalledWith("/account"));
  });

  it("shows the server's message and moves focus to it", async () => {
    mockApi([["POST", "/api/auth/login", 400, INVALID]]);
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.type(screen.getByLabelText(/mobile number/i), "024 123 4567");
    await user.type(screen.getByLabelText(/^password/i), "wrong password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Incorrect username or password.");
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it("needs both fields before calling the server", async () => {
    const fetchMock = mockApi([]);
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter your mobile number and password.");
    expect(bodyOf(fetchMock, "POST", "/api/auth/login")).toBeUndefined();
  });

  it("asks for the second step when the role needs one", async () => {
    mockApi([["POST", "/api/auth/login", 200, { status: "second_factor", totp_ready: true, sms_available: true }]]);
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.click(screen.getByRole("tab", { name: "Staff" }));
    await user.type(screen.getByLabelText(/username/i), "admin");
    await user.type(screen.getByLabelText(/^password/i), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: /authenticator app/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /text me a code/i })).toBeInTheDocument();
  });
});
```

`frontend/src/components/auth/second-factor.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { SecondFactor } from "./second-factor";

const SETUP = { secret: "JBSWY3DPEHPK3PXP", otpauth_url: "otpauth://totp/x", qr_image: "data:image/svg+xml;base64,PHN2Zy8+" };
const EXPIRED = { code: "second_factor_expired", message: "Too many wrong codes. Please sign in again.", fields: {} };

describe("second factor", () => {
  it("sets up an authenticator app and shows the backup codes once", async () => {
    mockApi([
      ["POST", "/api/auth/second-factor/setup", 200, SETUP],
      ["POST", "/api/auth/second-factor/confirm", 200, { status: "signed_in", user: {}, backup_codes: ["abcd-efgh", "jkmn-pqrs"] }],
    ]);
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<SecondFactor totp_ready={false} sms_available={false} onDone={onDone} onRestart={vi.fn()} />);

    expect(await screen.findByRole("img", { name: /qr code/i })).toBeInTheDocument();
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/6-digit code/i), "123456");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "Save your backup codes" })).toBeInTheDocument();
    expect(screen.getByText("abcd-efgh")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /saved them/i }));
    expect(onDone).toHaveBeenCalled();
  });

  it("falls back to a code by SMS", async () => {
    const fetchMock = mockApi([
      ["POST", "/api/auth/second-factor/sms", 200, { sent: true }],
      ["POST", "/api/auth/second-factor/verify", 200, { status: "signed_in", user: {} }],
    ]);
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<SecondFactor totp_ready sms_available onDone={onDone} onRestart={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /text me a code/i }));
    expect(await screen.findByText(/sent a code to your phone/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/6-digit code/i), "654321");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(bodyOf(fetchMock, "POST", "/api/auth/second-factor/verify")).toEqual({ method: "sms", code: "654321" });
  });

  it("offers a fresh start once the attempt has expired", async () => {
    mockApi([["POST", "/api/auth/second-factor/verify", 429, EXPIRED]]);
    const onRestart = vi.fn();
    const user = userEvent.setup();
    render(<SecondFactor totp_ready sms_available={false} onDone={vi.fn()} onRestart={onRestart} />);

    await user.type(screen.getByLabelText(/6-digit code/i), "000000");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many wrong codes");
    await user.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(onRestart).toHaveBeenCalled();
  });
});
```

In `frontend/vitest.setup.ts`, replace the `next/navigation` mock and extend the `afterEach`:
```ts
vi.mock("next/navigation", () => {
  const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() };
  return {
    usePathname: vi.fn(() => "/"),
    useRouter: vi.fn(() => router), // one stable router, as in Next.js
    useSearchParams: vi.fn(() => new URLSearchParams()),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  };
});
```
In its `afterEach`, add:
```ts
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.mocked(usePathname).mockImplementation(() => "/");
  vi.mocked(useSearchParams).mockImplementation(
    () => new URLSearchParams() as unknown as ReturnType<typeof useSearchParams>,
  );
```
Also add `import { usePathname, useSearchParams } from "next/navigation";`. The `vi.unstubAllGlobals()` here also undoes `vi.stubGlobal("fetch")` from every test.

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend && npx vitest run src/lib src/components/auth`
Expected: FAIL. `deleteJson`, `errorMessage`, `safe-next`, `sign-in-form` and `second-factor` cannot be resolved.

- [ ] **Step 3: Write the library code**

In `frontend/src/lib/enquiry-schema.ts`, change `const GH_MOBILE` to `export const GH_MOBILE`.

In `frontend/src/lib/types.ts`, append:
```ts

export type AccountKind = "staff" | "parent" | "student";

/** GET /api/auth/me (Plan 2). */
export type Me = {
  id: number;
  kind: AccountKind;
  username: string;
  display_name: string;
  roles: string[];
  must_change_password: boolean;
  has_authenticator: boolean;
};

export type SignInResult =
  | { status: "signed_in"; user: Me }
  | { status: "second_factor"; totp_ready: boolean; sms_available: boolean };

export type SessionInfo = {
  id: number;
  device: string;
  ip_address: string | null;
  signed_in_at: string;
  last_seen: string;
  current: boolean;
};
```

`frontend/src/lib/client-api.ts`:
```ts
import type { ApiErrorBody } from "./types";

export const OFFLINE_MESSAGE = "We couldn't reach the school. Check your connection and try again.";

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

/** The server's plain-language message, or the offline message (spec §10). */
export function errorMessage(caught: unknown): string {
  return caught instanceof ApiRequestError && caught.body?.message ? caught.body.message : OFFLINE_MESSAGE;
}

/** The first message for each field of a validation error. */
export function fieldErrors(caught: unknown): Record<string, string> {
  const fields = caught instanceof ApiRequestError ? (caught.body?.fields ?? {}) : {};
  return Object.fromEntries(Object.entries(fields).map(([name, messages]) => [name, messages[0]]));
}

async function handle<T>(response: Response): Promise<T> {
  if (response.ok) return (response.status === 204 ? undefined : await response.json()) as T;
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  throw new ApiRequestError(response.status, body);
}

/** Django's CSRF cookie; GET /api/auth/me hands it out (spec §2.2). */
function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export async function getJson<T>(path: string): Promise<T> {
  return handle<T>(await fetch(path, { headers: { Accept: "application/json" } }));
}

async function send<T>(method: "POST" | "DELETE", path: string, data?: unknown): Promise<T> {
  return handle<T>(
    await fetch(path, {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRFToken": csrfToken() },
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
  );
}

export function postJson<T>(path: string, data?: unknown): Promise<T> {
  return send<T>("POST", path, data);
}

export function deleteJson<T>(path: string): Promise<T> {
  return send<T>("DELETE", path);
}
```

`frontend/src/lib/safe-next.ts`:
```ts
/** Where to go after sign-in: only paths on this site, never another site (open redirect). */
export function safeNext(next: string | null | undefined, fallback = "/account"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
```

- [ ] **Step 4: Write the components**

`frontend/src/components/ui/form-alert.tsx`:
```tsx
"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";

/** A failed submit's message, focused so keyboard and screen-reader users hear it (spec §8.7). */
export function FormAlert({ message, focusKey = 0 }: { message: string | null; focusKey?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message, focusKey]);
  if (!message) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="flex items-start gap-2 rounded-control border border-danger bg-danger/10 p-4 outline-none"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
      <p>{message}</p>
    </div>
  );
}
```

`frontend/src/components/auth/password-input.tsx`:
```tsx
"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";
import { inputClasses } from "@/components/site/field";
import { cn } from "@/lib/cn";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** A password field with a show button. Pasting and password managers work (WCAG 3.3.8). */
export function PasswordInput({ className, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        autoCapitalize="none"
        spellCheck={false}
        className={cn(inputClasses, "pr-14", className)}
      />
      <button
        type="button"
        aria-label="Show password"
        aria-pressed={visible}
        onClick={() => setVisible((value) => !value)}
        className="absolute inset-y-0 right-0 flex w-12 cursor-pointer items-center justify-center rounded-r-control text-ink-muted hover:text-ink"
      >
        {visible ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
      </button>
    </div>
  );
}
```

`frontend/src/components/auth/second-factor.tsx`:
```tsx
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { ApiRequestError, errorMessage, postJson } from "@/lib/client-api";

export type SecondFactorStart = { totp_ready: boolean; sms_available: boolean };
type Props = SecondFactorStart & { onDone: () => void; onRestart: () => void };
type Method = "totp" | "sms" | "backup";
type Setup = { secret: string; otpauth_url: string; qr_image: string };

const HEADINGS: Record<Method, string> = {
  totp: "Enter the code from your authenticator app",
  sms: "Enter the code we sent by SMS",
  backup: "Enter a backup code",
};

/** The second sign-in step for Administrators, Head Teachers, Accountants and the Proprietor (spec §5.3). */
export function SecondFactor({ totp_ready, sms_available, onDone, onRestart }: Props) {
  const [method, setMethod] = useState<Method>("totp");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const settingUp = method === "totp" && !totp_ready;

  // First sign-in: fetch a new key and QR code. State is only set when the request settles.
  useEffect(() => {
    if (!settingUp || setup) return;
    let cancelled = false;
    postJson<Setup>("/api/auth/second-factor/setup").then(
      (data) => {
        if (!cancelled) setSetup(data);
      },
      (caught: unknown) => {
        if (cancelled) return;
        setError(errorMessage(caught));
        setAttempt((count) => count + 1);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [settingUp, setup]);

  // Each new step's heading takes focus so screen readers announce it.
  useEffect(() => {
    headingRef.current?.focus();
  }, [method, backupCodes]);

  function fail(message: string) {
    setError(message);
    setAttempt((count) => count + 1);
  }

  function choose(next: Method) {
    setMethod(next);
    setCode("");
    setError(null);
    setNotice(null);
  }

  async function sendSms() {
    choose("sms");
    try {
      await postJson("/api/auth/second-factor/sms");
      setNotice("We've sent a code to your phone. It expires in 10 minutes.");
    } catch (caught) {
      fail(errorMessage(caught));
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = code.replace(/\s/g, "");
    if (!value) return fail("Enter the code.");
    setBusy(true);
    try {
      if (settingUp) {
        const result = await postJson<{ backup_codes: string[] }>("/api/auth/second-factor/confirm", { code: value });
        setBackupCodes(result.backup_codes);
      } else {
        await postJson("/api/auth/second-factor/verify", { method, code: value });
        onDone();
      }
    } catch (caught) {
      fail(errorMessage(caught));
      if (caught instanceof ApiRequestError && caught.body?.code === "second_factor_expired") setExpired(true);
    } finally {
      setBusy(false);
    }
  }

  if (backupCodes) {
    return (
      <div className="space-y-5">
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
          Save your backup codes
        </h2>
        <p>
          If you lose your phone, each code lets you sign in once. Print them or write them down and keep them
          somewhere safe. They won&apos;t be shown again.
        </p>
        <ul aria-label="Backup codes" className="grid grid-cols-2 gap-2 font-mono text-lg">
          {backupCodes.map((item) => (
            <li key={item} className="rounded-control bg-ink/5 px-3 py-2 text-center">
              {item}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => window.print()}>
            Print codes
          </Button>
          <Button onClick={onDone}>I&apos;ve saved them, continue</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
          {settingUp ? "Set up your authenticator app" : HEADINGS[method]}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Your role needs a second step at sign-in, to keep pupils&apos; records safe.
        </p>
      </div>

      {settingUp && (
        <ol className="list-decimal space-y-3 pl-5">
          <li>Install Google Authenticator or Microsoft Authenticator on your phone.</li>
          <li>
            Scan this QR code with the app.
            {setup ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data: URI, nothing to optimise
              <img
                src={setup.qr_image}
                alt="QR code for your authenticator app"
                width={176}
                height={176}
                className="mt-3 rounded-control bg-white p-2"
              />
            ) : (
              <span aria-hidden className="mt-3 block size-44 animate-pulse rounded-control bg-ink/10" />
            )}
            {setup && (
              <span className="mt-2 block text-sm">
                Can&apos;t scan it? Type this key into the app instead:{" "}
                <code data-testid="manual-key" className="font-mono font-semibold break-all">
                  {setup.secret}
                </code>
              </span>
            )}
          </li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
      )}

      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}

      <form noValidate onSubmit={onSubmit} className="space-y-5">
        <FormAlert message={error} focusKey={attempt} />
        <Field id="second-factor-code" label={method === "backup" ? "Backup code" : "6-digit code"} required>
          {(props) => (
            <input
              {...props}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode={method === "backup" ? "text" : "numeric"}
              autoComplete="one-time-code"
              autoCapitalize="none"
              spellCheck={false}
              className={inputClasses}
            />
          )}
        </Field>
        {expired ? (
          <Button size="lg" className="w-full" onClick={onRestart}>
            Sign in again
          </Button>
        ) : (
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "Checking…" : "Continue"}
          </Button>
        )}
      </form>

      {!expired && (
        <div className="flex flex-col items-start text-sm">
          {method !== "totp" && (
            <button type="button" onClick={() => choose("totp")} className="link min-h-11 cursor-pointer">
              {totp_ready ? "Use my authenticator app" : "Set up an authenticator app"}
            </button>
          )}
          {sms_available && (
            <button type="button" onClick={sendSms} className="link min-h-11 cursor-pointer">
              {method === "sms" ? "Send a new code" : "Text me a code instead"}
            </button>
          )}
          {totp_ready && method !== "backup" && (
            <button type="button" onClick={() => choose("backup")} className="link min-h-11 cursor-pointer">
              Use a backup code
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

`frontend/src/components/auth/sign-in-form.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { errorMessage, getJson, postJson } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { safeNext } from "@/lib/safe-next";
import type { AccountKind, SignInResult } from "@/lib/types";
import { PasswordInput } from "./password-input";
import { SecondFactor, type SecondFactorStart } from "./second-factor";

type Tab = { kind: AccountKind; label: string; identifier: string; hint?: string; inputMode: "tel" | "numeric" | "text" };

const TABS: Tab[] = [
  { kind: "parent", label: "Parent", identifier: "Mobile number", hint: "The number the school has for you, e.g. 024 123 4567.", inputMode: "tel" },
  { kind: "student", label: "Student", identifier: "Student ID", hint: "Your 7-digit Student ID, e.g. 26-0147-3.", inputMode: "numeric" },
  { kind: "staff", label: "Staff", identifier: "Username", inputMode: "text" },
];

/** One sign-in page with Parent, Student and Staff tabs (spec §5.1). */
export function SignInForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [kind, setKind] = useState<AccountKind>("parent");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<SecondFactorStart | null>(null);
  const tab = TABS.find((item) => item.kind === kind) ?? TABS[0];

  // Already signed in? Go straight on. The request also gives the browser its CSRF cookie.
  useEffect(() => {
    let cancelled = false;
    getJson("/api/auth/me").then(
      () => {
        if (!cancelled) router.replace(next);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [router, next]);

  function fail(message: string) {
    setError(message);
    setAttempt((count) => count + 1);
  }

  function selectTab(nextKind: AccountKind) {
    setKind(nextKind);
    setIdentifier("");
    setError(null);
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const target = TABS[(index + step + TABS.length) % TABS.length];
    selectTab(target.kind);
    document.getElementById(`sign-in-tab-${target.kind}`)?.focus();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!identifier.trim() || !password) return fail(`Enter your ${tab.identifier.toLowerCase()} and password.`);
    setBusy(true);
    try {
      const result = await postJson<SignInResult>("/api/auth/login", {
        kind,
        identifier,
        password,
        remember: kind === "parent" && remember,
      });
      if (result.status === "second_factor") setPending(result);
      else router.replace(next);
    } catch (caught) {
      fail(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    return (
      <SecondFactor
        {...pending}
        onDone={() => router.replace(next)}
        onRestart={() => {
          setPending(null);
          setPassword("");
        }}
      />
    );
  }

  return (
    <div>
      <div role="tablist" aria-label="I am a" className="grid grid-cols-3 gap-1 rounded-control bg-ink/5 p-1">
        {TABS.map((item, index) => {
          const selected = item.kind === kind;
          return (
            <button
              key={item.kind}
              id={`sign-in-tab-${item.kind}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="sign-in-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(item.kind)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              className={cn(
                "press min-h-11 cursor-pointer rounded-[10px] text-sm font-semibold",
                selected ? "bg-card text-ink shadow-elev-1" : "text-ink-muted hover:text-ink",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <form
        id="sign-in-panel"
        role="tabpanel"
        aria-labelledby={`sign-in-tab-${kind}`}
        noValidate
        onSubmit={onSubmit}
        className="mt-6 space-y-5"
      >
        <FormAlert message={error} focusKey={attempt} />
        <Field id="sign-in-identifier" label={tab.identifier} hint={tab.hint} required>
          {(props) => (
            <input
              {...props}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              type={kind === "parent" ? "tel" : "text"}
              inputMode={tab.inputMode}
              autoComplete={kind === "parent" ? "tel" : "username"}
              autoCapitalize="none"
              spellCheck={false}
              className={inputClasses}
            />
          )}
        </Field>
        <Field id="sign-in-password" label="Password" required>
          {(props) => (
            <PasswordInput
              {...props}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          )}
        </Field>
        {kind === "parent" && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="size-5 accent-primary"
            />
            Keep me signed in on this phone
          </label>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-center text-sm">
          {kind === "parent" && (
            <Link href="/activate" className="link">
              First time, or forgot your password?
            </Link>
          )}
          {kind === "student" && "Forgot your password? Ask your class teacher."}
          {kind === "staff" && "Forgot your password? Ask the school administrator."}
        </p>
      </form>
    </div>
  );
}
```

`frontend/src/app/(auth)/layout.tsx`:
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLink } from "@/components/brand/brand-link";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { getSite } from "@/lib/api";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const site = await getSite();
  return (
    <div className="bg-brand-mesh flex min-h-dvh flex-col items-center px-4 py-8 sm:justify-center">
      <div className="on-dark mb-6 text-white">
        <BrandLink name={site.school.name} />
      </div>
      <main id="main" className="glass-frosted animate-rise w-full max-w-md rounded-card p-6 shadow-elev-2 sm:p-8">
        {children}
      </main>
      <div className="on-dark mt-6 flex w-full max-w-md flex-wrap items-center justify-between gap-3 text-sm text-white">
        <Link href="/" className="link">
          Back to the website
        </Link>
        <ThemeToggle className="glass-clear" />
      </div>
    </div>
  );
}
```

`frontend/src/app/(auth)/sign-in/page.tsx`:
```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-ink-muted">For parents, pupils and staff of the school.</p>
      <div className="mt-6">
        <Suspense>
          <SignInForm />
        </Suspense>
      </div>
    </>
  );
}
```

- [ ] **Step 5: Run the tests and checks**

Run: `cd frontend && npm test && npm run lint && npm run typecheck`
Expected: all tests pass, and lint and typecheck are clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src frontend/vitest.setup.ts
git commit -m "Add the sign-in page with Parent, Student and Staff tabs and the second-factor step"
```

---

### Task 9: Frontend: parent activation, the portal frame and the Account page

**Files:**
- Create: `frontend/src/lib/identifiers.ts`, `frontend/src/lib/identifiers.test.ts`, `frontend/src/components/auth/activate-form.tsx`, `frontend/src/components/auth/activate-form.test.tsx`, `frontend/src/app/(auth)/activate/page.tsx`, `frontend/src/components/portal/auth-provider.tsx`, `frontend/src/components/portal/auth-provider.test.tsx`, `frontend/src/components/portal/portal-shell.tsx`, `frontend/src/components/portal/account-view.tsx`, `frontend/src/components/portal/account-view.test.tsx`, `frontend/src/app/(portal)/layout.tsx`, `frontend/src/app/(portal)/account/page.tsx`
- Modify: `frontend/src/lib/dates.ts`, `frontend/src/lib/dates.test.ts`, `frontend/src/app/(public)/layout.tsx`, `frontend/.env.local.example`

**Interfaces:**
- Consumes: the Task 5 and Task 7 endpoints, `FormAlert`, `PasswordInput`, `client-api`, and `mockApi` / `bodyOf`.
- Produces:
  - `<AuthProvider>` and `useAuth() -> { me, refresh, signOut }`. Plan 4 builds role homes on these.
  - `<PortalShell schoolName>`.
  - `formatPhoneLocal`, `formatStudentId`, `formatIdentifier(me)`, `formatDateTime(iso)`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/identifiers.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { formatIdentifier, formatPhoneLocal, formatStudentId } from "./identifiers";

describe("identifiers", () => {
  it("writes Ghana numbers the local way", () => {
    expect(formatPhoneLocal("+233241234567")).toBe("024 123 4567");
    expect(formatPhoneLocal("not a number")).toBe("not a number");
  });

  it("writes Student IDs with dashes", () => {
    expect(formatStudentId("2601473")).toBe("26-0147-3");
    expect(formatStudentId("123")).toBe("123");
  });

  it("picks the right format for each kind of account", () => {
    expect(formatIdentifier({ kind: "parent", username: "+233241234567" })).toBe("024 123 4567");
    expect(formatIdentifier({ kind: "student", username: "2601473" })).toBe("26-0147-3");
    expect(formatIdentifier({ kind: "staff", username: "k.mensah" })).toBe("k.mensah");
  });
});
```

In `frontend/src/lib/dates.test.ts`, add `formatDateTime` to the import and add inside the `describe`:
```ts
  it("formats a moment with its time in Accra", () => {
    expect(formatDateTime("2026-10-09T14:05:00Z")).toBe("9 Oct 2026, 14:05");
  });
```

`frontend/src/components/auth/activate-form.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { describe, expect, it } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { ActivateForm } from "./activate-form";

const SENT = { message: "If this number is registered, a code has been sent." };

describe("parent activation", () => {
  it("requests a code, then sets the password and signs in", async () => {
    const fetchMock = mockApi([
      ["POST", "/api/auth/parent/request-code", 200, SENT],
      ["POST", "/api/auth/parent/set-password", 200, { status: "signed_in", user: {} }],
    ]);
    const user = userEvent.setup();
    render(<ActivateForm />);
    await user.type(screen.getByLabelText(/mobile number/i), "024 123 4567");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText(SENT.message)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/code from the sms/i), "123456");
    await user.type(screen.getByLabelText(/^new password/i), "our family passphrase");
    await user.type(screen.getByLabelText(/type it again/i), "our family passphrase");
    await user.click(screen.getByRole("button", { name: /set password/i }));

    await waitFor(() => expect(useRouter().replace).toHaveBeenCalledWith("/account"));
    expect(bodyOf(fetchMock, "POST", "/api/auth/parent/set-password")).toEqual({
      phone: "024 123 4567",
      code: "123456",
      password: "our family passphrase",
      remember: false,
    });
  });

  it("checks the number before sending anything", async () => {
    const fetchMock = mockApi([]);
    const user = userEvent.setup();
    render(<ActivateForm />);
    await user.type(screen.getByLabelText(/mobile number/i), "12345");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText("Enter a Ghana mobile number, e.g. 024 123 4567.")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", "/api/auth/parent/request-code")).toBeUndefined();
  });

  it("shows the server's field errors under the fields", async () => {
    mockApi([
      ["POST", "/api/auth/parent/request-code", 200, SENT],
      [
        "POST",
        "/api/auth/parent/set-password",
        400,
        { code: "validation_error", message: "Please check the highlighted fields.", fields: { password: ["This password is too common."] } },
      ],
    ]);
    const user = userEvent.setup();
    render(<ActivateForm />);
    await user.type(screen.getByLabelText(/mobile number/i), "0241234567");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    await user.type(await screen.findByLabelText(/code from the sms/i), "123456");
    await user.type(screen.getByLabelText(/^new password/i), "password1234");
    await user.type(screen.getByLabelText(/type it again/i), "password1234");
    await user.click(screen.getByRole("button", { name: /set password/i }));
    expect(await screen.findByText("This password is too common.")).toBeInTheDocument();
  });
});
```

`frontend/src/components/portal/auth-provider.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { usePathname, useRouter } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { mockApi } from "@/test/http";
import { AuthProvider } from "./auth-provider";

const ME = { id: 1, kind: "parent", username: "+233241234567", display_name: "Ama Mensah", roles: ["Parent"], must_change_password: false, has_authenticator: false };
const SIGNED_OUT = { code: "not_authenticated", message: "Please sign in.", fields: {} };

describe("AuthProvider", () => {
  it("shows the page to signed-in users", async () => {
    mockApi([["GET", "/api/auth/me", 200, ME]]);
    render(<AuthProvider><p>private</p></AuthProvider>);
    expect(await screen.findByText("private")).toBeInTheDocument();
  });

  it("sends signed-out visitors to sign in, remembering where they were going", async () => {
    vi.mocked(usePathname).mockReturnValue("/account");
    mockApi([["GET", "/api/auth/me", 403, SIGNED_OUT]]);
    render(<AuthProvider><p>private</p></AuthProvider>);
    await waitFor(() => expect(useRouter().replace).toHaveBeenCalledWith("/sign-in?next=%2Faccount"));
    expect(screen.queryByText("private")).not.toBeInTheDocument();
  });

  it("keeps users who must change their password on the Account page", async () => {
    vi.mocked(usePathname).mockReturnValue("/somewhere-else");
    mockApi([["GET", "/api/auth/me", 200, { ...ME, must_change_password: true }]]);
    render(<AuthProvider><p>private</p></AuthProvider>);
    await waitFor(() => expect(useRouter().replace).toHaveBeenCalledWith("/account"));
    expect(screen.queryByText("private")).not.toBeInTheDocument();
  });

  it("offers a retry when the school can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<AuthProvider><p>private</p></AuthProvider>);
    expect(await screen.findByRole("heading", { name: /couldn't reach the school/i })).toBeInTheDocument();
  });
});
```

`frontend/src/components/portal/account-view.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { AccountView } from "./account-view";
import { AuthProvider } from "./auth-provider";

const ME = { id: 1, kind: "parent", username: "+233241234567", display_name: "Ama Mensah", roles: ["Parent"], must_change_password: false, has_authenticator: false };
const SESSIONS = [
  { id: 1, device: "Chrome on Windows", ip_address: "41.66.1.2", signed_in_at: "2026-10-09T08:00:00Z", last_seen: "2026-10-09T14:05:00Z", current: true },
  { id: 7, device: "Chrome on Android", ip_address: null, signed_in_at: "2026-10-01T08:00:00Z", last_seen: "2026-10-08T19:30:00Z", current: false },
];

function renderAccount(me: object = ME, extra: Parameters<typeof mockApi>[0] = []) {
  vi.mocked(usePathname).mockReturnValue("/account");
  const fetchMock = mockApi([["GET", "/api/auth/me", 200, me], ["GET", "/api/auth/sessions", 200, SESSIONS], ...extra]);
  render(
    <AuthProvider>
      <AccountView />
    </AuthProvider>,
  );
  return fetchMock;
}

describe("Account page", () => {
  it("shows the profile with the phone number written the local way", async () => {
    renderAccount();
    expect(await screen.findByRole("heading", { name: "Your account" })).toBeInTheDocument();
    expect(screen.getByText("024 123 4567")).toBeInTheDocument();
    expect(screen.getByText("Parent")).toBeInTheDocument();
  });

  it("lists signed-in devices and signs out another one", async () => {
    const fetchMock = renderAccount(ME, [["DELETE", "/api/auth/sessions/7", 204]]);
    const user = userEvent.setup();
    expect(await screen.findByText("This device")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign out Chrome on Android" }));
    await waitFor(() => expect(screen.queryByText("Chrome on Android")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/sessions/7", expect.objectContaining({ method: "DELETE" }));
  });

  it("asks a new pupil to choose a password", async () => {
    renderAccount({ ...ME, kind: "student", username: "2601473", roles: ["Student"], must_change_password: true });
    expect(await screen.findByText(/choose your own password/i)).toBeInTheDocument();
    expect(screen.getByText("26-0147-3")).toBeInTheDocument();
  });

  it("checks the new password was typed the same twice", async () => {
    const fetchMock = renderAccount();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Change password" });
    await user.type(screen.getByLabelText(/current password/i), "old passphrase here");
    await user.type(screen.getByLabelText(/^new password/i), "a brand new passphrase");
    await user.type(screen.getByLabelText(/type it again/i), "something else entirely");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("The two passwords don't match.")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", "/api/auth/password")).toBeUndefined();
  });

  it("changes the password and says so", async () => {
    const fetchMock = renderAccount(ME, [["POST", "/api/auth/password", 200, ME], ["GET", "/api/auth/me", 200, ME]]);
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Change password" });
    await user.type(screen.getByLabelText(/current password/i), "old passphrase here");
    await user.type(screen.getByLabelText(/^new password/i), "a brand new passphrase");
    await user.type(screen.getByLabelText(/type it again/i), "a brand new passphrase");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText(/password changed/i)).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", "/api/auth/password")).toEqual({
      current_password: "old passphrase here",
      new_password: "a brand new passphrase",
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend && npx vitest run src/lib src/components/auth src/components/portal`
Expected: FAIL. `identifiers`, `formatDateTime`, `activate-form`, `auth-provider` and `account-view` cannot be resolved.

- [ ] **Step 3: Write the helpers**

`frontend/src/lib/identifiers.ts`:
```ts
import type { Me } from "./types";

/** +233241234567 → 024 123 4567 (spec §3.4). */
export function formatPhoneLocal(e164: string): string {
  if (!/^\+233\d{9}$/.test(e164)) return e164;
  const local = `0${e164.slice(4)}`;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/** 2601473 → 26-0147-3 (spec §3.3). */
export function formatStudentId(id: string): string {
  return /^\d{7}$/.test(id) ? `${id.slice(0, 2)}-${id.slice(2, 6)}-${id.slice(6)}` : id;
}

export function formatIdentifier(me: Pick<Me, "kind" | "username">): string {
  if (me.kind === "parent") return formatPhoneLocal(me.username);
  if (me.kind === "student") return formatStudentId(me.username);
  return me.username;
}
```

In `frontend/src/lib/dates.ts`, append:
```ts

const DISPLAY_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Accra",
});

export function formatDateTime(iso: string): string {
  return DISPLAY_TIME.format(new Date(iso));
}
```

- [ ] **Step 4: Write the activation form and page**

`frontend/src/components/auth/activate-form.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { errorMessage, fieldErrors, getJson, postJson } from "@/lib/client-api";
import { GH_MOBILE } from "@/lib/enquiry-schema";
import { PasswordInput } from "./password-input";

const CHECK_FORM = "Please check the highlighted fields.";
const PHONE_MESSAGE = "Enter a Ghana mobile number, e.g. 024 123 4567.";
const PASSWORD_HINT = "At least 8 characters. A short sentence is easy to remember.";

/** First-time activation and forgotten passwords for parents, by SMS code (spec §5.2). */
export function ActivateForm() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Gives the browser its CSRF cookie before the first POST.
  useEffect(() => {
    getJson("/api/auth/me").catch(() => undefined);
  }, []);

  function fail(message: string, fields: Record<string, string> = {}) {
    setError(message);
    setErrors(fields);
    setAttempt((count) => count + 1);
  }

  async function requestCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!GH_MOBILE.test(phone.replace(/[\s-]/g, ""))) return fail(CHECK_FORM, { phone: PHONE_MESSAGE });
    setBusy(true);
    try {
      const result = await postJson<{ message: string }>("/api/auth/parent/request-code", { phone });
      setNotice(result.message);
      setError(null);
      setErrors({});
      setStep("code");
    } catch (caught) {
      fail(errorMessage(caught), fieldErrors(caught));
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (!/^\d{6}$/.test(code.trim())) problems.code = "Enter the 6-digit code from the SMS.";
    if (password.length < 8) problems.password = PASSWORD_HINT;
    else if (password !== confirm) problems.confirm = "The two passwords don't match.";
    if (Object.keys(problems).length > 0) return fail(CHECK_FORM, problems);
    setBusy(true);
    try {
      await postJson("/api/auth/parent/set-password", { phone, code: code.trim(), password, remember });
      router.replace("/account");
    } catch (caught) {
      fail(errorMessage(caught), fieldErrors(caught));
    } finally {
      setBusy(false);
    }
  }

  if (step === "phone") {
    return (
      <form noValidate onSubmit={requestCode} className="space-y-5">
        <p>Enter the mobile number the school has for you. We&apos;ll text you a 6-digit code.</p>
        <FormAlert message={error} focusKey={attempt} />
        <Field id="activate-phone" label="Mobile number" required error={errors.phone}>
          {(props) => (
            <input
              {...props}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className={inputClasses}
            />
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Sending…" : "Send code"}
        </Button>
        <p className="text-center text-sm">
          <Link href="/sign-in" className="link">
            Back to sign in
          </Link>
        </p>
      </form>
    );
  }

  return (
    <form noValidate onSubmit={savePassword} className="space-y-5">
      {notice && (
        <p role="status" className="rounded-control bg-success/10 p-4">
          {notice}
        </p>
      )}
      <FormAlert message={error} focusKey={attempt} />
      <Field id="activate-code" label="Code from the SMS" required error={errors.code}>
        {(props) => (
          <input
            {...props}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            className={inputClasses}
          />
        )}
      </Field>
      <Field id="activate-password" label="New password" hint={PASSWORD_HINT} required error={errors.password}>
        {(props) => (
          <PasswordInput {...props} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
        )}
      </Field>
      <Field id="activate-confirm" label="Type it again" required error={errors.confirm}>
        {(props) => (
          <PasswordInput {...props} value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" />
        )}
      </Field>
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
          className="size-5 accent-primary"
        />
        Keep me signed in on this phone
      </label>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? "Saving…" : "Set password and sign in"}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <button type="button" className="link min-h-11 cursor-pointer" onClick={() => requestCode()}>
          Send a new code
        </button>
        <button
          type="button"
          className="link min-h-11 cursor-pointer"
          onClick={() => {
            setStep("phone");
            setNotice(null);
            setError(null);
          }}
        >
          Use a different number
        </button>
      </div>
    </form>
  );
}
```

`frontend/src/app/(auth)/activate/page.tsx`:
```tsx
import type { Metadata } from "next";
import { ActivateForm } from "@/components/auth/activate-form";

export const metadata: Metadata = { title: "Set your password" };

export default function ActivatePage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">First time, or forgot your password?</h1>
      <div className="mt-4">
        <ActivateForm />
      </div>
    </>
  );
}
```

- [ ] **Step 5: Write the portal frame and the Account page**

`frontend/src/components/portal/auth-provider.tsx`:
```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ApiRequestError, getJson, postJson } from "@/lib/client-api";
import type { Me } from "@/lib/types";

type AuthValue = { me: Me; refresh: () => Promise<void>; signOut: () => Promise<void> };
type State = { status: "loading" } | { status: "signed_in"; me: Me } | { status: "signed_out" } | { status: "offline" };

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth() needs <AuthProvider> above it.");
  return value;
}

function stateFor(caught: unknown): State {
  const signedOut = caught instanceof ApiRequestError && caught.body?.code === "not_authenticated";
  return signedOut ? { status: "signed_out" } : { status: "offline" };
}

/**
 * Loads the signed-in user and sends everyone else to sign in. The server still decides what
 * each user may see (spec §4.2); this only keeps the screens tidy.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getJson<Me>("/api/auth/me").then(
      (me) => {
        if (!cancelled) setState({ status: "signed_in", me });
      },
      (caught: unknown) => {
        if (!cancelled) setState(stateFor(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const signedOut = state.status === "signed_out";
  const mustChangePassword = state.status === "signed_in" && state.me.must_change_password && pathname !== "/account";
  useEffect(() => {
    if (signedOut) router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    else if (mustChangePassword) router.replace("/account");
  }, [signedOut, mustChangePassword, router, pathname]);

  async function refresh() {
    try {
      setState({ status: "signed_in", me: await getJson<Me>("/api/auth/me") });
    } catch (caught) {
      setState(stateFor(caught));
    }
  }

  async function signOut() {
    await postJson("/api/auth/logout").catch(() => undefined);
    router.replace("/sign-in");
  }

  if (state.status === "signed_in" && !mustChangePassword) {
    return <AuthContext value={{ me: state.me, refresh, signOut }}>{children}</AuthContext>;
  }
  if (state.status === "offline") {
    return (
      <Centered>
        <h1 className="text-2xl font-semibold">We couldn&apos;t reach the school</h1>
        <p className="mt-2 text-ink-muted">Check your connection, then try again.</p>
        <Button className="mt-6" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </Centered>
    );
  }
  return (
    <Centered>
      <p role="status" className="text-ink-muted">
        Loading…
      </p>
    </Centered>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      {children}
    </main>
  );
}
```

`frontend/src/components/portal/portal-shell.tsx`:
```tsx
"use client";

import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { BrandLink } from "@/components/brand/brand-link";
import { SkipLink } from "@/components/site/skip-link";
import { Button } from "@/components/ui/button";
import { useAuth } from "./auth-provider";

/** The signed-in frame: brand, who is signed in and Sign out. Plan 4 adds navigation. */
export function PortalShell({ schoolName, children }: { schoolName: string; children: ReactNode }) {
  const { me, signOut } = useAuth();
  return (
    <>
      <SkipLink />
      <header className="glass-frosted sticky top-0 z-30 border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <BrandLink name={schoolName} />
          <div className="flex items-center gap-3">
            <span className="hidden max-w-48 truncate text-sm font-medium md:inline">{me.display_name}</span>
            <Button variant="outline" onClick={signOut} className="px-3">
              <LogOut aria-hidden className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 outline-none sm:px-6">
        {children}
      </main>
    </>
  );
}
```

`frontend/src/components/portal/account-view.tsx`:
```tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/auth/password-input";
import { Field } from "@/components/site/field";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { deleteJson, errorMessage, fieldErrors, getJson, postJson } from "@/lib/client-api";
import { formatDateTime } from "@/lib/dates";
import { formatIdentifier } from "@/lib/identifiers";
import type { SessionInfo } from "@/lib/types";
import { useAuth } from "./auth-provider";

const IDENTIFIER_LABEL = { staff: "Username", parent: "Mobile number", student: "Student ID" } as const;
const CHECK_FORM = "Please check the highlighted fields.";
const PASSWORD_HINT = "At least 8 characters. A short sentence is easy to remember.";

/** Profile, password, signed-in devices and theme (spec §5.6, §7.1). */
export function AccountView() {
  const { me, refresh } = useAuth();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Your account</h1>
        {me.must_change_password && (
          <p role="alert" className="mt-4 rounded-control border border-amber bg-amber/15 p-4">
            Welcome! Please choose your own password before you continue.
          </p>
        )}
      </div>

      <section aria-labelledby="profile-heading" className="surface rounded-card p-6">
        <h2 id="profile-heading" className="text-xl font-semibold">
          Profile
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <Detail term="Name" value={me.display_name} />
          <Detail term={IDENTIFIER_LABEL[me.kind]} value={formatIdentifier(me)} />
          <Detail term={me.roles.length > 1 ? "Roles" : "Role"} value={me.roles.join(", ") || "None yet"} />
        </dl>
      </section>

      <ChangePassword onChanged={refresh} />
      <Sessions />

      <section aria-labelledby="appearance-heading" className="surface rounded-card p-6">
        <h2 id="appearance-heading" className="text-xl font-semibold">
          Appearance
        </h2>
        <ThemeToggle showLabels className="mt-4 bg-ink/5" />
      </section>
    </div>
  );
}

function Detail({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-ink-muted">{term}</dt>
      <dd className="mt-0.5 font-medium break-words">{value}</dd>
    </div>
  );
}

function ChangePassword({ onChanged }: { onChanged: () => Promise<void> }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  function fail(message: string, fields: Record<string, string> = {}) {
    setError(message);
    setErrors(fields);
    setAttempt((count) => count + 1);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(false);
    const problems: Record<string, string> = {};
    if (!current) problems.current_password = "Enter your current password.";
    if (next.length < 8) problems.new_password = PASSWORD_HINT;
    else if (next !== confirm) problems.confirm = "The two passwords don't match.";
    if (Object.keys(problems).length > 0) return fail(CHECK_FORM, problems);
    setBusy(true);
    try {
      await postJson("/api/auth/password", { current_password: current, new_password: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      setError(null);
      setErrors({});
      setDone(true);
      await onChanged();
    } catch (caught) {
      fail(errorMessage(caught), fieldErrors(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="password-heading" className="surface rounded-card p-6">
      <h2 id="password-heading" className="text-xl font-semibold">
        Change password
      </h2>
      <p className="mt-1 text-sm text-ink-muted">This signs you out on every other device.</p>
      <form noValidate onSubmit={onSubmit} className="mt-5 max-w-md space-y-5">
        {done && (
          <p role="status" className="rounded-control bg-success/10 p-4">
            Password changed. You&apos;ve been signed out everywhere else.
          </p>
        )}
        <FormAlert message={error} focusKey={attempt} />
        <Field id="current-password" label="Current password" required error={errors.current_password}>
          {(props) => (
            <PasswordInput {...props} value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" />
          )}
        </Field>
        <Field id="new-password" label="New password" hint={PASSWORD_HINT} required error={errors.new_password}>
          {(props) => (
            <PasswordInput {...props} value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" />
          )}
        </Field>
        <Field id="confirm-password" label="Type it again" required error={errors.confirm}>
          {(props) => (
            <PasswordInput {...props} value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" />
          )}
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Change password"}
        </Button>
      </form>
    </section>
  );
}

function Sessions() {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<SessionInfo[]>("/api/auth/sessions").then(
      (rows) => {
        if (!cancelled) setSessions(rows);
      },
      (caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOutSession(session: SessionInfo) {
    try {
      await deleteJson(`/api/auth/sessions/${session.id}`);
      setSessions((rows) => rows?.filter((row) => row.id !== session.id) ?? null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <section aria-labelledby="sessions-heading" className="surface rounded-card p-6">
      <h2 id="sessions-heading" className="text-xl font-semibold">
        Where you&apos;re signed in
      </h2>
      {error && (
        <p role="alert" className="mt-4 text-danger">
          {error}
        </p>
      )}
      {sessions === null && !error && <p className="mt-4 text-ink-muted">Loading…</p>}
      {sessions && (
        <ul className="mt-4 divide-y divide-line">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">
                  {session.device}
                  {session.current && (
                    <span className="ml-2 rounded-full bg-ink/5 px-2 py-0.5 text-xs font-semibold">This device</span>
                  )}
                </p>
                <p className="text-sm text-ink-muted">
                  Last active {formatDateTime(session.last_seen)}
                  {session.ip_address ? ` · ${session.ip_address}` : ""}
                </p>
              </div>
              {!session.current && (
                <Button variant="outline" onClick={() => signOutSession(session)} aria-label={`Sign out ${session.device}`}>
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

`frontend/src/app/(portal)/layout.tsx`:
```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/portal/auth-provider";
import { PortalShell } from "@/components/portal/portal-shell";
import { getSite } from "@/lib/api";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const site = await getSite();
  return (
    <AuthProvider>
      <PortalShell schoolName={site.school.name}>{children}</PortalShell>
    </AuthProvider>
  );
}
```

`frontend/src/app/(portal)/account/page.tsx`:
```tsx
import type { Metadata } from "next";
import { AccountView } from "@/components/portal/account-view";

export const metadata: Metadata = { title: "Your account" };

export default function AccountPage() {
  return <AccountView />;
}
```

In `frontend/src/app/(public)/layout.tsx`, delete the `const portalUrl = …` line and pass `portalUrl="/sign-in"` to `<Header>`. The portal exists now, so the button is always shown.

In `frontend/.env.local.example`, delete the two `NEXT_PUBLIC_PORTAL_URL` lines.

- [ ] **Step 6: Run the tests and checks**

Run: `cd frontend && npm test && npm run lint && npm run typecheck`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src frontend/.env.local.example
git commit -m "Add parent activation, the portal frame and the Account page"
```

---

### Task 10: Browser tests for sign-in, plus docs

**Files:**
- Create: `frontend/e2e/accounts.json`, `frontend/e2e/totp.ts`, `frontend/e2e/sign-in.spec.ts`
- Modify: `frontend/e2e/serve.mjs`, `.gitignore`, `README.md`

**Interfaces:**
- Consumes: everything above, running through the real Next.js proxy.

- [ ] **Step 1: Write the browser tests and their accounts**

`frontend/e2e/accounts.json`:
```json
{
  "password": "e2e only passphrase 2026",
  "staff": { "phone": "e2e-admin-phone", "desktop": "e2e-admin-desktop" },
  "parents": { "phone": "0241234561", "desktop": "0241234562" }
}
```

`frontend/e2e/totp.ts`:
```ts
import { createHmac } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(secret: string): Buffer {
  let bits = "";
  for (const char of secret.replace(/=+$/, "").toUpperCase()) {
    bits += ALPHABET.indexOf(char).toString(2).padStart(5, "0");
  }
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
}

/** The RFC 6238 code an authenticator app would show right now. */
export function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const digest = createHmac("sha1", base32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0xf;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}
```

`frontend/e2e/sign-in.spec.ts`:
```ts
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import accounts from "./accounts.json";
import { expectNoAccessibilityViolations } from "./axe";
import { totp } from "./totp";

type Project = keyof typeof accounts.staff;
const OUTBOX = path.resolve(process.cwd(), "../backend/e2e-sms.jsonl");

function lastCodeTo(e164: string): string {
  const messages = fs
    .readFileSync(OUTBOX, "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { to: string; body: string });
  const message = messages.reverse().find((item) => item.to === e164);
  return message?.body.match(/\d{6}/)?.[0] ?? "";
}

async function expectAccessibleInBothThemes(page: Page) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await expectNoAccessibilityViolations(page);
  }
}

test("the sign-in page is accessible in light and dark", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expectAccessibleInBothThemes(page);
});

test("a wrong password gets the one generic message", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Staff" }).click();
  await page.getByLabel(/username/i).fill("nobody.here");
  await page.getByLabel(/^password/i).fill("not the password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Incorrect username or password.");
});

test("an administrator sets up the second factor at first sign-in", async ({ page }, testInfo) => {
  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Staff" }).click();
  await page.getByLabel(/username/i).fill(accounts.staff[testInfo.project.name as Project]);
  await page.getByLabel(/^password/i).fill(accounts.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Set up your authenticator app" })).toBeVisible();
  const secret = (await page.getByTestId("manual-key").textContent())?.trim() ?? "";
  await page.getByLabel(/6-digit code/i).fill(totp(secret));
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Save your backup codes" })).toBeVisible();
  await page.getByRole("button", { name: /saved them/i }).click();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expectAccessibleInBothThemes(page);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in/);
});

test("a parent activates their account with an SMS code", async ({ page }, testInfo) => {
  const local = accounts.parents[testInfo.project.name as Project];
  await page.goto("/sign-in");
  await page.getByRole("link", { name: /first time/i }).click();
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
```

- [ ] **Step 2: Make the browser-test server create the accounts**

In `frontend/e2e/serve.mjs`:
- After the `npm` constant, add:
```js
const accounts = JSON.parse(fs.readFileSync(path.join(here, "accounts.json"), "utf-8"));
```
- Add these two entries to `djangoEnv`:
```js
  SMS_FILE_PATH: path.join(backend, "e2e-sms.jsonl"),
  DJANGO_CSRF_TRUSTED_ORIGINS: "http://127.0.0.1:3100,http://localhost:3100",
```
- After the `fs.rmSync(djangoEnv.DJANGO_MEDIA_ROOT, …)` line, add `fs.rmSync(djangoEnv.SMS_FILE_PATH, { force: true });`.
- After the `seed_website` line, add:
```js
// Test accounts. No shell, so names and passwords with spaces arrive intact.
const createUser = (...args) =>
  run(python, ["manage.py", "create_user", ...args], { cwd: backend, env: djangoEnv, shell: false });
for (const [project, username] of Object.entries(accounts.staff)) {
  await createUser("--kind", "staff", "--username", username, "--name", `Esi Admin ${project}`, "--role", "Administrator", "--password", accounts.password);
}
for (const [project, phone] of Object.entries(accounts.parents)) {
  await createUser("--kind", "parent", "--username", phone, "--name", `Ama Mensah ${project}`);
}
```

In `.gitignore`, add `backend/e2e-sms.jsonl` under `backend/e2e-media/`.

- [ ] **Step 3: Run the browser tests**

Run: `cd frontend && npm run e2e`
Expected: all specs pass in both projects (phone 375px, desktop 1440px), including the four new sign-in tests.

- [ ] **Step 4: Document sign-in for the owner**

In `README.md`, add a section "Accounts and sign-in":
```markdown
## Accounts and sign-in

- Create the first Administrator (you will be asked for a password):
  `cd backend && .venv/Scripts/python manage.py create_user --kind staff --username admin --name "Your Name" --role Administrator --phone 024xxxxxxx`
- At their first sign-in, Administrators, Head Teachers, Accountants and the Proprietor set up an
  authenticator app (Google or Microsoft Authenticator) and save 10 backup codes.
- If the only Administrator loses their phone: `manage.py reset_second_factor admin`.
- Parents are created awaiting activation. They choose "First time, or forgot your password?" on the
  sign-in page and get a code by SMS. In development the code is printed in the Django log.
```

- [ ] **Step 5: Run every check and commit**

Run: `scripts/check.sh` and then `WITH_E2E=1 scripts/check.sh`.
Expected: "All checks passed."

```bash
git add frontend/e2e .gitignore README.md
git commit -m "Add browser tests for staff second factor and parent activation"
```
