# One Platform, Many Schools (Design amendment)

| | |
|---|---|
| Date | 9 October 2026 |
| Status | Design approved by the owner in chat ("yes continue") |
| Amends | `2026-10-09-ad-smart-school-website-phase1-design.md` (cited below as **Phase 1 spec §n**) |
| Precedence | Where the two documents disagree, **this one wins**. Everything not mentioned here stands as written in the Phase 1 spec |

---

## 1. Intent

The system is no longer one school's website. It is **one platform that many schools join**. Each school gets its own website, portal and records, kept entirely apart from every other school. **AD Smart School is the first school on the platform** and keeps all of its current content.

There are two levels of administration:

- **Platform admins** (the owner's team) add schools, set them up, suspend them, connect their domains and help them when they are stuck.
- **School admins** (each school's Administrator) run their own school exactly as the Phase 1 spec describes: website content, enquiries, staff, parents, pupils, roles, audit.

### 1.1 Decisions made by the owner

| Topic | Decision |
|---|---|
| Web address | Every school gets `<slug>.<platform domain>` at once. A school can later connect its own domain |
| Main address | The platform domain shows a **platform marketing page** with a "Get your school online" form and the list of live schools |
| Joining | **Platform admins create each school** and its first Administrator. No self sign-up |
| Platform access to school data | **Only with the school's consent:** a time-limited support grant from the school's Administrator. Every look is audited and visible to the school |
| Platform name | **Working name "SchoolSite"**. Name and domain live in two settings (`PLATFORM_NAME`, `PLATFORM_DOMAIN`) so the real ones drop in before launch |
| School look | One design (Phase 1 spec §8). Each school sets its **logo, brand colours, photos and text** |
| Accounts | **Separate account per school.** A parent with children at two schools has two accounts and signs in at each school's own address |
| Billing | **Not in this cycle.** Platform admins record each school's status (trial, active, suspended) by hand |
| Data separation | **One shared database; every school-owned record carries its school**, filtered centrally and proven by tests |

### 1.2 Added success criteria

1. A platform admin adds a school and its first Administrator. The school's placeholder website is reachable at once at `<slug>.<platform domain>`, in preview.
2. **No API endpoint returns, changes or reveals another school's data.** Tests prove this for every endpoint.
3. A school can connect its own domain, and the site then answers on it over HTTPS.
4. The platform marketing page meets the same performance and accessibility budget as school sites (Phase 1 spec §6.6, §8.7).
5. Suspending a school takes its site offline and signs its users out within one request.

---

## 2. Addresses and routing

### 2.1 Who answers where

| Address | What it shows |
|---|---|
| `<platform domain>` and `www.<platform domain>` | Platform marketing site (§6) |
| `admin.<platform domain>` | Platform admin area (§5). Platform staff sign in only here |
| `<slug>.<platform domain>` | That school's website and portal |
| A school's own domain (e.g. `adsmartschool.edu.gh`) | The same school, once the domain is verified (§2.3) |
| Anything else | "School not found" page, status 404 |

**Development:** `PLATFORM_DOMAIN=localhost`, so `localhost:3000` is the platform site, `admin.localhost:3000` the admin area and `adsmart.localhost:3000` AD Smart School. Browsers resolve `*.localhost` to the local machine without any setup.

### 2.2 Slugs

- 3–30 characters: lowercase letters, digits and single hyphens, starting with a letter. Example: `adsmart`.
- **Reserved, never allowed:** `admin`, `www`, `api`, `app`, `mail`, `static`, `media`, `platform`, `support`, `help`, `status`, `docs`, `blog`.
- A slug is fixed once the school is created. Changing it is a support task, not a screen.

### 2.3 Custom domains

- A platform admin adds the domain to the school and gives the school its DNS instructions (a `CNAME` to the platform).
- **Check** asks the DNS whether the domain now points to the platform, and marks it verified.
- **HTTPS:** Caddy issues certificates on demand, but only after asking Django whether the domain is the platform's own or a verified school domain. Unknown domains never get a certificate.
- **One primary address per school.** When a verified custom domain is marked primary, the subdomain redirects to it (permanent redirect), and canonical URLs, the sitemap and shared links use it.

### 2.4 How a request finds its school (amends Phase 1 spec §2.2)

- **The Next.js proxy** (`proxy.ts`, the Next.js 16 name for middleware) reads the host:
  - The platform domain goes to the platform routes.
  - The admin host goes to the admin routes.
  - Every other host is rewritten internally to `/sites/<host>/…`, so public pages are pre-rendered and cached **per host**.
- **Server-rendered public pages** read `/api/public/sites/<host>/…`. Django maps the host to a school (subdomain or verified domain) or answers 404.
- **Browser requests** (`/api/*`: enquiries, sign-in, portal) go through the same-origin rewrite. Django works out the school from the forwarded host (`USE_X_FORWARDED_HOST`). This is safe because Django is reachable only from Next.js on the same machine (Phase 1 spec §2.5); production binds it to `127.0.0.1`.
- **Unknown hosts** get 404 from Django's own check, so `ALLOWED_HOSTS` can accept any host.
- **Suspended schools:**
  - The website shows "This school's website is temporarily unavailable" (status 503).
  - Sign-in is refused.
  - Existing sessions end on their next request.

---

## 3. Data separation (amends Phase 1 spec §3)

### 3.1 The School record

The single-row `SchoolProfile` becomes **`School`**, one row per school, in the `school` app. It keeps every profile field from Phase 1 spec §3.1 and adds:

| Field | Notes |
|---|---|
| `slug` | §2.2. Unique |
| `status` | `TRIAL` / `ACTIVE` / `SUSPENDED`. Set by platform admins |
| `levels_offered` | Which of the six levels the school teaches (Crèche … JHS). Default: all six |
| `brand_primary`, `brand_accent` | Colours (§7.2) |
| `logo` | Uploaded image. Optional |
| `created_at` | |

`SchoolDomain` stores a school's custom domains: `domain` (unique), `school`, `verified_at`, `is_primary`.

### 3.2 Every record belongs to a school

- **Every school-owned table** has a non-null `school` reference, and its unique rules become "unique within the school". That covers all of the following:
  - Website content: content blocks, photo slots, facts, feature blocks, news, enquiries, site settings.
  - Privacy notices.
  - Users, the audit log and the SMS log.
  - Every later record: pupils, parents, staff, classes, calendar and so on.
- **Filtering happens in one place.**
  - Middleware sets `request.school` from the host.
  - School-owned queries go through a `for_school(school)` manager method.
  - API views inherit from a base view that applies it.
  - A view that forgets cannot pass the test suite (§9).
- **Files** are stored under `schools/<school id>/…`.
- **Student IDs** keep the Phase 1 spec §3.3 format, with **one counter per school per year**, so two schools can each have `26-0001-…`. A Student ID is unique within its school.

### 3.3 Accounts

- **Each user belongs to exactly one school.** Platform staff belong to none.
- **Usernames, phone numbers and Student IDs are unique within a school**, not across the platform.
- Internally, each account has a platform-wide unique sign-in key made of the school's id and the identifier. Screens never show it.
- **A session belongs to the school it was opened at.** Cookies are host-only (never shared across subdomains). If a session cookie ever reaches another school's host, it counts as signed out.

---

## 4. Roles (amends Phase 1 spec §4)

- **School roles** are the 13 groups of Phase 1 spec §4.1, unchanged. They always apply within the user's own school.
- **Platform Admin** is a new kind of account (`kind = platform`) for the owner's team:
  - It **always** needs the second factor.
  - Sessions follow the second-factor timeouts: 30 minutes idle, 12 hours maximum.
- **Without a support grant, platform admins see:**
  - Each school's setup details and go-live checklist progress.
  - **Counts only** (pupils, staff, parents, enquiries).
  - Domains and status.
  - The school's Administrator accounts.
- **Without a support grant, platform admins may:**
  - Create the first Administrator.
  - Reset an Administrator's password or second factor. This is audited, and the Administrator is told by SMS.
- **Support access:**
  - A school's Administrator can grant platform support **24 or 72 hours** of read-only access to the school's records, and can end it early.
  - While the grant runs, platform admins can open the school's records from the admin area. Each look is written to the school's own audit log as `VIEWED_RESTRICTED`.
  - Nothing is ever changed through support access in this cycle.
- **The audit log** gains a `school` field: blank for platform events. Each school sees its own entries, including platform staff actions in its school. Platform admins see platform events.

---

## 5. Platform admin area (`admin.<platform domain>`)

- **Sign-in:** username and password plus the second factor. Platform accounts only.
- **Schools:** list with status, preview or live, go-live progress and date added. Search and filter by status.
- **Add a school:**
  - Fields: name, slug (suggested from the name), town, region, phone, email, levels offered, and the first Administrator (name, username, mobile).
  - The school is created with its placeholder site (§7.4) and status `TRIAL`.
  - A **one-time password** is shown once to hand over. At first sign-in the Administrator must change it and set up the authenticator app.
- **School page:**
  - Summary, counts, go-live checklist progress, domains (add, check, make primary) and Administrators (add, reset password, reset second factor).
  - Support-grant status, and a link to the school's site.
- **Suspend / reactivate:** needs a reason. Audited.
- **Leads:** the inbox for "Get your school online" requests (§6), with status `NEW` / `CONTACTED` / `ONBOARDED` / `CLOSED` and notes.
- **Platform audit log.**
- **Platform staff accounts** are created with `manage.py create_user --kind platform` in this cycle. A screen comes later.

---

## 6. Platform marketing site (`<platform domain>`)

- **Pages:**
  - **Home.** What a school gets **today**: its own website with admissions enquiries; a secure portal for staff, parents and pupils; pupil, parent and staff records; light and dark modes on any phone. It also shows the list of live schools, with links.
  - **"Get your school online"** contact form.
  - **Privacy notice.**
- **Truthful:** the Phase 1 spec rule "never promise what the system cannot yet do" applies to the platform too. Features arrive on the page as they ship.
- **Contact form:** school name, contact name, phone, email (optional), town and message, plus a consent tick.
  - Saved as a lead and emailed to `PLATFORM_EMAIL`.
  - Same spam protection as admissions enquiries (Phase 1 spec §6.4).
- **Look:** the same design system, glass and motion, in the platform's own colours. Same budget: Lighthouse ≥ 90 and about 500 KB on first mobile load.

---

## 7. School websites (amends Phase 1 spec §6 and §8)

### 7.1 Same pages, per school

Every school site has the Phase 1 spec pages and behaviour. Its content comes only from that school's records:
- **Levels:** the levels section and Levels page show **only the levels the school offers**.
- **Search and sharing:** titles, Open Graph, JSON-LD, sitemap and `robots.txt` are per host, and canonical URLs use the school's primary address.
- **Enquiries:** emails go to the school's own email address.
- **Preview:** the go-live gate (Phase 1 spec §6.5) is per school.

### 7.2 Branding

- **Logo:** an uploaded image, shown on a white tile.
  - Without one, a **monogram** (the school's initials) in its brand colour.
  - AD Smart School's logo becomes its uploaded logo.
  - The swing animation now moves the whole logo tile, so it works for every school.
- **Two brand colours:**
  - **Primary:** buttons, links and the header mesh.
  - **Accent:** highlights and the main call to action.
  - On save, the primary must reach **4.5:1 contrast with white text**, and the accent **4.5:1 with dark text**. A colour that fails is refused, with an explanation and a suggested nearby colour that passes.
  - Dark-mode variants are derived automatically and checked the same way.
- **Defaults:** a new school without colours uses the platform's Warm Authority palette (Phase 1 spec §8.1). AD Smart School keeps its logo palette as its brand colours.
- **Shared:** fonts, layout, glass, motion and accessibility rules are the same for every school.

### 7.3 Category colours

The level category colours (Early Years, Primary, JHS) stay platform-wide, so they mean the same thing on every school's site.

### 7.4 A new school's placeholder site

On creation, the school receives:

- **Content blocks** written from a template with the school's name and town. They are all `needs_review`.
- **Facts:**
  - "*n* years serving *town*", only if a founding year was given.
  - "every stage of basic education", worded from the levels offered (e.g. "Crèche–JHS" or "Basic 1–JHS 3").
- **Photo slots** pointing at the shared generic placeholder photos (`is_placeholder = true`, never public).
- Feature blocks, all **off**.
- A **draft privacy notice** naming the school as data controller.
- **No news posts.**

The site is reachable at once, in preview, until the school passes its go-live checklist.

---

## 8. Sign-in and messages (amends Phase 1 spec §5, §3.7, §10)

- **School users:** the sign-in page lives on each school's address. Staff, parents and pupils sign in to **that school only**.
- **Platform staff:** they sign in at the admin address.
- **Lockouts:** counters are kept per school and identifier, and per IP address.
- **SMS sender:** one platform sender name at launch. Every message names the school, e.g. "AD Smart School: your code is 123456".
- **"Couldn't send" message:** the §10 SMS-failure text shows the school's own phone number.
- **SMS log:** each school sees its own messages. Platform admins see counts and failures per school, never message bodies.

---

## 9. Testing additions (amends Phase 1 spec §12)

- **Cross-school matrix.**
  - Every API endpoint is called as a signed-in user of school A, against school B's host and school B's record ids.
  - Each call must answer **404 or 403** and leak nothing, not even existence.
  - A test fails the suite if a new URL pattern is not in the matrix.
- **Host resolution:** subdomain, verified custom domain, unverified domain (404), reserved slug, platform host, admin host, suspended school.
- **Sessions:** a session opened at school A is signed out at school B's host.
- **Support access:** platform admins without a grant cannot read records. With a grant they can read but not write, and the grant expires on time. Every view is audited in the school's log.
- **Branding:** colour contrast checks accept and refuse the right colours, in both themes.
- **Browser tests:**
  - Run against `adsmart.localhost` and a second school, plus the platform site and admin area.
  - A platform admin adds a school, and its placeholder site appears in preview.
  - The new school's Administrator signs in with the one-time password, changes it and sets up the second factor.

---

## 10. Build plan (replaces Phase 1 spec's plan sequence)

| Plan | Contents |
|---|---|
| 1 | Public website for one school (**done**, merged) |
| 2 | **Platform foundation:** development PostgreSQL; `School` and domains; host resolution in Next.js and Django; every website record scoped to its school; per-school branding and placeholder site; platform marketing site and leads form; `create_school` command |
| 3 | **Sign-in and security:** the existing sign-in plan, reworked for per-school accounts, school-bound sessions and platform staff |
| 4 | **School records and demo data:** Phase 1 spec §3.1–3.5 and §9, per school |
| 5 | **Portal screens:** school admin (Phase 1 spec §7) and platform admin (§5 here), support grants, on-demand revalidation |
| 6 | **Deploy readiness:** wildcard DNS, Caddy with on-demand TLS for verified domains, production settings, backups, deploy guide |

---

## 11. Out of scope for this cycle

- Billing and subscriptions.
- School self sign-up.
- Several website templates.
- One account across several schools.
- Per-school data export.
- Per-school SMS sender names.
- A database schema per school.
- Changing a school's slug from a screen.

---

## 12. Open items before launch (adds to Phase 1 spec §15)

| Item | Owner / verify with |
|---|---|
| The platform's real name and domain, and a wildcard DNS record for it | Owner |
| The platform's own privacy notice, and a data-processing agreement with each school (the school is the data controller; the platform processes data for it) | Owner; a lawyer; Data Protection Commission, Ghana |
| Pricing and how schools pay (outside the system for now) | Owner |
| The platform's SMS sender name | Owner; SMS provider |
