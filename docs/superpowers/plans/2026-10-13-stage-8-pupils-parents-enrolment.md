# Stage 8: School Portal II, Pupils, Parents and Enrolment (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pupils and their families are managed in the school portal, and parents, pupils, teachers and the Proprietor get their first screens:
- the Administrator admits and manages pupils (profile tabs, status changes, emergency contacts, photo, demo conversion);
- the Administrator links parents, sends activation texts, manages pick-up persons, records consents and places pupils in classes;
- pupils from Basic 4 get sign-ins, issued by the class teacher or the Administrator;
- teachers see their class lists, and class teachers also see parent contacts;
- the Proprietor sees an enrolment overview;
- parents see their wards, pick-up persons, consents and the privacy notice;
- pupils see their profile and class.

**Architecture:** the Stage 7 `school_admin` app grows by area: `pupils.py`, `parents.py`, `pickups.py`, `consents.py`, `enrolment.py` and `teaching_views.py`.
- **Two new apps:**
  - `family`, at `/api/parent/…` (parents only, scoped by guardianship);
  - `pupil`, at `/api/student/…`.
- **Pupil and pick-up photos** are served only through permission-checked API routes. A pupil's photo is served only with PHOTO_USE consent; screens show initials otherwise.
- **Frontend:** new pages under `sites/[host]/(portal)/`. Parents get a glass bottom tab bar on phones (P1 §7.5).

**Spec:**
- P1 (`docs/superpowers/specs/2026-10-09-ad-smart-school-website-phase1-design.md`): §3.2, §3.5, §4.2–4.3, §5.1–5.2, §7.2–7.5, §9, §11.3.
- SMS §5, §6, §30; roadmap Stage 8.

## Global Constraints

- **Server-side scoping (P1 §4.2):**
  - a teacher's class list comes from their own assignments in the current year;
  - a parent's data comes from their guardianships.
- **Restricted fields:** teachers get the pupil's non-restricted fields only (name, Student ID, gender, date of birth, class, photo with consent, status). Class teachers also get parent contacts and emergency contacts for their own class.
- **Demo records:** demo numbers are never texted; `send_sms` already refuses them, and screens say so.
- **Audit (P1 §11.3):** admissions, status changes, enrolments, guardianships, pick-up persons, consents, emergency contacts, photos, logins and activation texts.
- **No placeholder screens.**

## Review Focus

1. **Access by role and assignment:**
   - a Teacher asking for a class or pupil they do not teach gets 404;
   - a parent asking for a pupil who is not their ward gets 404;
   - a pupil can only see themself.
2. **Photos without consent:** a photo route answers 404 when PHOTO_USE consent is missing or withdrawn, even to the Administrator.
3. **Bulk enrolment:** placing a pupil who is already in another class this year moves them, closing the old place with an end date, so history is kept and the one-open-place rule is never broken.
4. **Pupil logins:** only pupils in Basic 4 and up get one. A second issue resets the password instead of failing.
5. **Activation texts:** a parent whose number is only on demo records is never texted, and the screen says the text was not sent.

---

### Task 1: Pupils API
- **`GET pupils`:**
  - filters: `q` (name or Student ID), `class`, `level`, `status`, `demo`;
  - rows: id, student_id, name, class, band, status, is_demo, `contacts_incomplete`, initials, has_photo;
  - limit 200, newest admissions first when there is no query.
- **`POST pupils`:** `admit_student`, plus an optional first class (enrol).
- **`GET/PATCH pupils/<pk>`:** the profile fields.
- **`POST pupils/<pk>/status`:** `{status, reason}`.
- **`POST/DELETE pupils/<pk>/photo`** and **`GET pupils/<pk>/photo`:** served with consent only, `Cache-Control: private`.
- **`GET/POST pupils/<pk>/contacts`;** **`PATCH/DELETE contacts/<pk>`:** audited.
- **`POST pupils/<pk>/make-real`.**
- **`GET pupils/<pk>/history`:** audit entries for the pupil and their related records.
- **Who:** reads by the Administrator and Head Teacher; writes by the Administrator.
- **Tests:** `tests/school_admin/test_pupils.py`.

### Task 2: Parents and guardians API
- **`GET parents?q=`:** rows: id, name, phone, email, children, activated, is_demo.
- **`POST parents`:** creates the parent (an existing phone gives a field error) and can link a pupil in the same call.
- **`GET/PATCH parents/<pk>`.**
- **`GET/POST pupils/<pk>/guardians`:** link an existing parent with relationship, payer and primary contact.
- **`PATCH/DELETE guardians/<pk>`:** audited.
- **`POST parents/<pk>/activation`:** sends the activation text (`ACCOUNT_NOTICE`) and answers `{sent: bool, reason}`.
- **`POST parents/<pk>/reset`:** makes the password unusable, ends sessions and sends the activation text.
- **`POST parents/<pk>/make-real`.**
- **Tests:** `tests/school_admin/test_parents.py`.

