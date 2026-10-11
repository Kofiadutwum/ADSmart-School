# Plan 6A: Going Live on Vercel, Neon and Cloudinary (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the system deployable as the owner chose (2026-10-11):
- the Next.js website and the Django backend as two Vercel projects;
- PostgreSQL on Neon;
- uploaded photos on Cloudinary;
- a Vercel address until a domain is bought.

**Architecture:**
- **Backend packaging.** The backend gets a `[project]` table so Vercel's Python runtime (3.14, uv) can install it. It also gets a build step that migrates Neon, and a cron endpoint for scheduled article emails.
- **Request forwarding.** Next.js forwards `/api` and `/media` itself, adding the visitor's address and IP in headers signed with a shared `PROXY_SECRET`, because Vercel may replace `X-Forwarded-*` between projects. Django trusts those headers only when the secret matches.
- **Photos.** They go through a Cloudinary storage backend whenever `CLOUDINARY_URL` is set. The existing WebP renditions are kept.
- **Email and text.** Sign-in emails go through any SMTP server (`SMTP_*`). Text messages report "no provider yet" in production until a provider is connected.

**Spec:** `docs/superpowers/specs/2026-10-09-multi-school-platform-design.md` §10 (Plan 6) and §12, with the owner's hosting decision recorded there in Task 6.

## Global Constraints

- **No secrets in the repo.**
  - The Neon address, Cloudinary key, SMTP password, `PROXY_SECRET`, `CRON_SECRET` and `REVALIDATE_SECRET` live only in Vercel's environment settings.
  - `.env.example` files hold names and blanks only.
- **Local development is unchanged** when the new settings are blank. That means no `PROXY_SECRET`, local media, console email and console SMS.
- **Vercel limits:**
  - 4.5 MB request bodies, so `PHOTO_MAX_MB` defaults to 10 locally and the guide sets 4.
  - On the Hobby plan, cron runs once a day.
- **Fallback:** existing behaviour stays the default whenever a new setting is missing.

## Review Focus

1. **Forged headers:** a request straight to the backend with forged `X-Site-Host` or `X-Site-Client-Ip` headers and no secret is ignored.
2. **The refresh route:** `/api/revalidate` is answered by Next.js, never forwarded to Django.
3. **Missing photos:** a Cloudinary photo whose file is missing must not break a page. Its URL is still built and its renditions are skipped on error.
4. **Cron security:** the cron endpoint refuses requests without the Bearer secret, and refuses everything when no secret is set.
5. **Text messages:** without a provider, a production sign-in by text says the text failed, rather than claiming it was sent.

---

### Task 1: The backend as a Vercel Python project
- `backend/pyproject.toml` gains:
  - `[project]` with `name`, `version`, `requires-python = ">=3.14"`, and `dependencies` equal to `requirements.txt` plus `cloudinary`;
  - `[tool.vercel] entrypoint = "config.wsgi:application"`;
  - `[tool.vercel.scripts] build = "python vercel_build.py"`.
- `backend/vercel_build.py` runs `migrate --noinput` and `createcachetable` when `DATABASE_URL` is set, and does nothing otherwise.
- `backend/vercel.json` sets:
  - `functions["config/wsgi.py"]` with `maxDuration` 60 and `excludeFiles` (tests, local media, sqlite files);
  - `crons` with `/api/cron/article-emails` daily at 07:00.
- **Test:** `tests/test_packaging.py::test_vercel_installs_what_requirements_pin` checks that the `[project]` dependencies equal the `requirements.txt` lines.

