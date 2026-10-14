# ADsmartschool: everything asked for, what is built, and the build order

**Written:** 2026-10-12, at the owner's request: "go through all i sent you and the additions and lets
build the remaining one. Don't leave anything out."

**Sources, in full:**
- **[SMS]** *Ghanaian School Management System Specification v5* (the owner's Word document, 40
  sections and Appendix A).
- **[P1]** `specs/2026-10-09-ad-smart-school-website-phase1-design.md`
- **[MS]** `specs/2026-10-09-multi-school-platform-design.md`
- **[BT]** `specs/2026-10-10-platform-business-tools-design.md`
- **[CHAT]** the owner's decisions in conversation:
  - the rebrand to ADsmartschool, and Sample School;
  - sign-in codes by SMS or email;
  - billing answers;
  - Vercel, Neon and Cloudinary;
  - the admin address before a domain.

Every row names its source, so nothing can drop out silently. A stage is finished only when its
browser tests, accessibility checks and Lighthouse budget pass, and it is merged.

---

## Built (stages 1–22, merged)

| Area | Source |
|---|---|
| Public school website (all pages, enquiry form, go-live gate, SEO, Lite mode, themes, glass and motion) | P1 §6, §8 |
| One platform, many schools: school records, host routing, separation, branding, placeholder sites, platform site, leads | MS §2–§7 |
| Sign-in: three tabs, school-bound sessions, lockouts, "Where you're signed in", parent activation by SMS code, second factor by SMS or email code | P1 §5, CHAT |
| Domain model: years, terms, calendar, classes, subjects, class-teacher and teaching assignments, pupils with check-digit IDs, parents, guardianships, pick-up persons, emergency contacts, staff, enrolments, consents | P1 §3, SMS §6–§7 |
| Demo school (`seed_demo`, `purge_demo`, DEMO flag, no SMS to demo numbers) | P1 §9 |
| Platform admin: schools, add a school, Administrators, suspend, leads, audit, team roles and Team page | MS §5, BT §2 |
| Your own website: gallery, articles and tips, comments, questions, tip sign-up, WhatsApp link, visit counts, instant refresh | BT §5 |
| Going live: Vercel, Neon, Cloudinary, SMTP email, signed forwarding, cron, `ADMIN_HOST`, deploy guide | CHAT, P1 §13 |
| School portal I (Stage 7): role homes and switcher, sidebar and phone menu, dashboard with go-live checklist, school profile, levels, logo and colours, years, terms, month calendar, classes and class teachers, subjects, teaching assignments, staff (add, roles, switch off, reset password, demo), school audit log, Head Teacher read-only, My teaching | P1 §7.2–7.5, SMS §7, §28 |
| School portal II (Stage 8): pupils (search, admission, record tabs, status with reason, emergency contacts, photo with consent, demo), parents (link, activation text, reset), pick-up persons, consents against the privacy notice, enrolment in bulk with history, pupil sign-ins from Basic 4, teachers' class lists (contacts for the class teacher), Proprietor overview, parent portal (Home, My wards, Consent, bottom tabs), pupil My school | P1 §3.2, §3.5, §5, §7.2–7.5; SMS §5, §6, §30 |
| Stages 9–22 (built together): the school website from the portal; support access with every look logged; school web addresses with a DNS check; SMS credits, approved wording, announcements and delivery reports; scheduled jobs; fees, invoices, gapless receipts, the append-only ledger, wallets, discounts, instalments, refunds and reversals; daily canteen and extra-class lists with late edits, cash-ups, weekly statements and teacher pay; transport with boarding texts; platform billing (five plans, trials, gapless bills, credits, reminders, pausing) and the school Billing page; Paystack, payment links, USSD with simulator and statement matching; statistics; attendance with absence texts, staff attendance and leave, assessment set-up, marks, approval workflow, positions and report cards withheld for fees with release; daily care, pick-up control, visitors, medical, sickbay, incidents and special needs (restricted); full parent and pupil portals; bookshop and uniforms with collection codes; lesson notes; timetable with clash checks and cover; year-end rollover, CSV reports, audit export, backup check, retention command, data requests and breach log; support conversations and platform announcements; learning resources; quizzes with AI drafting | SMS §5–§39, BT §3–§6, MS §4 |

