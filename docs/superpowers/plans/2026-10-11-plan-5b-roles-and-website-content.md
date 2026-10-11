# Plan 5B: Team Roles and Website Content (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the platform team roles (Owner, Finance, Content, Support) with a Team screen, and give the owner's website a gallery, articles and tips, comments from schools, questions and answers, tip sign-up with a WhatsApp button, cookie-free visit counts and quick on-demand refresh.

**Architecture:**
- **Backend.** A new Django app, `apps.platform_content`, holds every model for the platform website:
  - `GalleryPhoto`, `Article` and `ArticleImage`;
  - `Testimonial` and `FaqItem`;
  - `TipSubscriber` and `PageVisit`;
  - `PlatformSettings`, a single row.
- **Admin API.** Content-role endpoints live under `/api/platform/website/…`. Team endpoints live under `/api/platform/team…`.
- **Public API.** `platform_payload()` grows with the published content. Articles get their own public endpoints.
- **Roles.** Team roles are Django groups, like school roles. A `PlatformRole` permission factory guards every view, and Owner passes every check.
- **Frontend.** The admin area gets:
  - a role-aware nav;
  - a **Website** section with tabs;
  - a **Team** page.

  The platform site gets:
  - new landing sections;
  - `/articles` and `/articles/[slug]`, plus `/gallery`;
  - the tip confirm and unsubscribe pages;
  - a visit beacon.
- **Refresh.** Django calls a Next.js route handler that runs `revalidateTag("platform", …)` after each change.