### Task 3: Pick-up persons and consents API
- **`GET/POST pupils/<pk>/pickups`;** **`PATCH pickups/<pk>`:**
  - name, phone, relationship, valid_from and valid_to;
  - `POST pickups/<pk>/end` sets valid_to to today;
  - `POST/GET pickups/<pk>/photo`;
  - all audited.
- **`GET pupils/<pk>/consents`:** each pupil consent type with given, given_at, withdrawn_at and the notice version.
- **`PUT pupils/<pk>/consents/<type>`:** `{given}` through `set_consent`.
- **`GET/PUT parents/<pk>/consents/SMS_CONTACT`.**
- **Tests:** `tests/school_admin/test_pickups_and_consents.py`.

### Task 4: Enrolment, class lists, pupil logins, Proprietor overview
- **`POST enrolments`:**
  - `{students: [ids], school_class, start_date}` moves or places each pupil;
  - an open place in the same year is closed with `end_date = start_date`;
  - answers `{placed: n}`.
- **`GET pupils/<pk>/enrolments`:** the class history.
- **`GET classes/<pk>/pupils`:** Administrator and Head Teacher, or teachers of that class (assignments this year).
- **`GET classes/<pk>/pupils/<student>`:**
  - teacher view: non-restricted fields;
  - plus `parents` and `emergency_contacts` when the user is that class's teacher, the Administrator or the Head Teacher.
- **`POST pupils/<pk>/login`:**
  - the Administrator or the class teacher of the pupil's current class;
  - first time: `give_student_login` with a generated one-time password;
  - after that: a reset;
  - answers `{username, one_time_password}`.
- **`GET enrolment-overview`:** Administrator, Head Teacher and Proprietor; counts by level and by class for the current year.
- **`me` now returns `classes`:** the classes the person teaches or looks after.
- **Tests:** `tests/school_admin/test_enrolment.py` and `test_class_lists.py`.

### Task 5: Parent and pupil APIs
- **`api/parent/wards`:** each ward's name, Student ID, class, class teacher, initials, has_photo and current pick-up persons.
- **`api/parent/wards/<pk>/photo`** and **`api/parent/pickups/<pk>/photo`.**
- **`GET api/parent/consents`:** `{notice, wards: [{id, name, consents}], own: {SMS_CONTACT}}`.
- **`PUT api/parent/consents`:** `{student|null, type, given}`.
- **`api/student/me`:** name, Student ID, class, class teacher, has_photo; `api/student/photo`.
- **Tenancy matrix** classification for all new routes.
- **Tests:** `tests/family/test_wards.py` and `tests/pupil/test_me.py`.

### Task 6: Frontend frame for the new roles
- **`school-roles.ts`:**
  - Parent → `/wards`, Student → `/my-school`, Proprietor → `/overview`;
  - Administrator and Head Teacher nav adds Pupils, Parents and Enrolment;
  - Teacher's "My classes".
- **`PortalShell`:** gains `tabs` (a glass bottom tab bar on phones for parents, at most 5 items).
- **Tests:** updated role and shell tests.

### Task 7: Pupils list, admission and the Overview tab
- **`PupilsView`:** search, filters, an Add pupil form (with optional first class), and the Incomplete-contacts warning.
- **`PupilDetail`:** tabs Overview, Parents, Pick-up persons, Class history, Consents and Change history.
- **Overview tab:**
  - profile form with a Save bar;
  - status change with a reason;
  - emergency contacts;
  - photo, or initials without consent;
  - "This is now a real record";
  - pupil login (Basic 4+).

### Task 8: The other pupil tabs
- **Parents:** link an existing parent or add a new one; edit the link; send the activation text; reset access.
- **Pick-up persons:** add, edit, photo and end.
- **Class history.**
- **Consents:** toggles with the notice version.
- **Change history.**

### Task 9: Parents page, Enrolment page, Proprietor overview, teacher class lists
- **`ParentsView`:** search, activation state and actions.
- **`EnrolmentView`:** choose a class and date, tick pupils (filter by "not in a class" or by class), Place.
- **`OverviewView`:** enrolment by level and class.
- **"My classes":**
  - My classes → `ClassListView` (`/my-classes/<id>`) → `ClassPupilView`;
  - the class teacher sees parent and emergency contacts and can issue pupil logins.

### Task 10: Parent and pupil portals
- **Parent home** (`/wards`): ward cards with photo or initials, class, Student ID, class teacher and pick-up persons. A child's name chips switch between wards.
- **Consent page:** the privacy notice, then toggles per ward plus the parent's own SMS consent.
- **Pupil home** (`/my-school`): profile, class and class teacher.

### Task 11: Browser tests and the full check
- **`e2e/school-pupils.spec.ts`:**
  - the Administrator admits a pupil and places them in a class;
  - adds a parent, sends the activation text, records photo consent and adds a pick-up person;
  - the parent activates, sees their ward and changes a consent.
- **Full check** (`WITH_E2E=1 bash scripts/check.sh`), then merge locally.