---

## Remaining, in build order

Each stage gets a plan, test-first code, a full check and a local merge.

### Stage 7: school portal I (setup and staff), built
- **Role home screens and switcher:** every role lands on its own home screen, and a role switcher appears for people with several roles (P1 §1.1(3), §5.1).
- **Portal layout:** glass sidebar, top bar with menu on phones, sticky Save bar (P1 §7.5).
- **Administrator dashboard:** counts of students by level, staff, classes and new enquiries; the **go-live checklist** (placeholder photos, demo records, SMS provider, second factor set up, profile complete, students missing two emergency contacts, site live) (P1 §7.2, MS §5).
- **School setup:**
  - **profile:** motto, address, GhanaPost GPS, contacts, logo, brand colours with the contrast check (P1 §3.1, MS §7.2);
  - **years and terms:** academic years and terms, with weekday calendar generation;
  - **calendar:** month view; tap a day to set open, holiday, closing or reopening; swipe between months (audited);
  - **classes and streams**, with the class teacher per term;
  - **subjects and learning areas** per band;
  - **teaching assignments** per term (P1 §7.2, SMS §7).
- **Staff:**
  - list, add (with sign-in), edit profile (qualifications, licence, emergency contact, employment status);
  - assign roles, and teaching and class-teacher assignments;
  - reset password, deactivate and reactivate;
  - "who has not set up a second factor";
  - DEMO badge and "this is now a real record" (P1 §7.2, §9; SMS §28).
- **School audit log**, filtered by person, record type, record and date (P1 §7.2, MS §4).
- **Head Teacher:** read-only school summary, classes, staff and calendar, plus the audit log (P1 §7.3).

### Stage 8: school portal II (pupils, parents, enrolment), built
- **Students:**
  - search by name or Student ID; filter by class, level, status or demo;
  - add (admission with Student ID);
  - profile tabs: Overview, Parents, Pick-up persons, Class history, Consents, Change history;
  - status change with a reason;
  - emergency contacts, with an "Incomplete" warning below two;
  - photo through permission-checked serving, initials without PHOTO_USE consent;
  - DEMO conversion (P1 §3.2, §3.5, §7.2; SMS §6).
- **Parents:** add; link to children (relationship, payer, primary contact); send the activation SMS; reset access (P1 §7.2).
- **Pick-up persons:** add, edit and end, with photo and validity dates; audited (P1 §3.2, §11.3).
- **Enrolment:** place pupils in classes, singly or in bulk, with history kept (P1 §7.2).
- **Consents:** record, give or withdraw by type, against the privacy notice version; audited (P1 §3.5).
- **Student logins** (Basic 4+): the class teacher or Administrator issues and resets them; the pupil must change it at first sign-in (P1 §5.1, SMS §5).
- **Teacher:** "My classes" from assignments, then the class list, then the pupil profile (non-restricted fields); the class teacher also sees parent contacts (P1 §4.3, §7.3).
- **Proprietor:** read-only enrolment overview by level and class (P1 §7.3).
- **Parent (first version):** bottom tabs Home, My wards, Consent, Account; ward cards with class, Student ID, class teacher and pick-up persons (P1 §7.3).
- **Student (Basic 4+):** profile, class and account security (P1 §7.3).
- **Privacy notice:** shown to parents in the portal (SMS §30).

### Stage 9: school websites from the portal, support access, domains, built
- **Website section in the school portal:**
  - content blocks (with "reviewed"), facts, photo slots (upload, alt text, placeholder flag) and feature blocks;
  - news (drafts and publishing) and the enquiry inbox (status, notes);
  - the school's privacy notice (draft and approve);
  - **Mark site live**, disabled while the checklist has blockers;
  - instant refresh of school sites (P1 §2.2, §6.5, §7.2; BT §9 5F).