**Tech stack:** Django 6.1, DRF 3.18, PostgreSQL 18 (tests on the dev server), Next.js 16.4, React 19.3, Tailwind 4, Vitest 5, Playwright 1.64. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-10-platform-business-tools-design.md` (§2, §4 visitor counting, §5, §7, §8), within `docs/superpowers/specs/2026-10-09-multi-school-platform-design.md`.

## Global Constraints

- **Truthful:** a section with nothing published is not rendered. No invented numbers or content goes public.
- **Permission ticks:**
  - A gallery photo that shows people can't be visible without `people_permission`.
  - A testimonial can't be visible without `permission`.
- **Visits:** only the path and the day are stored. No cookies, no IP and no user agent are kept.
- **Tip emails:**
  - Double opt-in.
  - Every email has an unsubscribe link.
  - The response never reveals whether an address was already subscribed.
- **Authorisation:**
  - Every rule is enforced by the server.
  - A role without access gets 403 and no data.
  - The last active Owner can't lose Owner or be switched off.
- **Upload limits:**
  - Gallery and article photos: JPEG, PNG or WebP up to 10 MB.
  - Testimonial photos: up to 5 MB.
  - Every image is checked with Pillow.
- **Text format:** article bodies use the house text format (`apps.consent.models.FORMAT_HELP`), extended with:
  - `**bold**`;
  - `[text](url)` for http(s), mailto, tel or same-site links only;
  - `> quote`;
  - `![alt](/media/…)` for this site's media only.

  Anything else shows as plain text and is never treated as HTML.
- **Budgets:** Lighthouse 90 or more for performance, 100 for accessibility and best practices. About 500 KB on first mobile load, so images below the fold load lazily.
- **Audit:** create, update, publish, unpublish, delete and role changes go to `AuditLog`.
- **Copy:** plain British English, short sentences, and no jargon on screen.

## Review Focus

1. **A Content-only account** calls the Team, Schools or Audit endpoints. Expected: 403. Support calling Website endpoints: also 403.
2. **A scheduled article** (status published, `publish_at` in the future) must not appear in any public endpoint, sitemap or landing payload until its time.
3. **An article body** containing `<script>`, `javascript:` links or images from other sites renders as plain text.
4. **Tip sign-up:** the same email signed up twice, or an already-confirmed email, gives the same response. Confirm and unsubscribe tokens are single-purpose and unguessable.
5. **A visit beacon** from a school's host, with a path over 200 characters, or from a robot user agent, is ignored without an error.

---

## Rulings made while planning (ledger copies these)

- **Prices section moves to Plan 5C.** It is built from finance plans (§3.1), which 5C creates. Cost if wrong: one landing section ships a plan later.
- **The plan is written at interface level** (files, signatures, test names, key code), not full code. The author executes it inline in the same session, per the owner's "run all processes once" instruction. Cost if wrong: less help after a compaction, covered by the ledger.
- **Group "Platform Admin" is renamed "Platform Owner"** in a data migration. Platform accounts in no platform group (for example, `createsuperuser` accounts) are added to it, so every existing account becomes Owner (spec §2).

---

### Task 1: Team roles and the Team API (backend)

**Files:**
- Modify:
  - `backend/apps/accounts/roles.py`
  - `backend/apps/accounts/management/commands/create_user.py` (the default platform role becomes Owner)
  - `backend/apps/platform_admin/permissions.py`
  - `backend/apps/platform_admin/views.py` (the schools and leads views take Support; audit takes Owner)
  - `backend/apps/platform_admin/urls.py`
  - `backend/apps/platform_admin/services.py`
  - `backend/tests/platform_admin/conftest.py` (`ops` becomes an Owner)
  - `backend/tests/accounts/test_users.py`
- Create:
  - `backend/apps/accounts/migrations/0005_platform_roles.py`
  - `backend/tests/platform_admin/test_team.py`
  - `backend/tests/platform_admin/test_roles.py`

**Interfaces (produces):**
- `roles.PLATFORM_OWNER = "Platform Owner"`, `PLATFORM_FINANCE = "Platform Finance"`, `PLATFORM_CONTENT = "Platform Content"`, `PLATFORM_SUPPORT = "Platform Support"`.
- `roles.PLATFORM_ROLES` is a tuple of those four. `ALL_ROLES = (*SCHOOL_ROLES, *PLATFORM_ROLES)`. `PLATFORM_ADMIN` is removed.
- `permissions.PlatformRole(*allowed) -> type[BasePermission]`. It passes for platform staff who hold any of `allowed` or `PLATFORM_OWNER`. `IsPlatformStaff` stays, for pages every role may see.
- `ROLE_FOR_AREA = {"schools": SUPPORT, "leads": SUPPORT, "audit": OWNER, "team": OWNER, "website": CONTENT}` in `permissions.py`. The role test reads it.
- **Team endpoints** (Owner only):
  - `GET /api/platform/team` returns `[{"id", "name", "username", "phone", "email", "roles", "is_active", "last_sign_in"}]`.
  - `POST /api/platform/team` takes `{first_name, surname, username, phone, email?, roles: [..]}` and returns 201 `{"member": row, "one_time_password"}`.
  - `PATCH /api/platform/team/<pk>` takes `{roles?, is_active?}` and returns the row.
  - `POST /api/platform/team/<pk>/reset-password` returns `{"username", "one_time_password"}`.
- `services.add_team_member(...) -> (User, password)`, `services.update_team_member(user, *, roles=None, is_active=None, by, request)`. Both raise `LastOwnerError` when the change would leave no active Owner.

**Tests (RED first):**
- `test_users.py::test_every_role_has_a_group`: 17 roles, all groups present.
- `test_roles.py`:
  - `test_every_platform_route_declares_its_area`: every `api/platform/<area>` path's area is a `ROLE_FOR_AREA` key.
  - `test_each_role_reaches_only_its_areas` (parametrised over the four roles): an allowed area isn't 403, and a refused area is 403 `permission_denied`.
  - `test_owner_reaches_everything`.
  - `test_staff_without_a_role_are_refused`.
- `test_team.py`:
  - `test_owner_lists_and_adds_a_member_with_a_one_time_password` (also checks that roles are applied and the action is audited);
  - `test_a_member_needs_a_mobile_or_email` (400);
  - `test_roles_must_be_platform_roles` (400 for "Administrator");
  - `test_owner_changes_roles_and_switches_off` (audited, and the switched-off user's session no longer works);
  - `test_the_last_owner_cannot_be_removed_or_switched_off` (400 `last_owner`);
  - `test_reset_password_returns_a_one_time_password`.
- `test_migration`: covered by `test_every_role_has_a_group`. A platform user created with no group by `create_superuser` becomes Owner through `create_user`'s default, and through the migration on existing databases (checked by hand on the dev DB).

**Steps:**
- [ ] Write the tests above. Run `pytest tests/platform_admin tests/accounts/test_users.py -q`. Expected: failures (`PLATFORM_OWNER` is missing).
- [ ] Implement the roles constants and the migration (rename the "Platform Admin" group, or create it; create the other three; add every `kind=platform` user with no platform group to Owner). Then `PlatformRole`, the view permission changes, the services and the team views.
- [ ] Run the same tests. Expected: all pass. Then run the full backend suite. Expected: green.
- [ ] Commit: "Give the platform team roles (Owner, Finance, Content, Support) and a Team API".

### Task 2: Role-aware admin area and the Team page (frontend)

**Files:**
- Modify:
  - `frontend/src/components/portal/portal-shell.tsx` (`NavItem` gains `roles?: string[]`, filtered by `me.roles`; Owner sees everything)
  - `frontend/src/app/platform-admin/(portal)/layout.tsx` (nav: Schools and Leads for Support; Website for Content; Team and Audit log for Owner; Account for all)
  - `frontend/src/lib/types.ts`
  - `frontend/src/lib/client-api.ts` (adds `postForm<T>(path, form: FormData)` for uploads, used from Task 3)
- Move:
  - `frontend/src/app/platform-admin/page.tsx` → `frontend/src/app/platform-admin/(portal)/page.tsx`. It becomes a client redirect to the first page the person's roles allow.
- Create:
  - `frontend/src/lib/platform-roles.ts` (`PLATFORM_ROLES`, `canUse(me, ...roles)`, `firstAllowedPath(me)`)
  - `frontend/src/components/platform-admin/team-view.tsx` and `team-view.test.tsx`
  - `frontend/src/app/platform-admin/(portal)/team/page.tsx`

**Tests (RED first):**
- `platform-roles.test.ts`:
  - `canUse`: Owner passes everything; Content passes only Content.
  - `firstAllowedPath`: Support goes to `/schools`, Content to `/website`, Owner to `/schools`.
- `portal-shell.test.tsx`: `hides nav items the person's roles don't allow`.
- `team-view.test.tsx`:
  - `lists members with their roles`;
  - `adds a member and shows the one-time password once`;
  - `changes roles`;
  - `shows the last-owner message from the server`.
- `client-api.test.ts`: `postForm sends FormData with the CSRF header and no JSON content type`.

**Steps:**
- [ ] Write the tests. Run `npx vitest run src/lib src/components/portal src/components/platform-admin`. Expected: failures.
- [ ] Implement. Run the same command. Expected: pass. Then run `npx tsc --noEmit` and `npm run lint`. Expected: clean.
- [ ] Commit: "Show each team member only the admin pages their roles allow, and add the Team page".

### Task 3: The platform content app and the gallery (backend)

**Files:**
- Create:
  - `backend/apps/platform_content/{__init__,apps,models,admin_views,public,refresh,uploads,urls_admin,urls_public}.py`
  - its migrations
  - `backend/tests/platform_content/{__init__,conftest,test_gallery}.py`
- Modify:
  - `backend/config/settings.py` (`INSTALLED_APPS`; `FRONTEND_ORIGIN`, `REVALIDATE_SECRET`)
  - `backend/config/urls.py` (mount `api/platform/website/` and the public routes under `api/public/platform/`)
  - `backend/apps/website/platform.py` (the payload gets `gallery`)

**Interfaces (produces):**
- `uploads.checked_image(file, *, max_mb: int) -> UploadedFile`. It raises DRF `ValidationError` with "Choose a JPEG, PNG or WebP photo." or "That photo is larger than {n} MB.", and verifies the file with Pillow.
- `GalleryPhoto(ImageRenditionsMixin)` fields:
  - `image`, `alt_text` (required, max 200), `caption` (max 160, optional);
  - `shows_people`, `people_permission`, `visible` (default True);
  - `order`, `created_at`.
- `clean()` refuses `visible and shows_people and not people_permission`. The `public()` queryset returns visible rows where not (`shows_people` and not `people_permission`), ordered by `order` then `id`.
- `refresh.refresh_platform_site()` posts `{"tag": "platform"}` to `FRONTEND_ORIGIN/api/revalidate` with the header `X-Revalidate-Secret`, from `transaction.on_commit`. It does nothing when `REVALIDATE_SECRET` is empty. Failures are logged and swallowed.
- **Admin gallery endpoints** (`PlatformRole(CONTENT)`):
  - `GET /api/platform/website/gallery` returns `[{"id", "image", "alt_text", "caption", "shows_people", "people_permission", "visible", "order"}]`.
  - `POST` (multipart) returns 201 and the row.
  - `PATCH <pk>` (JSON) and `DELETE <pk>`.
  - `POST /api/platform/website/gallery/order {ids: [..]}` returns the rows.
  - Each change is audited and calls `refresh_platform_site()`.
- Public payload: `platform_payload()["gallery"] = [{"id", "image": image_payload, "caption"}]`.

**Tests (RED first, `test_gallery.py`):**
- `test_content_uploads_a_photo_with_renditions`;
- `test_refuses_non_images_and_large_files`;
- `test_people_need_permission_to_be_shown` (400 on create or patch);
- `test_hidden_and_unpermitted_photos_stay_off_the_website`;
- `test_reorders_photos`;
- `test_changes_are_audited_and_refresh_the_site` (monkeypatch `refresh_platform_site`).

**Steps:**
- [ ] Write the tests, then run `pytest tests/platform_content -q`. Expected: fail.
- [ ] Implement, then run again. Expected: pass. Run the full backend suite and the role test (the "website" area). Expected: green.
- [ ] Commit: "Add the gallery to the platform website, managed by the Content role".

### Task 4: Articles and tips (backend)

**Files:**
- Modify: `backend/apps/platform_content/{models,admin_views,public,urls_admin,urls_public}.py`, `backend/apps/website/platform.py` (`latest_articles`), and `backend/apps/website/seeding.py` (starter tip drafts).
- Create:
  - `backend/apps/platform_content/articles.py`: queries, payloads and emails.
  - `backend/apps/platform_content/starter_tips.py`.
  - `backend/apps/platform_content/management/commands/send_article_emails.py`.
  - `backend/tests/platform_content/test_articles.py`.

**Interfaces (produces):**
- **`Article(ImageRenditionsMixin)` fields:**
  - `kind` (`news` / `tip`), `title` (max 160), `slug` (unique, from the title);
  - `summary` (max 240), `body`, `cover` (optional) and `cover_alt`, `author_name` (max 80);
  - `status` (`draft` / `published`) and `publish_at` (null while a draft);
  - `email_subscribers` (bool), `emailed_at` (null), `created_at` and `updated_at`.
- `Article.objects.public()` returns rows with `status=published` and `publish_at<=now`, newest first.
- `ArticleImage(ImageRenditionsMixin)` fields: `image`, `alt_text`, `created_at`.
- **Payloads:**
  - `articles.summary(a)` gives `{"slug", "kind", "title", "summary", "cover", "author", "published_at", "reading_minutes"}`. Reading time is `max(1, ceil(words / 200))`.
  - `articles.detail(a)` adds `body` and `related` (3 public articles of the same kind first, then the newest others, never itself).
- **Admin endpoints** (`PlatformRole(CONTENT)`), under `/api/platform/website/articles`:
  - `GET` lists everything with `state` (`draft` / `scheduled` / `published`).
  - `POST {kind, title, summary?, body?, author_name?}` returns 201.
  - `GET`, `PATCH` and `DELETE` on `<pk>`. `DELETE` is drafts only; published gives 400 "Unpublish it first."
  - `POST <pk>/cover` (multipart `image` and `cover_alt`) and `DELETE <pk>/cover`.
  - `POST <pk>/publish {publish_at?: ISO, email_subscribers: bool}`. It needs a title, summary and body (400 lists what's missing). A past or missing `publish_at` means now.
  - `POST <pk>/unpublish`.
  - `POST /api/platform/website/article-images` (multipart `image` and `alt_text`) returns `{"src", "alt", "markdown": "![alt](src)"}`.
  - Each change is audited and refreshes the site.
- **Public endpoints:**
  - `GET /api/public/platform/articles?kind=&limit=` (default 50, max 100).
  - `GET /api/public/platform/articles/<slug>` returns 404 unless it's public.
- **Emails:**
  - `articles.email_due_articles() -> int` sends each live article with `email_subscribers` and no `emailed_at` to every confirmed, still-subscribed subscriber, one email each, with an unsubscribe link (Task 6), then sets `emailed_at`.
  - It runs on publish (on commit) when live now, and from the `send_article_emails` command (scheduled in Plan 6).
- **Starter tips:** `seed_starter_tips()` creates 4 **draft** tips, idempotent by slug, with honest, practical text and no numbers. `seed_platform()` calls it.

**Tests (RED first, `test_articles.py`):**
- `test_content_writes_a_draft_and_the_slug_follows_the_title`;
- `test_publish_needs_title_summary_and_body`;
- `test_published_article_is_public_with_reading_time_and_related`;
- `test_scheduled_article_stays_hidden_until_its_time` (uses `freezegun`-free `timezone.now` patching via monkeypatch);
- `test_unpublish_hides_without_deleting`;
- `test_only_drafts_can_be_deleted`;
- `test_cover_and_inline_images_are_checked_and_resized`;
- `test_publishing_emails_confirmed_subscribers_once` (locmem outbox; unsubscribed and pending get none; a second run sends nothing);
- `test_starter_tips_are_drafts_and_seed_once`;
- `test_landing_payload_has_the_three_latest_articles`.

**Steps:**
- [ ] Write the tests, run them, and see them fail.
- [ ] Implement, then run `pytest tests/platform_content -q` (pass) and the full suite (green).
- [ ] Commit: "Add articles and tips to the platform website, with scheduling and subscriber emails".

### Task 5: Testimonials, questions and answers, and the WhatsApp link (backend)

**Files:**
- Modify:
  - `backend/apps/platform_content/{models,admin_views,urls_admin}.py`
  - `backend/apps/website/platform.py` (adds `testimonials`, `faqs`, `whatsapp_channel`)
- Create: `backend/tests/platform_content/test_testimonials_faqs_settings.py`.

**Interfaces (produces):**
- **`Testimonial(ImageRenditionsMixin)` fields:**
  - `quote` (max 600), `person_name` (max 80), `person_role` (max 80);
  - `school_name` (max 120) and `school` (an optional FK to School, which supplies the link while that school is public);
  - `photo` (optional, 5 MB), `permission` (bool), `visible`, `order`.
- Visible on the website only if `visible and permission`. `clean()` refuses `visible` without `permission`.
- `FaqItem` fields: `question` (max 200), `answer` (house text format), `visible`, `order`.
- `PlatformSettings.load()` is a single row with `whatsapp_channel_url`, which must be blank or start with `https://whatsapp.com/channel/` (also accepted with `www.`).
- **Admin endpoints** (Content), under `/api/platform/website/`:
  - `testimonials`: `GET`, `POST`, `PATCH <pk>`, `DELETE <pk>`, `POST <pk>/photo`, `DELETE <pk>/photo`, `POST order`.
  - `faqs`: `GET`, `POST`, `PATCH <pk>`, `DELETE <pk>`, `POST order`.
  - `settings`: `GET` and `PATCH {whatsapp_channel_url}`.
  - Each change is audited and refreshes the site.
