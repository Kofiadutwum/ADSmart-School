# ADsmartschool

Websites and school systems for schools in Ghana: one platform that many schools join, each with its own
website, portal and records. The seeded Sample School shows what a school gets.

- Design spec: `docs/superpowers/specs/2026-10-09-ad-smart-school-website-phase1-design.md`
- Plans: `docs/superpowers/plans/`

## Structure

- `backend/`: Django REST API (website content and enquiries; later the school system)
- `frontend/`: Next.js website (and later the portals)

## First-time setup (Windows, Git Bash)

Start the development database once per session and leave it running (no system install: it
runs from npm):

```bash
cd tools/postgres && npm install && npm start
```

Then, in another terminal:

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
npx playwright install chromium   # only needed for browser tests and Lighthouse
```

## Run it

```bash
backend/.venv/Scripts/python backend/manage.py runserver 127.0.0.1:8000
npm --prefix frontend run dev
```

Open http://sample.localhost:3000 (Sample School) or http://localhost:3000 (the platform site). Website content can be edited at http://127.0.0.1:8000/django-admin/
(development only; create a login with `manage.py createsuperuser`).

`npm run build` pre-renders pages from the API, so the backend must be running while it builds.

## One platform, many schools

- **Addresses in development:** `http://localhost:3000` is the platform site; each school is at
  `http://<slug>.localhost:3000` (Sample School: `http://sample.localhost:3000`). Chrome, Edge
  and Firefox resolve `*.localhost` on their own.
- **Seed the first school:** `cd backend && .venv/Scripts/python manage.py seed_website`
  (Sample School, plus the platform's draft privacy notice).
- **The platform admin area:** `http://admin.localhost:3000`. Sign in with a platform account
  (`manage.py create_user --kind platform --username yourname --name "Your Name" --email you@example.com`),
  then confirm with the code sent to your email or phone. There you can:
  - Add a school with its first Administrator (mobile number, and email if they have one). The
    one-time password is shown once for you to hand over; they change it at first sign-in.
  - Open a school's page for counts, the go-live list and its Administrators. You can reset an
    Administrator's password; they are told by SMS.
  - Suspend or reactivate a school, with a reason.
  - Work through the "Get your school online" leads, and read the platform audit log.
- **Adding a school from the command line** still works:
  `.venv/Scripts/python manage.py create_school --slug brightfuture --name "Bright Future Academy"
  --town Ejisu --region "Ashanti Region" --phone 0201234567 --email office@brightfuture.example
  --levels kg,lower_primary,upper_primary`.
- **Platform settings** (`backend/.env`): `PLATFORM_NAME`, `PLATFORM_DOMAIN`, `PLATFORM_EMAIL`,
  `SITE_URL_TEMPLATE`. The frontend needs the same `PLATFORM_DOMAIN` in `frontend/.env.local`.

## Accounts and sign-in

Everyone signs in at their own address. A school's staff, parents and pupils use that school's
address (for example `sample.localhost:3000/sign-in`); your team uses the admin address
(`admin.localhost:3000`). An account belongs to one school, so the same username at two schools is
two different people.

- Create a school's first Administrator (you will be asked for a password):
  `cd backend && .venv/Scripts/python manage.py create_user --kind staff --school sample --username admin --name "Your Name" --role Administrator --phone 024xxxxxxx`
- Add someone to your team: `manage.py create_user --kind platform --username yourname --name "Your Name" --email you@example.com`
- Administrators, Head Teachers, Accountants, Proprietors and everyone on your team confirm each
  sign-in with a 6-digit code. They choose to get it by SMS to their mobile number or by email to
  their address, so their account needs at least one of the two (`--phone`, `--email`). A code lasts
  10 minutes and works once.
- In development, texted codes are printed in the Django log, and so are emails. Before launch, set
  `DJANGO_EMAIL_BACKEND` (and the email server details) and the SMS provider, so codes really arrive.
- Parents are created awaiting activation. They choose "First time, or forgot your password?" on
  their school's sign-in page and get a code by SMS in the school's name. In development the code is
  printed in the Django log.

## Demo school

A school with no pupils yet can be filled with a realistic demo school: a school year with its
calendar, classes, about 250 pupils with their families, and staff for every role. Every demo
person is marked DEMO, and demo phone numbers are never texted.

- Fill a school: `cd backend && .venv/Scripts/python manage.py seed_demo --school sample`
- Try every role (development only): set `DEMO_LOGINS_ENABLED=true` in `backend/.env` before
  seeding. The command then prints one sign-in per role and their shared password. Settings
  refuse this flag unless `DJANGO_DEBUG` is on.
- See what would be removed: `.venv/Scripts/python manage.py purge_demo --school sample`, then
  add `--yes` to remove it. Real records stay, and nothing is removed while a real record still
  points at a demo one.
- Public holidays: the calendar marks the holidays with fixed rules. Add Eid and any newly
  gazetted days yourself.

## Checks

```bash
scripts/check.sh               # lint, types, unit tests, audits
WITH_E2E=1 scripts/check.sh    # plus browser tests (phone + desktop, light + dark, axe) and Lighthouse
```

Browser tests and Lighthouse start their own seeded servers on ports 8100 and 3100.

## Before launch

The site stays in **Preview** (not indexed, ribbon shown) until real photos replace the
placeholders, every text block is reviewed, the privacy notice is approved, and the site is
marked live. See spec §6.5 and §15.

## Next

Plan 2 (sign-in and security) switches development to PostgreSQL, so install it first.
