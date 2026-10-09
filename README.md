# AD Smart School

Website and school management system for AD Smart School, Kronom, Kumasi (Crèche to JHS).

- Design spec: `docs/superpowers/specs/2026-10-09-ad-smart-school-website-phase1-design.md`
- Plans: `docs/superpowers/plans/`

## Structure

- `backend/`: Django REST API (website content and enquiries; later the school system)
- `frontend/`: Next.js website (and later the portals)

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
npx playwright install chromium   # only needed for browser tests and Lighthouse
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
WITH_E2E=1 scripts/check.sh    # plus browser tests (phone + desktop, light + dark, axe) and Lighthouse
```

Browser tests and Lighthouse start their own seeded servers on ports 8100 and 3100.

## Before launch

The site stays in **Preview** (not indexed, ribbon shown) until real photos replace the
placeholders, every text block is reviewed, the privacy notice is approved, and the site is
marked live. See spec §6.5 and §15.

## Next

Plan 2 (sign-in and security) switches development to PostgreSQL, so install it first.