- **Payload:**
  - `testimonials` is `[{"id", "quote", "name", "role", "school", "school_url", "photo"}]`.
  - `faqs` is `[{"id", "question", "answer"}]`.
  - `whatsapp_channel` is a string.

**Tests (RED first):**
- `test_testimonial_needs_permission_to_show`;
- `test_testimonial_links_its_school_only_while_public`;
- `test_faqs_are_ordered_and_hidden_ones_left_out`;
- `test_whatsapp_link_must_be_a_channel_link`;
- `test_support_cannot_edit_website_content` (403).

**Steps:**
- [ ] Write the tests, run them and see them fail.
- [ ] Implement, then run them again (pass) and the full suite (green).
- [ ] Commit: "Add comments from schools, questions and answers, and the WhatsApp channel link".

### Task 6: Tip sign-up (backend)

**Files:**
- Modify: `backend/apps/platform_content/{models,public,urls_public,admin_views,urls_admin}.py` and `backend/config/settings.py` (`REST_FRAMEWORK` throttle rate `tips_ip`).
- Create:
  - `backend/apps/platform_content/tips.py`: tokens and emails.
  - `backend/tests/platform_content/test_tips.py`.

**Interfaces (produces):**
- `TipSubscriber` fields: `email` (unique, lower-cased), `consent_at`, `confirmed_at` (null), `unsubscribed_at` (null), `created_at`.
- **Tokens** are `signing.dumps(pk, salt="tips.confirm")`, valid for 7 days, and `signing.dumps(pk, salt="tips.unsubscribe")`, with no expiry. Each is single-purpose because of its salt.
- **Public endpoints:**
  - `POST /api/public/platform/tips {email, consent, form_token, website}`. It is platform host only and throttled, with a honeypot and the form-token check from `apps.website.enquiries`. It always answers 202 `{"status": "check_email"}`. It sends a confirmation email only to new, pending or previously unsubscribed addresses, with at most one email per address per hour.
  - `POST /api/public/platform/tips/confirm {token}` returns 200 `{"status": "confirmed"}`, or 400 `invalid_link`.
  - `POST /api/public/platform/tips/unsubscribe {token}` returns 200 `{"status": "unsubscribed"}` (idempotent), or 400 `invalid_link`.
