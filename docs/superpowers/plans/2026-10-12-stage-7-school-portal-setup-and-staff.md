# Stage 7: School Portal I, Setup and Staff (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A school's own staff run their school from the portal at the school's address.
- Every role lands on its own home screen, and people with several roles get a role switcher.
- The Administrator gets a dashboard with the go-live checklist.
- The Administrator sets up the school: profile, logo and colours, programme bands, years, terms, calendar, classes, subjects and teaching assignments.
- The Administrator manages staff: add, edit, roles, reset password, switch off, and demo conversion.
- The Administrator reads the school's audit log.
- The Head Teacher reads all of it, without editing.

**Architecture:**
- **Backend:** a new `school_admin` app serves `/api/school/…`.
  - Every view reads `request.user.school`. The session middleware already keeps a school user's session to their own school's address, so a request can never reach another school.
  - Writes need the Administrator role. Reads also allow the Head Teacher (P1 §4.3).
  - Changes go through small services that write the audit log.
- **Frontend:** new pages under `sites/[host]/(portal)/`.
  - A `SchoolPortalShell` picks the navigation for the active role.
  - `PortalShell` gains the P1 §7.5 layout: a glass sidebar at 1024 px and wider, and a top bar with a slide-out menu below that.

**Tech stack:** Django 6.1 + DRF 3.18; Next.js 16 + React 19 + Tailwind 4; Vitest; Playwright.

**Spec:**
- Phase 1 spec `docs/superpowers/specs/2026-10-09-ad-smart-school-website-phase1-design.md`: §3.1, §4, §7.1–7.5, §8.5, §11.3.
- The owner's v5 specification (SMS §3, §6A, §7, §28), as listed in `docs/superpowers/roadmap.md`, Stage 7.

## Global Constraints

- **Server checks:** every endpoint checks role and school on the server. The frontend only hides what a user cannot use (P1 §4.2).
- **No placeholder screens:** roles without tools yet get Account only, never "coming soon" (P1 §7.3).
- **Audit:** every change to setup, staff, roles, passwords and the calendar is audited (P1 §11.3).
- **Swipes:** the calendar's month swipe has visible previous and next buttons (P1 §8.5).
- **Demo records:** demo records are never texted. The staff screens send no SMS.
- **Platform-only fields:** the school's name, address slug and status stay with the platform team.

## Review Focus

1. **Cross-school access:** a school's Administrator cannot read or change another school's year, class, staff member or audit entry, even by guessing ids. Every lookup filters by the user's school.
2. **Read-only roles:** a Head Teacher's POST, PATCH, PUT and DELETE are refused (403); Teachers and Parents get 403 everywhere except `me`.
3. **Lock-out:** the school always keeps one active Administrator. Removing the last one's role, switching them off, or marking them Left is refused.
4. **Calendar edits:** a day outside every term cannot be set, and setting a day twice updates it rather than failing.
5. **Deletions:** deleting a year, class or subject that other records use returns a clear message, never a server error.

---

### Task 1: School portal API foundation, `me` and the dashboard
- **`apps/school_admin`** (`SchoolAdminConfig`), mounted at `api/school/` in `config/urls.py`.
- **`permissions.py`:**
  - `SchoolRolePermission` checks `user.kind == "staff"` and `user.school_id`;
  - it then checks `view.read_roles` for safe methods and `view.write_roles` otherwise.
- **`views.SchoolView(APIView)`:**
  - `read_roles = (ADMINISTRATOR, HEAD_TEACHER)`, `write_roles = (ADMINISTRATOR,)`;
  - the `school` property returns `request.user.school`.
- **`GET me`** (any staff role): `{roles, staff: {...profile}, teaching: [{class, subject, term}], class_teacher_of: [{class, term}]}` for the current year.
- **`GET dashboard`:**
  - **counts:**
    - `students_by_level`: active students in a current-year class, by band, plus `not_in_class`;
    - `staff`: active staff accounts;
    - `classes`: classes in the current year;
    - `new_enquiries`;
  - **`checklist`:** a list of `{key, label, done, detail}` for:
    - `placeholder_photos`;
    - `demo_records`;
    - `sms_provider` (done when `SMS_BACKEND` is a real provider, not console, memory or unavailable);
    - `second_factor` (staff who need one but have neither a mobile number nor an email);
    - `profile` (address, GhanaPost GPS and logo);
    - `emergency_contacts` (active pupils with fewer than two);
    - `site_live`.