- **Platform admin:**
  - custom domains (add, check by DNS TXT, make primary) (MS §2.3, §5);
  - the platform's own privacy notice: draft and approve, which removes the platform Preview ribbon (CHAT);
  - each school's SMS counts and failures (MS §8).
- **Support access:**
  - the school's Administrator grants 24 or 72 hours of read-only access and can end it;
  - platform staff open records while the grant runs, each view logged as `VIEWED_RESTRICTED` (MS §4).
- **School SMS log**, for the school's own messages (MS §8).

### Stage 10: notifications and the SMS provider, built
- **SMS provider backend:** Arkesel by default, behind the existing gateway, configured by settings (P1 §1.3, SMS §24, §32).
- **Message templates** approved by the Head Teacher; a delivery log per message with provider delivery reports (SMS §24).
- **SMS credits remaining**, with a low-credit warning to the Administrator (SMS §24, §36).
- **Message preferences:** parents choose non-essential messages (SMS_CONTACT); safety and payment messages always go (P1 §3.5, SMS §24).
- **Scheduled jobs runner:** one cron endpoint runs due work (reminders, re-checks, statements); daily on Vercel Hobby (SMS §32).
- **Announcements to parents and staff**, by SMS and in the portal (SMS §24, §20).

### Stage 11: finance core I (fees, invoices, ledger, payments, wallets), built
- **Fee structures** by band, class, year, term and charge type; optional charges (bus, canteen plan, extra classes, BECE and mock fees) (SMS §13).
- **Invoices and invoice lines** per student; arrears carried forward and shown separately (SMS §13).
- **Discounts and scholarships** (sibling, staff child, bursary), with approver and reason (SMS §13).
- **Instalment plans** with due dates and SMS reminders before and after (SMS §13, §24).
- **Single ledger:** every amount in pesewas; never deleted; reversed by a linked entry (SMS §13, §39).
- **Payments:**
  - cash, bank slip and direct MoMo (pending until matched);
  - **sequential receipts**, with SMS and portal notice;
  - refunds and reversals raised by Accounts and approved by the Head Teacher or Proprietor (SMS §13, §18).
- **Prepaid wallet** per student (canteen, bus), with top-ups and a low-balance alert (SMS §13, §24).
- **Accountant workspace:** payment history search; filters by type, class, term, year and dates (SMS §13).

### Stage 12: finance core II (canteen, extra classes, transport, cash-up), built
- **Category rates** (Early Years, Primary, JHS): combined daily amount and canteen amount, set by the Administrator with Head Teacher approval; audited (SMS §14.1).
- **The class teacher's daily list:**
  - amounts filled in by the system (plus bus);
  - tick Paid or Absent; Mark all paid; wallet or advance payments shown as paid;
  - closing the day;
  - late edits need Head Teacher approval (SMS §14).
- **Splitting each payment** into canteen, extra-class and bus ledger entries; part payment by Accounts or the Canteen Officer (canteen first, order configurable); exemptions, reduced amounts and discounts; absent pupils not charged (SMS §14).
- **Canteen Officer:** all classes; covers classes without a teacher; daily hand-over count and sign-off; differences flagged to the Head Teacher (SMS §13, §14).
- **Day-end cash-up** for every cash collector (SMS §13).
- **Weekly class statement:**
  - Accounts approves it, then it goes by SMS to the class teacher (split if long);
  - a printable full statement is kept in the portal (SMS §14.3).
- **Extra-class pay:**
  - pay rules (percentage, per pupil-day or fixed; minimum and maximum; per class or pooled per category, with shares);
  - weekly calculation, adjustments with a reason, approval, SMS confirmation, and marking it paid with a reference (SMS §14.3).
- **Transport:**
  - buses, routes, pick-up points and student assignment;
  - daily bus fee added to the canteen list;
  - drivers and attendants with licence and insurance expiry;
  - change of pick-up point confirmed by the parent (SMS §15).