- **Links** are `{platform url}/tips/confirm?token=…` and `{platform url}/tips/unsubscribe?token=…`.
- **Admin endpoints** (Content):
  - `GET /api/platform/website/subscribers` returns `{"confirmed", "pending", "unsubscribed"}`.
  - `GET /api/platform/website/subscribers.csv` lists the confirmed, subscribed emails with `email,confirmed_at`, as UTF-8 with a BOM so Excel reads it.
- `tips.unsubscribe_url(subscriber)` is used by Task 4's emails.

**Tests (RED first):**
- `test_sign_up_sends_one_confirmation_and_never_reveals_status`;
- `test_needs_consent_and_a_valid_email`;
- `test_confirm_and_unsubscribe_tokens_cannot_be_swapped`;
- `test_expired_confirm_link_is_refused`;
- `test_unsubscribe_is_one_click_and_idempotent`;
- `test_honeypot_and_missing_form_token`;
- `test_only_the_platform_host_takes_sign_ups`;
- `test_subscriber_counts_and_csv_for_content_only`.

**Steps:**
- [ ] Write the tests, run them and see them fail.
- [ ] Implement, then run them again (pass) and the full suite (green).
- [ ] Commit: "Let visitors sign up for tips by email, with confirmation and one-click unsubscribe".

