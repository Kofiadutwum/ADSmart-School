# AD Smart School: Public Website and Phase 1 Foundation (Design)

| | |
|---|---|
| Date | 9 October 2026 |
| Status | Draft for owner review |
| Source | *School Management System: System Structure, Functional Specification, Flowcharts and Pseudocode*, v5, 2 October 2026 (cited below as **SMS spec §n**) |
| Scope of this document | The public school website, and Phase 1 of SMS spec §38 |

---

## 1. Context and intent

**AD Smart School** is a private school in Kronom, Kumasi (Ashanti Region), founded in 2001, serving Crèche to JHS 3.
Contact: 0545 875 881 · kofiadutwumjnr881@gmail.com.

The school will use this system for real, day to day. It is a production deployment, so children's data, logins and (later) money must be handled to production standard. The project owner builds and maintains the code and works most comfortably in Python.

The full system in SMS spec v5 is about 30 modules and 10 build phases. **This cycle delivers two things:**

1. **The public school website**, whose job is to win new parents and lead existing families to the portal.
2. **Phase 1 of SMS spec §38**: authentication with 2FA, users and roles, students with programme levels, parents, pick-up persons, staff, classes, subjects, academic years and calendar, enrolments and consent records.

Every later phase gets its own design → plan → build cycle.

### 1.1 Success criteria

This cycle is done when:

1. An Administrator signs in with a second factor and can set up the school profile, programme bands, academic year, terms, calendar, classes and subjects. They can also manage staff (roles and teaching assignments), students (with check-digit Student IDs), parents, pick-up persons, enrolments and consents.
2. A parent activates their account with an SMS code, signs in on a phone and sees their children.
3. Every role lands on its own home screen. People with several roles can switch between them.
4. The public website works from 375 px to 1440 px wide, passes automated WCAG 2.2 AA checks, scores ≥ 90 on Lighthouse mobile, and keeps the first mobile load around 500 KB.
5. Every sensitive change listed in §11.3 appears in the audit log.
6. The system is **deployment-ready**: production configuration and a written deploy guide exist. Launch itself waits on the items in §15.

### 1.2 Decisions made by the owner

| Topic | Decision |
|---|---|
| Purpose | Real school deployment |
| First slice | Public website + Phase 1 foundation |
| Website's job | The school's public website (win new parents; portal sign-in for families and staff) |
| Photos in `Codes/` | Use as **placeholders** in swappable slots. Launch only after real AD Smart School photos replace them (§6.5) |
| Maintainer | The owner, in Python |
| Existing records | None. Generate realistic demo data, which the admin replaces with real records over time (§9) |
| Architecture | Django REST API + React frontend, using **Next.js** |
| Visual direction | **Warm Authority** (logo palette), with **glassmorphism**, **swipe interactions** and **spring/swing animations** throughout (§8) |
| Browser visual companion | Declined; design discussed in text |

### 1.3 Assumptions (owner may correct)

- **SMS:** sits behind a pluggable gateway. Development prints messages to the console. A Ghana provider (e.g. Arkesel, Hubtel or mNotify) is chosen before launch.
- **Hosting:** chosen at deploy time. Nothing in the code depends on a particular host.
- **Language:** English only.
- **Enquiries:** website admissions enquiries are saved in the system and emailed to the school address.
- **Website content:** all text, photos, facts, news and contact details are edited by the Administrator in the portal, not hard-coded.
- **Proprietor 2FA:** the **Proprietor** also gets a second factor, because they see school-wide finances. SMS spec §31 lists only Administrator, Head Teacher and Accounts.
- **Deferred to Phase 5:** medical summary, allergies and special-learning-needs fields (SMS spec §6). They arrive with the restricted-access screens that protect them.

---

## 2. Architecture

### 2.1 Repository layout