- **Allergy check before meals** in canteen records (SMS §14).

### Stage 13: platform billing (school subscriptions), built
- **Plans:** the five plans (yearly price; Enterprise "From"), changed by Owner or Finance (BT §3.1, CHAT).
- **Subscriptions:** each keeps its own price; changes apply to new schools only; trials (BT §3.2).
- **School groups (Enterprise):** one bill for the whole group (BT §3.2).
- **Bills:**
  - numbered without gaps;
  - payments recorded by hand, credits, reversals and refunds;
  - print-friendly receipts (BT §3.3–§3.6).
- **Reminders, and pausing for non-payment** (off by default, with Billing-only access) (BT §3.7).
- **Finance screens and settings, CSV downloads** (BT §3.8).
- **The school's Billing page** (BT §3.9).
- **Prices section** on your website (BT §5.4).

### Stage 14: online payments, reconciliation and platform statistics, built
- **Paystack (MoMo and card):**
  - pending transactions with unique references;
  - redirect plus webhook (with signature check) plus server verification;
  - idempotency; amount check;
  - a re-check job for old pending transactions;
  - fee bearer as a setting;
  - SMS payment links (SMS §18).
- **Used for:** parents paying school invoices and the wallet, and schools paying their platform bills (SMS §18, BT §3.5).
- **USSD shortcode:**
  - session flow: Student ID with check digit, first name and class only, payment type, amount, confirm;
  - provider callback, verify, post to the ledger or wallet, SMS receipt;
  - limits on wrong IDs;
  - an aggregator-neutral interface with a simulator until a provider is chosen (SMS §18.1).
- **Reconciliation:** import MoMo, Paystack and bank statements; match them to the ledger; list unmatched items (SMS §13, §25).
- **Platform Statistics page** (BT §4).

### Stage 15: attendance, assessment, results and report cards, built
- **Student attendance:**
  - Present, Absent, Late and Excused, on open calendar days only;
  - early-years arrival and departure, with who collected checked against the pick-up list;
  - same-day absence SMS;
  - drafts saved offline (SMS §8, §9).
- **Staff attendance and lateness; leave requests and approval** (SMS §28).
- **Configuration per band and year:** grading scales, assessment components and weights, pass thresholds and position rules (SMS §7, §10).
- **Exams and marks:** examinations; marks entry (drafts offline); totals, grades and remarks; averages; positions where enabled (with a tie rule); descriptive results per learning area (SMS §10).
- **Approval:** Teacher submits, review, Head Teacher approves, published; changes after publication need approval and a reason (SMS §10).
- **Report cards:**
  - scored, descriptive and Crèche developmental templates;
  - attendance, conduct, interest, promotion, reopening date, fees outstanding;
  - remarks from the class teacher and Head Teacher;
  - print or PDF;
  - optional withholding for arrears, logged, with a Head Teacher override (SMS §11).

### Stage 16: early years, safeguarding and health, built
- **Daily care report:**
  - arrival and departure, meals (with an allergy alert), sleep, toilet, mood and activities;
  - incidents (staff signature; parent alerted at once);
  - supplies;
  - a two-way parent note moderated by the class teacher (SMS §11A).
- **Pick-up control:**
  - release only to authorised people or a one-time parent approval;
  - otherwise blocked, with the Head Teacher alerted and the parent notified;
  - every release recorded and the parent notified (SMS §27.1).
- **Gate and visitor log**; late arrival and early departure (SMS §3, §27).
- **Medical records** (allergies, conditions, medication, clinic):
  - restricted to the Nurse, Head Teacher and class teacher;
  - allergy alerts to the Canteen Officer;
  - every view logged (SMS §6, §27, §37).
- **Sickbay log; incident and discipline log** (restricted) (SMS §27).
- **Special learning needs** (restricted) (SMS §6).
- **Bus boarding log:** a bus attendant records boarding and drop-off by phone; the parent is notified (SMS §15).