### Task 7: Visit counts and quick refresh (backend and Next.js route)

**Files:**
- Modify: `backend/apps/platform_content/{models,public,urls_public}.py`, `frontend/src/lib/api.ts` (every platform fetch gets `tags: ["platform"]`), `backend/.env.example`, `backend/.env` and `frontend/e2e/serve.mjs` (the two settings below).
- Create:
  - `frontend/src/app/api/revalidate/route.ts` and `route.test.ts`;
  - `frontend/src/components/platform/visit-beacon.tsx` and its test;
  - `backend/tests/platform_content/test_visits_and_refresh.py`.

**Interfaces (produces):**
- `PageVisit` fields: `day` (date), `path` (max 200), `count`. Unique on (`day`, `path`).
- `POST /api/public/platform/visit {path}` always answers 204.
  - It counts only when the host is the platform's, the path starts with "/" and is at most 200 characters (query and hash stripped), and the user agent isn't a robot.
  - Robots match `/bot|crawl|spider|slurp|preview|headless|lighthouse|monitor/i`.
  - It increments with `F("count") + 1`.
- **Next.js route handler** `POST /api/revalidate`:
  - It needs `X-Revalidate-Secret` to equal `process.env.REVALIDATE_SECRET` (non-empty), or it returns 401.
  - Body: `{"tag": "platform"}` (only "platform" is allowed, otherwise 400).
  - It calls `revalidateTag("platform", { expire: 0 })` and returns `{"revalidated": true}`.