One git repository, `C:\Dev\ad-smart-school\` (outside OneDrive; see §13).

```
ad-smart-school/
├── backend/                 Django + Django REST Framework + PostgreSQL
│   ├── config/              settings from environment variables (dev / production)
│   └── apps/
│       ├── accounts/        users, roles, sign-in, 2FA, SMS codes, active sessions
│       ├── school/          school profile, programme bands, levels, academic years,
│       │                    terms, calendar, classes, subjects, teaching assignments
│       ├── people/          students, emergency contacts, parents, guardianships,
│       │                    pick-up persons, staff, enrolments, demo-data commands
│       ├── consent/         consent records, privacy-notice versions
│       ├── website/         public content blocks, photo slots, facts, feature blocks,
│       │                    news, admissions enquiries
│       ├── notifications/   SMS gateway interface, backends, delivery log
│       └── audit/           append-only audit log
├── frontend/                Next.js (App Router, TypeScript, Tailwind CSS)
│   ├── app/(public)/        Home, About, Levels, Admissions, News, Contact, Privacy
│   └── app/(portal)/        Sign-in flows, then one area per role
└── docs/                    specs, plans, deploy guide
```

### 2.2 How a request flows

- **One domain for everything.** The browser talks only to the Next.js server. Next.js serves pages and **rewrites `/api/*` to Django**, so the API is same-origin.
- **Sign-in:** a Django session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`) plus Django's CSRF token, which the frontend sends as `X-CSRFToken`. No login tokens are kept in browser storage.
- **Portal pages** are client-rendered React. They call the API from the browser, so no cookie forwarding through Next.js server code is needed.
- **Public pages** are pre-rendered (static generation with time-based revalidation, every 5 minutes). They also refresh **on demand**: when the Administrator saves website content, Django calls a secret-protected Next.js revalidation endpoint.

### 2.3 Files

| Kind | Examples | Served how |
|---|---|---|
| Public | Website photo slots, news covers, logo | Public URLs, responsive WebP/AVIF via `next/image` |
| Private | Student photos, pick-up-person photos | Only through an authenticated, permission-checked API endpoint. Never by a guessable public URL |

Development stores files on local disk. Production uses the host's disk or S3-compatible storage, chosen at deploy.

### 2.4 Technology

| Layer | Choice |
|---|---|
| Backend | Python 3.14; current stable Django release supporting 3.14 (exact version pinned in the implementation plan); Django REST Framework; PostgreSQL |
| Backend libraries | `argon2-cffi` (password hashing), `django-otp` (authenticator and backup codes), `django-axes` (lockouts), `phonenumbers` (Ghana number validation and +233 normalisation), `Pillow` (images) |
| Frontend | Next.js (App Router) + TypeScript; Tailwind CSS; shadcn/ui (Radix primitives); TanStack Query; React Hook Form + Zod; Motion for React (lazy-loaded); Embla Carousel; Lucide icons; `next/font` with self-hosted Outfit and Work Sans |
| Tests | pytest, pytest-django, factory_boy; Vitest + React Testing Library; Playwright + `@axe-core/playwright`; Lighthouse CI |

### 2.5 Production shape (host-agnostic)

```
Internet ──HTTPS──▶ Caddy (TLS, security headers)
                      ├──▶ Next.js server (Node)  ── /api/* ──▶ Django (gunicorn)
                      │                                           │
                      └──────────── static/media ──────────────────┤
                                                                   ▼
                                                              PostgreSQL
```

- Configuration and secrets come only from environment variables. `.env.example` is committed; a real `.env` never is.
- Daily database and media backups are configured at deploy. Restore tests are scheduled from Phase 8 (SMS spec §38).

### 2.6 Deliberately not in Phase 1

- **Background task queue (Celery + Redis).** Phase 1 sends only one-off SMS codes, so they go straight to the provider with a short timeout. The queue arrives in Phase 2 with bulk reminders.
- **Payments and the ledger:** Phases 2 and 3.

---

## 3. Domain model (Phase 1)

### 3.1 School configuration (`school` app)

| Model | Key fields | Notes |
|---|---|---|
| `SchoolProfile` (single row) | name, motto, founded_year, address, town, region, ghana_post_gps, phone, whatsapp, email, logo | Seeded with AD Smart School details. Editable by Administrator |
| `ProgrammeBand` | code, name, category (`EARLY_YEARS` / `PRIMARY` / `JHS`), assessment_style (`CARE` / `DESCRIPTIVE` / `SCORED`), student_login (bool), positions_allowed (bool), order | Seeded per SMS spec §6A: Crèche, Nursery, KG, Basic 1–3, Basic 4–6, JHS |
| `Level` | band, name (Crèche, Nursery 1, … Basic 9), short_name, typical_age_from, typical_age_to, order | Basic 7–9 display as JHS 1–3 |
| `AcademicYear` | name (`2026/2027`), start_date, end_date, is_current | Only one current year |
| `Term` | academic_year, number (1–3), start_date, end_date | |
| `CalendarDay` | date, term, type (`OPEN` / `HOLIDAY` / `CLOSING` / `REOPENING`), note | Creating a term generates weekdays as `OPEN`; the admin edits from there. Attendance (Phase 4) counts `OPEN` days |
| `SchoolClass` | academic_year, level, stream (e.g. `A`), display name (e.g. `Basic 2A`) | Category comes from the level's band |
| `Subject` | name, code, bands (many-to-many), is_learning_area | Learning areas serve the descriptive bands |
| `ClassTeacherAssignment` | school_class, staff, term | One class teacher per class per term. Temporary substitutes (SMS spec §14) arrive later |
| `TeachingAssignment` | staff, school_class, subject, term | Controls who may see which class (SMS spec §7) |

### 3.2 People (`people` app)

| Model | Key fields | Notes |
|---|---|---|
| `Student` | student_id, first_name, middle_name, surname, date_of_birth, gender, photo, status, admission_date, previous_school, address, pickup_point, is_demo | Status: `ACTIVE` / `TRANSFERRED` / `COMPLETED` / `WITHDRAWN` / `SUSPENDED`. Never deleted; a status change needs a reason (audited). Programme level comes from the current enrolment |
| `EmergencyContact` | student, name, phone, relationship, priority | At least two expected (SMS spec §6). A student with fewer shows an **Incomplete** warning and is counted on the go-live checklist; entry is not blocked |
| `Parent` | user (one-to-one), title, first_name, surname, phone (E.164, unique), alt_phone, email (optional), address, is_demo | The school creates the account at admission. It stays inactive until the parent activates it (§5.2) |
| `Guardianship` | parent, student, relationship (`MOTHER` / `FATHER` / `GUARDIAN` / `OTHER`), is_payer, is_primary_contact | Siblings are students sharing a parent |
| `PickupPerson` | student, name, phone, photo, relationship, valid_from, valid_to, is_demo | Gate verification logic arrives in Phase 5 |
| `Staff` | user (one-to-one), staff_number, first_name, surname, phone, email, qualifications, licence_number, emergency_contact, employment_status, is_demo | Roles live on the user (§4) |
| `Enrolment` | student, school_class, academic_year, start_date, end_date, outcome (`PROMOTED` / `REPEATED` / `LEFT` / null) | History is never overwritten. At most one open enrolment per student per academic year (database constraint) |

### 3.3 Student ID

- **Format:** 7 digits: `YY` (admission year) + `NNNN` (sequence within that year) + `C` (Damm check digit). Displayed as `26-0147-3`; typed as `2601473`. Input accepts dashes and spaces.
- **Why Damm:** it detects **every** single-digit error and **every** swap of two adjacent digits. This matters for keypad entry and for the USSD payments planned in Phase 3 (SMS spec §18.1).
- **Allocation:** a per-year counter row, locked with `SELECT … FOR UPDATE`, so concurrent admissions never collide. IDs are never reused. That allows 9,999 admissions per year.

### 3.4 Phone numbers

Inputs such as `024 xxx xxxx`, `+233 24 xxx xxxx` and `23324xxxxxxx` are validated as Ghana mobile numbers and stored as E.164 (`+23324xxxxxxx`). Screens show the local format `024 xxx xxxx`.

### 3.5 Consent (`consent` app)

| Model | Key fields |
|---|---|
| `PrivacyNotice` | version, body, effective_from |
| `Consent` | subject (a student **or** a parent, enforced by a check constraint), type (`PHOTO_USE` / `MEDICAL_SHARING` / `SMS_CONTACT` / `SCHOOL_TRIPS`), given (bool), given_at, withdrawn_at, recorded_by, privacy_notice_version |

- **Without `PHOTO_USE` consent**, every screen shows the student's initials instead of their photo.
- `SMS_CONTACT` covers **non-essential** messages only. Safety, security and payment messages, including sign-in codes, cannot be switched off (SMS spec §24).

### 3.6 Website (`website` app)

| Model | Key fields |
|---|---|
| `ContentBlock` | key (e.g. `hero_headline`, `hero_subline`, `about_history`, `head_teacher_welcome`), text |
| `PhotoSlot` | key (`hero`, `about`, `gallery_1` … `gallery_n`, `level_<code>`), image, alt_text, caption, is_placeholder |
| `Fact` | label, value, order, visible |
| `FeatureBlock` | key (`SMS_UPDATES`, `MOMO_USSD`, `DAILY_CARE`, `SAFE_PICKUP`), title, text, enabled (**default off**) |
| `NewsPost` | title, slug, body, cover image, status (`DRAFT` / `PUBLISHED`), published_at |
| `Enquiry` | parent_name, phone, email (optional), child_name, child_date_of_birth, level_wanted, preferred_visit_date, message, data_consent (bool), status (`NEW` / `CONTACTED` / `VISITED` / `ENROLLED` / `CLOSED`), staff_notes, created_at |

### 3.7 Notifications (`notifications` app)

- **`SmsGateway` interface:** `send(to, body, purpose) → result`, with two backends in Phase 1: `ConsoleBackend` (development) and one provider backend added before launch.
- **Guards, applied before any backend:**
  1. Refuse any recipient linked only to `is_demo` records.
  2. Per-number rate limits by purpose.
  3. Respect `SMS_CONTACT` consent for non-essential purposes.
- **`SmsMessage` log:** recipient, purpose, template, body (sign-in codes redacted), status, provider_reference, error, created_at.

### 3.8 Audit (`audit` app)

- **`AuditLog`:** actor, action, entity_type, entity_id, old_value (JSON), new_value (JSON), reason, ip_address, created_at.
- **Append-only:** no update or delete through the application, and the database role used by the app is denied `UPDATE`/`DELETE` on this table.
- **Written only from the service layer**, never from views directly, so no code path can skip it.
- **A `VIEWED_RESTRICTED` action type** exists now. It is first used in Phase 5, when health and discipline records arrive.

---

## 4. Roles and permissions

### 4.1 Roles

The 14 roles of SMS spec §3 map to **13 Django groups**:

Administrator · Proprietor · Head Teacher · Accountant · Teacher · Early Years Caregiver · Front Desk Officer · School Nurse · Bookshop Keeper · Canteen Officer · Transport Officer · Parent · Student.

SMS spec §3 lists "Class Teacher" and "Subject Teacher" as two roles. Here they merge into one **Teacher** group, and the difference is held as **assignments per term** (§3.1), so the same person can be class teacher of Basic 2A and subject teacher of Basic 5 Mathematics. One user may hold several roles.

### 4.2 Rules

- **Every API endpoint is checked on the server** by role **and** by scope: assignment, guardianship or self. The frontend hides what a user cannot use but never decides access.
- **Scoping happens in the database query.** A teacher's student list is built from their assignments, so out-of-scope rows are never fetched in the first place.

### 4.3 Phase 1 access

| Role | Phase 1 access |
|---|---|
| Administrator | Everything in Phase 1: setup, people, enrolment, users and roles, website content, enquiry inbox, audit log. No cash handling (SMS spec §3) |
| Head Teacher | Read: school summary, students, staff, classes, calendar. Read: audit log |
| Teacher | Own assigned classes: class lists and pupil profiles (non-restricted fields). **Class teacher only:** parent contacts for their own class |
| Proprietor | Read-only overview: enrolment by level and class |
| Parent | Own children only: profile, class, class teacher, pick-up persons (view). Own consents (view and change). Own account |
| Student (Basic 4+) | Own profile and class. Own account |
| Accountant, Caregiver, Front Desk, Nurse, Bookshop Keeper, Canteen Officer, Transport Officer | Sign-in, profile and security only. Their tools arrive with their phases |

---

## 5. Authentication

### 5.1 Sign-in

One sign-in page with three tabs. There is no self-registration; the school creates every account (SMS spec §5).

| Tab | Identifier | Second factor |
|---|---|---|
| Parent | Mobile number + password | No |
| Student (Basic 4+) | Student ID + password. Issued and reset by the class teacher or Administrator; **must be changed at first sign-in** | No |
| Staff | Username + password | **Required** for Administrator, Head Teacher, Accountant and Proprietor |

- **Failures:** every wrong username or password gives the same message, "Incorrect username or password". An inactive account gives "Account unavailable. Contact the school." (SMS spec §5.1).
- **Where people land:** after sign-in, the user goes to their role's home screen. Users with several roles get a role switcher in the header.

### 5.2 Parent activation and password reset

1. The parent chooses **First time / Forgot password** and enters their phone number.
2. The reply is always the same: *"If this number is registered, a code has been sent."* This stops anyone from discovering which numbers belong to the school.
3. If the number belongs to an active or awaiting-activation parent, a **6-digit SMS code** is sent. It is stored hashed, is valid for 10 minutes, allows 5 attempts and can be used once.
4. The parent sets a password and is signed in.

The Administrator can also trigger the activation SMS from the parent's record.

### 5.3 Second factor

- **Setup:** at first sign-in for the four roles above. The primary method is an authenticator app (TOTP, e.g. Google or Microsoft Authenticator), with a code by SMS as fallback.
- **Backup codes:** 10 one-time codes, shown once, to print and keep.
- **Recovery:** an Administrator can reset another user's second factor (audited). Resetting an Administrator's own second factor requires a second Administrator, or a server command run by the owner.

### 5.4 Passwords

- **Storage:** Argon2 hashing; plain text is never stored.
- **Rules:** minimum 8 characters; common and breached-pattern passwords rejected (Django validators). Long passphrases are welcome. There are no arbitrary complexity rules.

### 5.5 Abuse limits

- **Wrong passwords:** limited per account and per IP address, followed by a temporary lockout (`django-axes`). Every failure is logged.
- **SMS code requests:** capped at 3 per hour per number and 10 per hour per IP address, because each SMS costs money.

### 5.6 Sessions

| Who | Idle timeout | Maximum |
|---|---|---|
| Staff with second factor | 30 minutes | 12 hours |
| Other staff, students | 2 hours | 12 hours |
| Parents | 2 hours, or **30 days** if "Keep me signed in on this phone" is ticked | 30 days |

- **"Where you're signed in":** every user has this page listing device, browser, IP area and last seen, with a button to sign out any other session.
- **Forced sign-out:** changing a password or second factor signs out all other sessions.

### 5.7 Audited

Sign-ins, failures, lockouts, password resets, second-factor setup or reset, role changes and account activation and deactivation.

---

## 6. Public website

### 6.1 Pages

Home · About · Levels · Admissions · News (list and article) · Contact · Privacy notice.

### 6.2 Home, top to bottom

1. **Header (glass, sticky).** Logo, navigation and a **Portal sign-in** button. On phones the navigation collapses into a menu, and sign-in stays visible in the bar.
2. **Hero.** Headline and subline (admin-editable; default subline *"Kronom, Kumasi · Since 2001"*). Primary button **Apply for admission** (amber); secondary button **Book a school visit**. A large hero photo slot sits behind a clear-glass card.
3. **Proof strip.** True facts only. Defaults: *25 years in Kronom* (computed from the founding year) and *Crèche to JHS under one roof*. The Administrator may add real figures. **No invented statistics** (e.g. BECE pass rates). Hidden facts don't render.
4. **Levels.** Six cards: Crèche, Nursery, KG, Lower Primary (Basic 1–3), Upper Primary (Basic 4–6), JHS. Each shows its age range and what is distinctive about it, taken from SMS spec §6A (e.g. daily care reports in Early Years, BECE preparation in JHS 3). Each carries its category colour (§8.1).
5. **For parents.** Feature blocks for SMS updates, MoMo/USSD payment, daily care reports and safe pick-up. **Each is off by default and switched on by the Administrator only once that feature is live**, so the website never promises what the system cannot yet do.
6. **Facilities gallery.** Photo slots, swipeable (§8.5).
7. **News and key dates.** The latest three published news posts, plus the next reopening and closing dates read live from the school calendar (§3.1).
8. **Admissions call-to-action band**, then the **footer**: address, GhanaPost GPS, tap-to-call, WhatsApp, email, a map that loads only when tapped (to save data), privacy notice link, copyright.

### 6.3 Other pages

- **About:** history since 2001, motto, head teacher's welcome (content blocks).
- **Levels:** a detailed section per band.
- **Admissions:** process steps, requirements, age guide and the enquiry form.
- **News:** published posts only.
- **Contact:** all contact details and the tap-to-load map.
- **Privacy notice:** the current `PrivacyNotice` version (SMS spec §30).

### 6.4 Admissions enquiry form

- **Fields:** parent name\*, phone\*, email, child's name\*, child's date of birth\*, level wanted\*, preferred visit date, message, and a data-use consent tick\* that links to the privacy notice.
- **On submit:** the enquiry is saved with status `NEW`, an email goes to the school address, and the parent sees a confirmation screen. The parent is **not** sent an SMS in Phase 1, to control cost.
- **Spam protection:** a hidden honeypot field, a minimum fill time, and rate limits per IP address and per phone number. No CAPTCHA.
- **Inbox:** enquiries are worked in the Administrator's **Enquiry inbox** (§7.2).

### 6.5 Placeholder photos and the go-live gate

- **Placeholders:** the 14 images in `Codes/` are copied in as placeholders (`is_placeholder = true`). They include AI-generated images and photographs of other schools, so they must **not** appear on the live public site.
- **The gate:** while any slot is a placeholder, or the site is not marked live, every public page shows a **"Preview: not yet public"** ribbon and sends `noindex`.
- **The checklist:** the Administrator dashboard's **go-live checklist** (§7.2) lists each remaining placeholder slot.

### 6.6 Performance budget

These numbers must hold on low-end Android over mobile data:

- First mobile load ≈ 500 KB or less (HTML + CSS + JS + hero image).
- Lighthouse mobile ≥ 90 for Performance, Accessibility, Best Practices and SEO.
- Only the hero image loads eagerly. All other images are lazy, responsive WebP/AVIF with declared dimensions, so the layout doesn't shift as they load.
- Fonts are self-hosted, subset, and use `font-display: swap`.
- Motion and carousel code is lazy-loaded only on pages that use it.

### 6.7 Search and sharing

- Unique page titles and descriptions.
- Open Graph and Twitter cards, so links shared on WhatsApp or Facebook show a preview.
- schema.org `School` JSON-LD: name, address, phone, `foundingDate` 2001.
- `sitemap.xml` and `robots.txt`. `noindex` applies until live (§6.5).

---

## 7. Portal screens (Phase 1)

### 7.1 Shared by every user

Sign-in (three tabs), activation, forgot password, second-factor setup and verification, backup codes, change password, "Where you're signed in", my profile.

### 7.2 Administrator

- **Dashboard.**
  - **Go-live checklist:** placeholder photos remaining; demo records remaining; SMS provider connected; second factor set up by every required staff member; school profile complete; students missing two emergency contacts; site marked live.
  - **Counts:** students by level, staff, classes, new enquiries.
- **School setup.**
  - School profile and programme bands.
  - Academic years and terms.
  - **Calendar:** a month view. Tap a day to set it open, holiday, closing or reopening; swipe between months.
  - Classes and streams, with class-teacher assignment.
  - Subjects and learning areas.
- **Students.**
  - Search by name or Student ID. Filter by class, level, status or demo.
  - Each profile has tabs: **Overview · Parents · Pick-up persons · Class history · Consents · Change history**.
  - Status changes require a reason.
- **Parents.** Add, link to children (relationship, payer, primary contact), send the activation SMS, reset access.
- **Staff.** Add; assign roles; set teaching and class-teacher assignments per term; reset password; see who has not yet set up a required second factor.
- **Enrolment.** Place pupils in classes, singly or in bulk (select pupils → choose class).
- **Website.** Content blocks, facts, photo slots (upload, alt text, placeholder flag), feature blocks, news, the **Enquiry inbox** (status, notes) and the **Mark site live** switch, which is disabled while the checklist has blockers.
- **Audit log.** Filter by person, record type, record or date.

### 7.3 Other roles

| Role | Screens |
|---|---|
| Head Teacher | School summary, classes, staff, students (read), calendar, audit log |
| Teacher | **My classes** (from assignments) → class list → pupil profile (non-restricted fields). Class teacher also sees parent contacts for their own class |
| Proprietor | Read-only enrolment overview by level and class. Finance figures join in Phase 2 |
| Parent | Bottom tab bar on phones: **Home · My wards · Consent · Account**. *My wards* shows cards with photo (or initials), class, Student ID and class teacher. Child detail includes the pick-up persons list (view only; requesting changes arrives in Phase 5) |
| Student (Basic 4+) | Profile, class, account security |
| All others | Profile and security only. **No "coming soon" placeholder screens** |

### 7.4 Django's built-in admin

Enabled in development only and **disabled in production**. All production changes go through the portal's audited service layer.

### 7.5 Layout behaviour

| Width | Navigation | Lists and forms |
|---|---|---|
| ≥ 1024 px | Glass sidebar | Tables; forms in up to 2 columns |
| 768–1023 px | Collapsible sidebar | Tables with priority columns |
| < 768 px | Parents: glass bottom tab bar (≤ 5 items). Staff: glass top bar with slide-out menu | Tables become cards; forms one column; sticky **Save** bar |

### 7.6 Frontend patterns

- **Components:** shadcn/ui, built on Radix, so they are keyboard-accessible, themed with the tokens in §8.
- **Data:** TanStack Query, with retries and stale-while-revalidate for reads.
- **Forms:** React Hook Form + Zod for instant feedback. **The server re-validates everything**, and its errors map back onto the fields.

---

## 8. Visual design system: Warm Authority + Glass + Motion

The direction comes from the UI/UX Pro Max design-system searches, adapted:

- **"Trust & Authority" for parents:** clean layout, a credibility-first hero, accent colour reserved for actions.
- **Logo palette in place of generic navy and gold.**
- The owner's request for **glassmorphism, swipes and swing animations** everywhere, within the accessibility and performance limits below.

### 8.1 Colour tokens

All colours are taken from the logo. Contrast figures are WCAG ratios.

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--brand-indigo` | `#0F1A9E` | Headings, primary buttons, header tint | White on it: 12.6:1 |
| `--brand-amber` | `#F0AD1C` | Primary CTA fill (*Apply for admission*), Early Years category | `--ink` on it: 9.1:1. **Never use amber as text on light backgrounds** (2:1) |
| `--brand-cerulean` | `#0277BD` | Links, info, Primary category | White on it: 4.8:1 |
| `--brand-violet` | `#8806A8` | Accents, JHS category | White on it: 7.9:1 |
| `--brand-copper` | `#C4601F` | Small decorative highlights only | White on it: 4.2:1, so **large text (≥ 24 px) or decoration only** |
| `--ink` | `#14123A` | Body text | On `--paper`: ~17:1 |
| `--ink-muted` | `#4A4E69` | Secondary text | On `--paper`: 7.7:1 |
| `--paper` | `#FAF9F6` | Page background | |
| `--card` | `#FFFFFF` | Solid surfaces (Lite mode) | |
| `--danger` | `#DC2626` | Errors, destructive actions | White on it: 4.8:1 |
| `--success` | `#15803D` | Success states | White on it: 5.0:1 |

- **Category colours:** Early Years = amber, Primary = cerulean, JHS = violet. They are always paired with a text label, never colour alone.
- **Light theme only** in Phase 1. Every colour is a token, so dark mode can be added later.

### 8.2 Glass

| Tier | Recipe | Allowed for |
|---|---|---|
| **Clear glass** | `rgba(255,255,255,0.18)` fill, `backdrop-filter: blur(16px) saturate(140%)`, 1 px `rgba(255,255,255,0.35)` border, soft inner highlight | Only over photos and brand gradients, and only for **large text and controls**: hero card, header over the hero, sign-in card. Text is white over an indigo scrim gradient (≥ 55%) beneath the glass, with contrast verified for each hero photo |
| **Frosted glass** | `rgba(255,255,255,0.85)` fill, `backdrop-filter: blur(12px)`, 1 px `rgba(15,26,158,0.08)` border | Everything people read or type in: forms, tables, profiles, dashboard tiles, menus, toasts, modals, bottom sheets, sticky header and nav bars once scrolled |

- **Backgrounds behind glass:**
  - **Portal and sign-in:** a soft, static mesh gradient of the logo colours (indigo → cerulean → violet, with an amber glow). It is a static CSS gradient, not an animated canvas.
  - **Website:** photos and the same gradient.
- **Limits:**
  - At most **3 blurred layers** visible at once.
  - **Never blur behind long scrolling lists**; list containers use frosted glass without `backdrop-filter`.
- **Lite mode.** The page sets `data-lite` on `<html>`, which replaces all `backdrop-filter` with solid tinted surfaces of equivalent colour. It switches on when **any** of these is true:
  - `@supports not (backdrop-filter: blur(1px))`
  - the `Save-Data` request header is present or `navigator.connection.saveData` is true
  - `navigator.deviceMemory <= 2`
  - `prefers-reduced-transparency: reduce`
  - the user turns it on in Account → Display

### 8.3 Typography

- **Fonts:** Outfit for headings, chosen because its geometric round forms echo the logo's lettering. Work Sans for body text and UI.
- **Scale:** 14 (labels and captions; never body), 16 (body, inputs), 18, 22, 28, 36, 48 (hero on desktop; 36 on phones).
- **Body text:** line height 1.6 and lines of 60–75 characters on desktop.
- **Weights:** headings 600–700, body 400, labels 500.
- **Numbers:** tabular figures for IDs, dates and counts.

### 8.4 Shape, depth and spacing

- **Corner radius:** 12 px for controls, 16 px for cards and sheets, full rounding for chips and avatars.
- **Shadows:** two elevation levels plus the glass inner highlight. No arbitrary shadow values.
- **Spacing:** a 4 px base scale (4, 8, 12, 16, 24, 32, 48, 64, 96).
- **Breakpoints:** 375, 768, 1024, 1440.
- **Icons:** Lucide only, with consistent stroke. Icons are never emoji.
- **Gem motif:** a small faceted shape from the logo, used sparingly as a section accent.

### 8.5 Swipe interactions

Every swipe has a **visible tap and keyboard alternative**, as WCAG 2.2 dragging movements requires.

| Where | Swipe | Alternative |
|---|---|---|
| Website facilities gallery | Left/right between photos (Embla) | Arrow buttons, dots, keyboard arrows |
| Full-screen photo viewer | Left/right between photos; down to close | Arrows, close button, Esc |
| Level and news cards on phones | Horizontal scroll-snap row | Visible next/previous buttons; all cards also reachable by Tab. Grid on desktop |
| Parent home | Left/right between children | Name chips to tap |
| Calendar (admin) | Left/right between months | Previous/next month buttons |
| Bottom sheets and modals | Down to close | Close (X) button, Esc |
| List rows (enquiry inbox, students) | Left to reveal actions (e.g. *Mark contacted*, *Call parent*) | "⋯" menu on each row |

- **Edge dead zone:** swipes never start within 24 px of the screen edges, so they don't fight the phone's back gesture.
- **No horizontal swiping on whole pages.** Vertical scrolling is always primary.
- **Feedback and thresholds:** gestures track the finger in real time and need a movement threshold before starting, which avoids accidental swipes.

### 8.6 Spring and swing motion

Built with Motion for React (`LazyMotion` + `domAnimation`), loaded only where used.

- **Signature swings (featured moments):**
  - **Logo gem:** swings like a pendant from its top point, once on first load and on hover. Spring: stiffness 120, damping 8, starting from about 8°.
  - **Level cards:** swing into place from their top edge as they scroll into view (rotate −6° → 0° with a spring, plus fade). Each card animates once.
  - **Notification bell:** swings when a new item arrives.
- **Everyday motion:**
  - **Buttons:** press scales to 0.97 and springs back.
  - **Tabs:** the underline springs between tabs.
  - **Sheets and modals:** spring open from the control that opened them. Exits run about 65% of the enter duration.
  - **Lists:** items enter in a cascade, 30 ms apart, capped at 10 animated items.
  - **Success:** a check-mark spring "pop" after saving.
  - **Pages:** route changes slide in the navigation direction (forward = from the right, back = from the left).
- **Motion tokens:** `--motion-fast` 120 ms, `--motion-base` 200 ms, `--motion-slow` 320 ms. Springs come in three presets: `snappy` (stiffness 400, damping 30), `gentle` (stiffness 170, damping 22) and `swing` (stiffness 120, damping 8).
- **Rules:**
  - At most **1–2 featured animations per screen.**
  - Animate only `transform` and `opacity`, never layout properties.
  - Every animation can be interrupted by a tap, and none blocks input.
  - Under `prefers-reduced-motion: reduce`, elements render in their final state immediately, or with a plain fade of 120 ms or less. No swings, slides or cascades.

### 8.7 Accessibility baseline (WCAG 2.2 AA)

- Text contrast ≥ 4.5:1, or ≥ 3:1 for large text and UI boundaries, checked on glass in its real context.
- Visible focus rings: 2 px indigo with 2 px offset; amber on dark or indigo surfaces. Sticky glass bars must never hide the focused element.
- A skip link; sequential headings; labelled inputs with persistent helper text.
- Errors appear under the field (`aria-describedby`) and in a focusable error summary after a failed submit.
- Tap targets ≥ 44 × 44 px with ≥ 8 px gaps.
- Icon-only buttons have accessible names. Decorative icons use `aria-hidden`.
- Toasts don't steal focus (`aria-live="polite"`).
- Text resizes to 200% without breaking the layout or causing horizontal scrolling.

---

## 9. Demo data

The school has no existing records, so a **`seed_demo`** management command creates a realistic school:

- The current academic year with three terms and a generated calendar, including Ghanaian public holidays as `HOLIDAY`.
- One class per level from Crèche to JHS 3, with a second stream for two of the larger levels.
- About 250 pupils with Ghanaian names (e.g. Ama Mensah, Kofi Boateng, Esi Owusu, Yaw Asante), valid check-digit Student IDs, ages that fit their level, and two emergency contacts each.
- Parents linked to their children, with siblings sharing parents, and pick-up persons.
- Staff covering every role, with class-teacher and teaching assignments.
- Consents in a realistic mix; sample news posts; and the default website content blocks, facts and feature blocks (features off).

**Rules:**

- **Flagged.** Every demo record has `is_demo = true` and shows a **DEMO** badge everywhere it appears.
- **Converting a record.** When the Administrator overwrites a demo record with real details, they tick **"This is now a real record"**. That clears the flag and is audited.
- **No SMS to demo records.** The SMS gateway refuses any recipient linked only to demo records (§3.7). Generated numbers may belong to real people.
- **Demo sign-in accounts** (one per role, for trying the system) are created **only when `DEMO_LOGINS_ENABLED=true`**. Production settings refuse to start with that flag on. Demo *records* may exist in production until replaced; demo *logins* may not.
- **Removal.** `purge_demo` deletes all remaining demo rows. It refuses to run if any real record still references a demo record, and lists those references instead.

---

## 10. Error handling

- **One error format from the API:** `{ "code": "…", "message": "…", "fields": { "<field>": ["…"] } }`. Plain-language messages, and never a stack trace for users.
- **On screen:** field errors appear under the field, a focusable summary appears after a failed submit, and the first error receives focus.
- **Weak connections:** reads retry quietly. A glass "You're offline" bar appears while the browser is offline. Leaving a form with unsaved changes asks for confirmation.
- **SMS failure:** the delivery log records the provider error, and the user sees *"We couldn't send the code. Try again, or call the school on 0545 875 881."*
- **Server errors:** logged with a request ID. The user sees a friendly page showing that request ID.

---

## 11. Security

### 11.1 Transport and headers
HTTPS only, with HSTS. Secure session and CSRF cookies. A strict Content Security Policy (self-hosted fonts and scripts, no third-party scripts in Phase 1). `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy` are set, and framing is denied.

### 11.2 Access
- Role and scope are checked on every endpoint, with scoping done in the database query (§4).
- Private photos are served only through permission-checked requests.
- The account-recovery flow cannot reveal which accounts exist.
- Django admin is off in production.

### 11.3 Audit coverage (Phase 1)
- User creation and role or permission changes.
- Password resets; second-factor setup and reset; account activation and deactivation.
- Sign-in failures and lockouts.
- Student status changes and transfers.
- Enrolment changes.
- Pick-up person changes.
- Consent given or withdrawn.
- Calendar changes.
- Demo-to-real conversions.
- Website go-live.

### 11.4 Secrets and dependencies
- Secrets live only in environment variables.
- `pip-audit` and `npm audit` run with every check, and dependencies are pinned.
- **Where checks run:** a single local `check` script runs linting, type checks, all tests and the audits. When the repository gets a GitHub remote, the same script runs in GitHub Actions on every push.

---

## 12. Testing

Behaviour is test-driven: the test is written before the code.

**Backend (pytest + pytest-django + factory_boy):**
- **Permission matrix:** every endpoint × every role, including scope cases such as *a teacher cannot read another class's pupils* and *a parent cannot read another family's child*.
- **Student ID:** exhaustive tests that every single-digit substitution and every adjacent transposition of sample IDs is rejected; concurrent allocation never duplicates an ID.
- **Sign-in:** generic errors, lockout, SMS-code expiry, attempt limits and single use, second-factor enforcement for the four roles, session timeouts, and sign-out of other sessions.
- **Audit:** an entry is written for every item in §11.3.
- **Demo and consent:** SMS refused for demo-only recipients; no photo returned without `PHOTO_USE` consent.
- **Enquiries:** honeypot, rate limits, email sent, status workflow.
- **Phone numbers:** Ghana normalisation.

**Frontend (Vitest + React Testing Library):** form validation and error mapping, swipe components with button alternatives, Lite-mode switching, reduced-motion behaviour.

**Browser tests (Playwright):** run at **375 px and 1440 px**, with axe accessibility scans on every visited page:
1. Public site → submit enquiry → confirmation.
2. Parent activation via SMS code (console backend) → sign-in → sees children.
3. Administrator sign-in with second factor → add student → appears in class list with a valid Student ID.
4. Teacher sees only their assigned classes.

**Lighthouse CI** checks the public pages against the §6.6 budget, both normally and in Lite mode.

---

## 13. Development setup and deploy readiness

- **Prerequisites the owner installs once:** PostgreSQL (exact steps go in the implementation plan). Python 3.14 (`py` launcher), Node 24 and git are already present.
- **Project-local tooling:** a Python virtual environment with pinned requirements; npm for the frontend.
- **Running locally:** two commands start the system. Django serves on `:8000`; Next.js serves on `:3000` and proxies `/api`.
- **OneDrive:** the working folder `Codes/` is inside OneDrive. OneDrive on Windows cannot exclude sub-folders by pattern, and syncing `node_modules/`, `.venv/` and `.next/` (tens of thousands of files) causes slowness and file-lock errors during installs and builds. **The repository therefore lives at `C:\Dev\ad-smart-school\`**, outside OneDrive (moved there on 9 October 2026, at the owner's request). Off-machine backup comes from git (a private GitHub repository) rather than OneDrive. The source photos stay in `Codes/` and are copied into the repository.
- **Repository contents:** the 14 `Codes/` images are copied into the project as placeholder photo-slot images, and the logo (provided by the owner) as the brand asset. An SVG trace of the logo is made for crisp rendering, with the PNG kept as source.
- **Deploy readiness:** production settings, the Caddy configuration, process definitions for Next.js and gunicorn, `.env.example`, backup configuration, and a step-by-step deploy guide in `docs/`.

---

## 14. Out of scope for this cycle

- Phases 2–10 of SMS spec §38: finance and ledger, canteen and extra classes, SMS reminders, payments (Paystack, MoMo, USSD), attendance, assessment and results, report cards, early-years daily reports, safeguarding and health tools, bus, bookshop and uniforms, lesson notes, timetable, rollover, advanced reports, learning resources and AI.
- Bulk import from spreadsheets: the school has no existing records. It can be added later if needed.
- Dark mode, and languages other than English.
- The production launch itself (§15).

---

## 15. Open items before launch

| Item | Owner / verify with |
|---|---|
| Real AD Smart School photos for every photo slot | School |
| School motto, history text, head teacher's name and welcome message, confirmed age ranges per level, actual classes and streams | School |
| Hosting provider and a domain name | Owner |
| SMS provider account and **registered sender name** (SMS spec Appendix A) | Owner; provider and telecom regulator |
| Registration as a data controller; retention periods; privacy notice wording (Act 843, SMS spec §30) | Data Protection Commission, Ghana; a lawyer |
| Outgoing email account for enquiry notifications (SMTP) | Owner |
