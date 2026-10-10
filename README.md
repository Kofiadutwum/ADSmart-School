# AD Smart School

Website and school management system for AD Smart School, Kronom, Kumasi (Crèche to JHS).

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

Open http://adsmart.localhost:3000 (AD Smart School) or http://localhost:3000 (the platform site). Website content can be edited at http://127.0.0.1:8000/django-admin/
(development only; create a login with `manage.py createsuperuser`).

`npm run build` pre-renders pages from the API, so the backend must be running while it builds.

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

## Accounts and sign-in

Everyone signs in at their own address. A school's staff, parents and pupils use that school's
address (for example `adsmart.localhost:3000/sign-in`); your team uses the admin address
(`admin.localhost:3000`). An account belongs to one school, so the same username at two schools is
two different people.

- Create a school's first Administrator (you will be asked for a password):
  `cd backend && .venv/Scripts/python manage.py create_user --kind staff --school adsmart --username admin --name "Your Name" --role Administrator --phone 024xxxxxxx`
- Add someone to your team: `manage.py create_user --kind platform --username yourname --name "Your Name"`
- At their first sign-in, Administrators, Head Teachers, Accountants, Proprietors and everyone on
  your team set up an authenticator app (Google or Microsoft Authenticator) and save 10 backup codes.
- If someone loses their phone: `manage.py reset_second_factor admin --school adsmart`
  (leave out `--school` for your team).
- Parents are created awaiting activation. They choose "First time, or forgot your password?" on
  their school's sign-in page and get a code by SMS in the school's name. In development the code is
  printed in the Django log.

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