- **`VisitBeacon`** (client) runs on each pathname change in the platform-site layout. It calls `navigator.sendBeacon("/api/public/platform/visit", Blob(JSON))`, and does nothing if `sendBeacon` is missing.

**Tests (RED first):**
- **Backend:**
  - `test_visits_are_counted_per_page_and_day`;
  - `test_robots_other_hosts_and_bad_paths_are_ignored`;
  - `test_query_strings_are_dropped`;
  - `test_refresh_posts_the_tag_with_the_secret` (monkeypatch `urllib.request.urlopen`);
  - `test_refresh_is_skipped_without_a_secret`.
- **Frontend:**
  - `route.test.ts`: a wrong secret gives 401; the right one revalidates (mock `next/cache`); an unknown tag gives 400.
  - `visit-beacon.test.tsx`: sends the current path.

**Steps:**
- [ ] Write the tests, run them and see them fail.
- [ ] Implement, then run them again (pass) and the full suites (green).
- [ ] Commit: "Count visits to the platform website without cookies, and refresh it as soon as content changes".

### Task 8: The Website section of the admin area (frontend)

**Files:**
- Create, in `frontend/src/components/platform-admin/website/`:
  - `website-tabs.tsx`
  - `use-load.ts` (`useLoad<T>(path) -> {data, setData, error, reload}`)
  - `reorder.ts` (`move(list, index, delta)`)
  - `articles-view.tsx`
  - `article-editor.tsx`
  - `text-toolbar.tsx` (inserts `## `, `- `, `**…**`, `[text](https://)`, `> ` and photo markup at the cursor)
  - `gallery-manager.tsx`
  - `testimonials-manager.tsx`
  - `faqs-manager.tsx`
  - `tips-settings.tsx`
  - one `*.test.tsx` for each view
