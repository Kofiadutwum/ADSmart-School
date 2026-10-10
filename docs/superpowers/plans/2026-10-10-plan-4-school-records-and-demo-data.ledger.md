# SDD ledger — plan: docs/superpowers/plans/2026-10-10-plan-4-school-records-and-demo-data.md
Spec: docs/superpowers/specs/2026-10-09-multi-school-platform-design.md (amends the Phase 1 spec)
Pre-flight:
- T1→T3,T4: same_school, SchoolClass(.band), Term, AcademicYear, make_year/make_term/make_class — match.
- T2→T3,T7: allocate_student_id, format_student_id — match.
- T3→T4..T8: Staff/Student/Parent models, services, make_* factories — match; T4 FKs use "people.Staff".
- T5→T7,T8: Consent(student|parent, type values PHOTO_USE/MEDICAL_SHARING/SMS_CONTACT/SCHOOL_TRIPS) — demo_data uses the same strings.
- T6→T7: DEMO_LOGINS_ENABLED setting; seed_demo reads it; tests override via settings fixture — match.
- T7→T8: seed_demo(school, pupils, today) used by purge tests — match.
- Audit actions: T5 CONSENT_*, T6 DEMO_CONVERTED, T8 DEMO_PURGED — each added before first use.
Task 1: complete (commits dde7298..e3bf848, tests: backend/.venv/Scripts/python -m pytest -q backend/tests → ......................................................                   [100%])
Task 2: complete (commits e3bf848..7181de2, tests: backend/.venv/Scripts/python -m pytest -q backend/tests → ...........................................................              [100%])
Task 3: complete (commits 7181de2..ab04b20, tests: backend/.venv/Scripts/python -m pytest -q backend/tests → .....................................................................    [100%])
Task 4: Ruling: plan's new module docstring for academics/models.py is 104 chars (E501) — wrapped onto two lines — cost if wrong: none
Task 4: complete (commits ab04b20..b7518a9, tests: backend/.venv/Scripts/python -m pytest -q backend/tests → ........................................................................ [100%])
Task 5: complete (commits b7518a9..d03437e, tests: backend/.venv/Scripts/python -m pytest -q backend/tests → ....                                                                     [100%])
Task 6: complete (commits d03437e..fada0ea, tests: backend/.venv/Scripts/python -m pytest -q backend/tests → ..........                                                               [100%])
Task 7: Ruling: test_demo_sign_ins_when_enabled exposed a Plan 3 bug — signing in as a second user in an already signed-in browser crashed (login() flushes the session, leaving session_key None for UserSession) — fixed in its own commit with test_signing_in_as_someone_else_replaces_the_session RED→GREEN: complete_login now deletes the browser's previous UserSession and start_session saves a keyless session first — cost if wrong: none; it was a 500 on a real path
Task 7: complete (commits fada0ea..1e3bc10, tests: backend/.venv/Scripts/python -m pytest -q backend/tests → ......................                                                   [100%])
Task 8: complete (commits 1e3bc10..027eaf8, tests: backend/.venv/Scripts/python -m pytest -q backend/tests → ..........................                                               [100%])
Task 9: complete (commits 027eaf8..aa5b8ac, tests: backend/.venv/Scripts/python -m pytest -q backend/tests → ..........................                                               [100%])
Final review: self-review against code-reviewer.md (no reviewer agent spawned: the user has not asked for subagents). Verified: WITH_E2E=1 scripts/check.sh green (314 backend, 143 frontend, audits clean, e2e 72/72, Lighthouse 91–96 perf / 100 a11y / 100 best practices); every SMS path goes through send_sms, so the demo-number guard covers all of them; no Critical or Important findings beyond the Plan 3 sign-in bug fixed during Task 7.
Final: minor (deferred): manage.py create_user --kind parent still makes a parent account without a Parent record; Plan 5's admin screens create both together.
Final: minor (deferred): demo staff phones are not checked against real staff phones (no uniqueness on staff phone); a clash only means the real person is still texted, which is the safe side.
Final: minor (deferred): the calendar marks only rule-based holidays; Eid and newly gazetted days are added by hand (documented shortcut and README note).
Final: minor (deferred): purge_demo keeps the school year, terms, classes and subjects that seed_demo made (they are the school's structure, not people); the Administrator edits or keeps them.
Final: minor (deferred): Django admin can still edit a record's school field directly (development-only admin).