### Task 2: Production settings and signed forwarding (backend)
- **`apps/core/forwarding.py` (`SignedForwardingMiddleware`, first in `MIDDLEWARE`):** with a matching `X-Proxy-Secret`, it copies `X-Site-Host` into `X-Forwarded-Host` and `X-Site-Client-Ip` into `X-Forwarded-For`. It always strips the three signed headers.
- **Settings:**
  - `PROXY_SECRET`;
  - `CSRF_TRUSTED_ORIGINS` (list, from env);
  - `CONN_MAX_AGE` (`DB_CONN_MAX_AGE`, default 0);
  - when not `DEBUG`: secure session and CSRF cookies, and `SECURE_PROXY_SSL_HEADER`;
  - `MAILERS` uses SMTP when `SMTP_HOST` is set (`SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_USE_TLS`, a 10 s timeout);
  - `SMS_BACKEND` defaults to the console in `DEBUG`, otherwise to the new `UnavailableBackend`, which raises "No SMS provider is set up yet";
  - `PHOTO_MAX_MB` (default 10) caps every upload (testimonials use `min(5, PHOTO_MAX_MB)`).
- **Tests:**
  - `tests/core/test_forwarding.py`: a signed host and IP are used; unsigned or wrong-secret ones are ignored and stripped.
  - `tests/core/test_settings_production.py`: SMTP options; the unavailable SMS backend marks messages failed; the photo limit is read from settings.

### Task 3: Photos on Cloudinary
- **`apps/core/cloudinary_storage.py` (`CloudinaryStorage(Storage)`):**
  - **Public ID:** the name without its extension; the format comes from the extension.
  - **`_save`:** `cloudinary.uploader.upload(..., public_id, overwrite=True, resource_type="image")`.
  - **`_open`:** downloads from the delivery URL.
  - **`exists`:** a HEAD request on the delivery URL, with no Admin API quota used.
  - **`delete`:** `uploader.destroy(..., invalidate=True)`.
  - **`url`:** a secure delivery URL.
  - **`get_available_name`:** adds a short random suffix, so there are no lookups before saving.
- **Switch:** `STORAGES["default"]` uses it when `CLOUDINARY_URL` is set.
- **Frontend:** `rich-text.ts` also accepts photos from `MEDIA_ORIGIN` (env, e.g. `https://res.cloudinary.com/<cloud>/`).
- **Tests:** `tests/core/test_cloudinary_storage.py` uses an in-memory fake SDK and fake HTTP: save, then url, open and delete; renditions built through the storage; names never collide. Plus a `rich-text.test.ts` case for `MEDIA_ORIGIN`.

### Task 4: Scheduled article emails by cron
- **`GET /api/cron/article-emails`:**
  - needs `Authorization: Bearer <CRON_SECRET>`, else 401;
  - answers 401 when the secret is empty;
  - runs `email_due_articles()` and returns `{"sent": n}`.
- It is classified in the tenancy matrix.
- **Tests:** `tests/platform_content/test_cron.py`.

### Task 5: The website forwards to Django with signed headers (frontend)
- **`src/lib/forward.ts`:**
  - `isBackendPath(path)`: `/api/…` or `/media/…`, but not `/api/revalidate`;
  - `backendUrl(origin, path, search)`;
  - `signedHeaders(incoming, secret)`: the site host from the `host` header, the client IP from `x-forwarded-for` (first) or `x-real-ip`.
- **`proxy.ts`:** sends backend paths to `NextResponse.rewrite(backendUrl, { request: { headers } })`. The matcher now includes `/api` and `/media`, and the `next.config.ts` rewrites are removed.
- **Upload hints** drop the "10 MB" figure; the server's message gives the real limit.
- **Tests:** `src/lib/forward.test.ts`. The browser tests run the whole path.

### Task 6: Guide, settings examples, spec note, full check
- **`docs/deploy/vercel.md`:** a step-by-step guide for the owner:
  - Neon (reset the password first);
  - Cloudinary;
  - Gmail app password for SMTP;
  - the backend project (root `backend`) and its settings;
  - first deploy;
  - creating the first Owner from the computer;
  - the frontend project (root `frontend`) and its settings;
  - checks;
  - what needs a domain.
- **Also:** `.env.example` files, a README pointer, and the owner's hosting decision in the platform spec. Then `WITH_E2E=1 scripts/check.sh` and a local merge.