- Create the routes, in `frontend/src/app/platform-admin/(portal)/website/`:
  - `layout.tsx` (tabs)
  - `page.tsx` (redirects to `articles`)
  - `articles/page.tsx`
  - `articles/[id]/page.tsx`
  - `gallery/page.tsx`
  - `comments/page.tsx`
  - `questions/page.tsx`
  - `tips/page.tsx`
- Modify: `frontend/src/lib/types.ts` (the admin types).

**Behaviour:**
- **Articles:**
  - The list shows the state (Draft, Scheduled with its date and time, or Published).
  - "New article" asks for a kind and title, creates a draft and opens the editor.
  - The editor has: title, kind, summary (with a count to 240), author, body with toolbar, a **Preview** toggle (renders with `RichText`), cover upload with its description, and **Insert photo** (upload, then the markup is inserted).
  - It has **Save**, **Publish now**, **Schedule** (date and time), an "Email tip subscribers" tick, **Unpublish**, and **Delete draft** (with a confirm step).
  - Missing fields show beside each field.
- **Gallery:**
  - The upload form has a photo, a required description, a caption, a "Shows people" tick, and a permission tick, which is required when it shows people.
  - Each photo has edit, show/hide, up/down (buttons, so it works by keyboard) and delete (with a confirm step).
- **Comments and Questions:** the same pattern as the gallery: list, add, edit, show/hide, up/down, delete, plus photo upload for comments.
- **Tips and WhatsApp:**
  - subscriber counts;
  - a **Download subscribers (CSV)** link;
  - the WhatsApp Channel link field, with a save button.

**Tests (RED first):** for each view, it loads, adds, shows the server's field errors, and calls the right endpoints (`mockApi`, `bodyOf`). For the editor: the toolbar inserts at the cursor, preview renders headings, publish sends `publish_at`, and a missing summary shows its error.

**Steps:**
- [ ] Write the tests, run `npx vitest run src/components/platform-admin/website` and see them fail.
- [ ] Implement, then run them (pass), plus `npx tsc --noEmit` and `npm run lint` (clean).
- [ ] Commit: "Add the Website section to the admin area: articles, gallery, comments, questions and tips".

### Task 9: The new sections and pages on the platform website (frontend)