- **Tests:**
  - `tests/school_admin/test_access.py`: Administrator 200; Head Teacher GET 200 and write 403; Teacher 403; Parent 403; platform staff 403; signed out 401.
  - `tests/school_admin/test_dashboard.py`: counts and each checklist item turning done.
  - `test_tenancy_matrix.py`: classifies every `api/school/…` route as `SCHOOL_STAFF`.

### Task 2: School profile, programme bands and branding
- **`GET/PATCH profile`:**
  - **editable:** motto, founded_year, address, town, region, ghana_post_gps, phone, whatsapp, email, map_query, levels_offered, brand_primary and brand_accent;
  - **validation:** through `School.full_clean()`, with errors mapped to fields;
  - **colour help:** a colour that fails the contrast check returns its suggestion in the message;
  - **bands in use:** removing a band that has classes is refused with "Classes in Basic 4–6 use this level; remove them first";
  - **audit:** `UPDATED` with the changed fields.
- **`POST/DELETE profile/logo`:** a multipart `logo`, checked by `validate_photo`, with renditions rebuilt. Audited.
- **Site refresh:**
  - `getSite` fetches with tag `sites`;
  - `/api/revalidate` accepts `sites`;
  - `refresh_school_sites()` posts `sites` after a change.
- **Tests:** `tests/school_admin/test_profile.py`, plus the `route.test.ts` tag case.

### Task 3: Years, terms and the calendar
- **`GET/POST years`:** each year comes with its terms. A new year with `is_current` makes the other years not current.
- **`PATCH/DELETE years/<pk>`:**
  - the dates must still contain every term;
  - delete is refused while the year has classes.
- **`POST years/<pk>/terms`:** `create_term`, which generates the weekdays and holidays. A duplicate number or dates outside the year give field errors.
- **`DELETE terms/<pk>`:** refused while the term has class teachers or teaching assignments.
- **`GET calendar?month=YYYY-MM`:** `{month, days: [{date, type, note}], terms: [{id, name, start_date, end_date}]}`.
- **`PUT calendar/<date>`** (`{type, note}`):
  - creates or updates the day;
  - refused outside every term;
  - audited `UPDATED` with the old and new type.
- **`DELETE calendar/<date>`:** clears a day back to "not a school day". Audited.
- **Tests:** `tests/school_admin/test_years_and_calendar.py`.

### Task 4: Classes, class teachers, subjects and teaching assignments
- **`GET classes?year=<id>`** (default: the current year):
  - each class with its class teacher per term;
  - `year_groups` for the school's levels;
  - `terms` of the year.
- **`POST classes`** (`{academic_year, year_group, stream}`); `PATCH/DELETE classes/<pk>`. Delete is refused while pupils are enrolled.
- **`PUT classes/<pk>/class-teacher`** (`{term, staff}`): `staff: null` removes the class teacher. The staff member must hold the Teacher or Early Years Caregiver role.
- **`GET/POST subjects`; `PATCH/DELETE subjects/<pk>`:** fields `name`, `code`, `bands` and `is_learning_area`. Delete is refused while it is taught.
- **`GET teaching?term=<id>`; `POST teaching`** (`{staff, school_class, subject, term}`); **`DELETE teaching/<pk>`.**
- **Audit:** all of these are audited.
- **Tests:** `tests/school_admin/test_classes_and_subjects.py`.

### Task 5: Staff
- **`GET staff`:** rows with id, name, username, staff_number, roles, phone, email, employment_status, is_active, is_demo, `needs_second_factor`, `second_factor_ready` (a mobile number or email to receive codes) and last_sign_in.
- **`POST staff`:**
  - `create_staff` with the profile fields;
  - roles: at least one, from `STAFF_ROLES`;
  - username unique in the school;
  - returns `{staff, one_time_password}`.
- **`GET staff/<pk>`:** the row, plus the profile fields and the current year's teaching and class-teacher assignments.
- **`PATCH staff/<pk>`:**
  - profile fields, `roles` and `is_active`;
  - `employment_status = left` also switches sign-in off;
  - the last active Administrator rule applies;
  - audited `UPDATED`, `ROLES_CHANGED` and `ACCOUNT_DEACTIVATED`/`ACCOUNT_REACTIVATED`;
  - switching off ends their sessions.
- **`POST staff/<pk>/reset-password`:** a one-time password; sessions end; audited.
- **`POST staff/<pk>/make-real`:** `mark_real` on the staff record.
- **Shared code:** `platform_admin.services._issue_password` becomes the public `issue_password`, used by both.
- **Tests:** `tests/school_admin/test_staff.py`.