### Stage 17: the full parent and student portals, built
- **Parent portal**, mobile-first and light on data, with multiple wards:
  - daily reports, academic performance and attendance;
  - invoices and balances, Pay now, wallet and receipts;
  - bookshop and uniforms, pick-up persons (with one-time approvals);
  - messages and notifications, consent and profile, learning resources (SMS §19).
- **Student portal (Basic 4+):** profile, results and report cards, attendance, announcements, bookshop, and fees only if the school allows (SMS §20).
- **Performance analysis:** averages, subjects, term comparison, attendance percentage, position, trends, and attention thresholds (SMS §21).

### Stage 18: bookshop, uniforms, lesson notes, timetable, built
- **Books catalogue:** title, subject, class, year, price and stock, with price history; a required-books list per class (SMS §16.1).
- **Orders:** by parents and pupils (pupil orders send the parent an SMS payment link).
- **Order statuses:** awaiting payment, awaiting stock, ready to issue, part issued, issued, cancelled or refunded.
- **Collection** by code at the counter.
- **Uncollected reminders**; book list added to a new pupil's invoice (SMS §16.2).
- **Stock movements** and low-stock alerts (SMS §16.1).
- **Uniforms:** catalogue with sizes, orders the same way, and size history with a suggestion (SMS §17).
- **Lesson notes:**
  - configurable templates (Basic and JHS; play-based for early years);
  - Draft, Submitted, Returned, Reviewed and Approved;
  - Head Teacher review (SMS §12).
- **Timetable:** by class and teacher, with clash detection and substitute cover (SMS §28).

### Stage 19: year-end, reports, dashboards, protection, built
- **Year-end promotion and rollover:**
  - the Head Teacher decides for every pupil;
  - new enrolments, arrears carried forward, the next year's invoices (SMS §29).
- **Reports**, as CSV and print or PDF:
  - academic, attendance, fees (aged arrears 30, 60 and 90 days; collection rate);
  - canteen and wallet, transport, bookshop and uniforms, reconciliation;
  - safeguarding, extra-class pay, per student, and school-wide (SMS §25).
- **Class-based financial analysis** (SMS §26).
- **Administrator and Proprietor dashboard** with every figure in SMS §36.
- **Backups:** a backup and restore guide, plus a restore-test command each term (SMS §31, P1 §2.5).
- **Audit tools:** search and export; audit coverage for SMS §37 (SMS §37).
- **Data protection:**
  - a parent's data-copy request and corrections;
  - retention rules;
  - a breach procedure (SMS §30).
- **Security headers** (CSP, Permissions-Policy, HSTS, framing denied), and an error page showing a request ID (P1 §10, §11.1).

### Stage 20: talking with schools, built
- **Announcements** from the platform to schools (BT §6.1).
- **Support conversations** between a school and the platform team (BT §6.2).

### Stage 21: learning resources, built
- **Resources** per class and subject: uploads and legitimate links; search by title, subject and class (SMS §22).

### Stage 22: AI-assisted questions and quizzes, built
- **Teacher-led generation:** the teacher chooses class, subject, topic, difficulty and number. The AI drafts questions, and the teacher edits and approves them (SMS §23).
- **Quizzes:** published to students, objective items auto-marked, subjective answers to the teacher, learning analytics.
- **Privacy:** only the topic, level and difficulty go to the AI service, never personal data (SMS §23, §30).

---

## Needs the owner (built so it works the moment they're supplied)

| Item | Used in |
|---|---|
| SMS provider account and sender name | 10 |
| Paystack business account and keys | 13, 14 |
| USSD shortcode aggregator | 14 |
| AI service key (Anthropic) | 22 |
| Your prices' "what's included" lists | 13 |
| A domain | school websites online |
| GES / NaCCA assessment weights and report-card fields (configurable, not coded) | 15 |
| Data Protection Commission registration and retention periods | 19 |