**Files:**
- Modify:
  - `frontend/src/lib/rich-text.ts` and its test (quotes, images and inline bold and links, with the safety rules from Global Constraints)
  - `frontend/src/components/ui/rich-text.tsx`
  - `frontend/src/lib/{api,types}.ts`
  - `frontend/src/app/platform-site/{page,layout}.tsx`
  - `frontend/src/app/platform-site/sitemap.xml/route.ts` and `seo.test.ts`
  - `frontend/src/components/platform/{platform-header,platform-footer}.tsx` and `platform-chrome.test.tsx`
- Create, in `frontend/src/components/platform/`:
  - `gallery-section.tsx` (`CardRail`, plus a `Lightbox` built on the existing `@radix-ui/react-dialog`, with arrows, Esc and swipe)
  - `testimonials-section.tsx`
  - `article-card.tsx`
  - `articles-section.tsx`
  - `faq-section.tsx` (native `<details>`, plus FAQPage JSON-LD)
  - `tips-signup.tsx`
  - tests for each
- Create, in `frontend/src/app/platform-site/`:
  - `articles/page.tsx` (`?kind=tip|news` filter links)
  - `articles/[slug]/page.tsx` (metadata with the cover as the share image; Article JSON-LD; share links for WhatsApp, Facebook and X, plus copy; related articles; a "Get your school online" box)
  - `gallery/page.tsx` (only linked when there are more than 12 photos)
  - `tips/confirm/page.tsx`
  - `tips/unsubscribe/page.tsx`

**Behaviour:**
- **Landing page order (spec §5.1):**
  1. Hero
  2. Features
  3. Schools
  4. Gallery
  5. What schools say
  6. Latest articles and tips
  7. Questions and answers
  8. Get online, with tip sign-up
- **Empty sections stay hidden.**
- **Header** gains an **Articles** link when there is a published article.
- **Footer** gains Articles, Questions (`/#faq`) and **Follow on WhatsApp** (opens in a new tab with `rel="noopener"`), each only when it has something to point to.
- **Sitemap** adds `/articles` and each public article (with `lastmod`), and `/gallery` when it exists. All only while the platform is public.
- **Tip confirm and unsubscribe pages:** they read the token, POST it once on load, and show the result or the "invalid link" message.

**Tests (RED first):**
- `rich-text.test.ts`: bold and links; `javascript:` links and outside images show as text; quotes; images only from `/media/`.
- Each section renders only when it has items. The lightbox opens, moves and closes with Esc.
- Tip sign-up: posts with the form token and consent, and shows "Check your email".
- Header and footer conditional links.
- Sitemap includes public articles.

**Steps:**
- [ ] Write the tests, run `npx vitest run` and see them fail.
- [ ] Implement, then run them (pass), plus `tsc` and lint (clean).
- [ ] Look at it in the browser: the landing page in light and dark, an article page, and the gallery lightbox.
- [ ] Commit: "Show the gallery, comments, articles and tips, and questions on the platform website".

### Task 10: Browser tests, docs and the full check

**Files:**
- Create: `frontend/e2e/platform-content.spec.ts`.
- Modify: `frontend/e2e/serve.mjs` (the two settings above, plus `FRONTEND_ORIGIN=http://127.0.0.1:3100`), `README.md` (team roles; the Website section; `send_article_emails`), the spec §9 table (the prices section moves to 5C), and the ledger.

**Browser tests:**
1. An Owner adds a question and publishes an article. Both appear on the landing page and the article page within seconds, through the quick refresh.
2. Gallery upload with permission appears on the landing page, and the lightbox opens.
3. Tip sign-up shows "Check your email".
4. A Content-only member sees only the Website and Account pages.
5. Accessibility in both themes for `/articles`, an article, and the admin Website pages.

**Steps:**
- [ ] Write the spec, run `npx playwright test e2e/platform-content.spec.ts` and see it fail before the wiring.
- [ ] Make it pass. Then run `WITH_E2E=1 bash scripts/check.sh`. Expected: everything green, with Lighthouse within budget.
- [ ] Commit: "Add browser tests for the platform website content and team roles, and update the docs".
- [ ] Do the final whole-branch review, then merge locally to `main` (the owner's standing instruction: plan, TDD, verify, merge locally).