### Task 6: The school audit log
- **`GET audit`:** the school's entries, newest first, up to 200.
- **Filters:** `actor` (user id), `entity_type`, `entity_id`, `date_from` and `date_to` (inclusive dates).
- **Rows:** `{id, created_at, actor_name, action, action_label, entity_type, entity_id, reason}`.
- **Platform staff:** their actions in this school show too; their names are shown as "Platform support".
- **Tests:** `tests/school_admin/test_audit.py`.

### Task 7: Portal frame, role homes and the role switcher (frontend)
- **`src/lib/school-roles.ts`:**
  - the role names;
  - `SCHOOL_NAV` (`href`, `label`, `roles`);
  - `rolesWithScreens(me)`;
  - `homeFor(role)`: Administrator and Head Teacher go to `/dashboard`, Teacher and Early Years Caregiver to `/my-teaching`, everyone else to `/account`.
- **`src/components/school-portal/school-portal-shell.tsx`:**
  - the active role, stored in `localStorage` (`school-portal-role`, inside try/catch);
  - a "Viewing as" select when the person holds two or more roles with screens;
  - it passes filtered `nav` and the switcher into `PortalShell`.
- **`PortalShell` (P1 §7.5):**
  - a sticky glass sidebar at `lg` and wider;
  - below `lg`, a top bar with a Menu button that opens a slide-out panel (Radix Dialog, Esc, close button);
  - an optional `aside` slot for the switcher.
- **`SaveBar`:** a sticky glass bar at the bottom of long forms.
- **Pages:**
  - `(portal)/home` sends each role to its home;
  - school sign-in and activation land on `/home`;
  - `(portal)/my-teaching` lists the person's classes and subjects this year, from `GET /api/school/me`.
- **Tests:** `school-roles.test.ts`, `school-portal-shell.test.tsx`, an updated `portal-shell.test.tsx`, and a `my-teaching` view test.

### Task 8: Dashboard and school profile screens (frontend)
- **`DashboardView`:** count cards, students by level, and the checklist with done and not-done marks and their details (the marks are not colour alone).
- **`ProfileForm`:**
  - the fields and the levels checkboxes;
  - colour inputs with a live contrast preview, and the server's suggestion offered as a button;
  - logo upload and remove;
  - a sticky Save bar;
  - read-only for the Head Teacher.
- **Setup tabs** (`(portal)/setup/layout.tsx`): Profile, Years and terms, Calendar, Classes, Subjects, Teaching.
- **Tests:** `dashboard-view.test.tsx` and `profile-form.test.tsx`.

### Task 9: Years, terms and calendar screens (frontend)
- **`YearsView`:** add a year, make a year current, add terms, delete. Errors show on the fields.
- **`CalendarView`:**
  - a month grid (Mon–Fri plus weekends greyed);
  - tapping a day in a term opens a small dialog with Open, Holiday, Closing, Reopening and Clear, plus a note;
  - previous and next month buttons;
  - a swipe with a 40 px threshold, ignored within 24 px of the screen edges;
  - a legend that uses text as well as colour.
- **Tests:** `years-view.test.tsx` and `calendar-view.test.tsx`.

### Task 10: Classes, subjects and teaching screens (frontend)
- **`ClassesView`:** year picker, add a class (year group and stream), and a class teacher per term (select from teachers).
- **`SubjectsView`:** add and edit, with band checkboxes and "learning area".
- **`TeachingView`:** a term picker, a table of assignments, add (teacher, class, subject) and remove.
- **Tests:** a test file for each view.

### Task 11: Staff and audit screens (frontend)
- **`StaffView`:**
  - a filter (all, missing second factor, switched off, demo);
  - cards on phones and a table on wide screens;
  - an Add form that shows the one-time password note.
- **`StaffDetail`:**
  - the profile form with a Save bar;
  - role checkboxes;
  - switch off or on, reset password, and "This is now a real record";
  - the person's teaching and class-teacher assignments, linking to Setup.
- **`SchoolAuditView`:** filters for person (staff list), record type, record id and date range.
- **Tests:** `staff-view.test.tsx`, `staff-detail.test.tsx` and `school-audit-view.test.tsx`.

### Task 12: Browser tests and the full check
- **`e2e/serve.mjs`:** creates a Sample School Administrator and a Head Teacher for the tests (test-only passwords already used by the suite).
- **`e2e/school-portal.spec.ts`:**
  - the Administrator lands on the dashboard;
  - adds a year and a term, sets a holiday, adds a class and a subject;
  - adds a teacher, sees the one-time password, assigns teaching;
  - sees it all in the audit log;
  - the Head Teacher sees the dashboard and staff without edit buttons.
- **Full check:** `WITH_E2E=1 bash scripts/check.sh`, with the dev servers stopped for Lighthouse. Then merge locally.
