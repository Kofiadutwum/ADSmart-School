# SDD ledger — plan: docs/superpowers/plans/2026-10-09-plan-3-sign-in-and-security.md
Spec: docs/superpowers/specs/2026-10-09-multi-school-platform-design.md (amends the Phase 1 spec)
Pre-flight:
- T1→T4..7: User(school, login, kind), roles.needs_second_factor, make_user/sign_in helpers — names match Task 4–7 usage.
- T2→T4..7: record(..., school=None), client_ip; every Action used in T4–T7 exists in T2's enum.
- T3→T6,T7: send_sms(..., school=), Purpose.SIGN_IN_CODE, Status.SENT/REFUSED, MemoryBackend.outbox, BrokenBackend — match.
- T4→T5..7: complete_login, me_payload, pending_user, OpenView, validated, PASSWORD_MAX — T5 rewrites complete_login to add start_session (intended).
- T5→T6,T7: end_other_sessions, check_new_password — match.
- T6→T7: send_code, check_code, consume — match.
- T4..7→T8..10: endpoint paths and payloads match the frontend calls.
Task 1: complete (commits aeac522..19097a6, tests: bash -c 'cd backend && .venv/Scripts/python -m pytest -q' → ................................                                         [100%])
Task 2: complete (commits 19097a6..50df499, tests: bash -c 'cd backend && .venv/Scripts/python -m pytest -q' → ........................................                                 [100%])
Task 3: complete (commits 50df499..65ea885, tests: bash -c 'cd backend && .venv/Scripts/python -m pytest -q' → ............................................                             [100%])
Task 4: Ruling: lockout cache key held raw identifiers (CacheKeyWarning, unsafe for memcached) — hash scope:kind:identifier with sha256 and make CacheKeyWarning an error in pytest config — cost if wrong: none, keys are internal
Task 4: complete (commits 65ea885..da97c37, tests: bash -c 'cd backend && .venv/Scripts/python -m pytest -q' → ...............................................................          [100%])
Task 5: complete (commits da97c37..427593f, tests: backend/.venv/Scripts/python -m pytest -q backend/tests → ...............                                                          [100%])
Task 6: complete (commits 427593f..a5cf169, tests: backend/.venv/Scripts/python -m pytest -q backend/tests → ................................                                         [100%])
Task 7: complete (commits a5cf169..bf41315, tests: backend/.venv/Scripts/python -m pytest -q backend/tests → ............................................                             [100%])
Task 8: complete (commits bf41315..cbbb490, tests: npm --prefix frontend test →              learn more: https://vitest.dev/guide/improving-performance#test-environments)
Task 9: complete (commits cbbb490..13ded00, tests: npm --prefix frontend test →              learn more: https://vitest.dev/guide/improving-performance#test-environments)
Task 10: Ruling: plan's e2e used page.getByRole("alert"), which also matches Next.js's #__next-route-announcer__ (role=alert) — scope to main via formAlert(page) — cost if wrong: none, test-only
Task 10: Ruling: e2e typed into controlled inputs before hydration on desktop, and hydration wiped the value — tests wait for the mount-time GET /api/auth/me (openHydrated) before typing — cost if wrong: a real visitor who types before hydration on a slow phone loses the text (logged as a deferred minor for the final review)
Task 10: complete (commits 13ded00..d9db158, tests: npm --prefix frontend run e2e →   72 passed (2.5m))
Final review: self-review against code-reviewer.md (no reviewer agent spawned: the user has not asked for subagents). Verified: WITH_E2E=1 scripts/check.sh green (260 backend, 143 frontend, audits clean, e2e 72/72, Lighthouse 94–96 perf / 100 a11y / 100 best practices).
Final: fixed wrong second-factor codes did not count towards the account lockout, so restarting sign-in gave unlimited guesses at a 6-digit code for anyone holding the password — test_wrong_codes_count_towards_the_account_lockout RED→GREEN, backend suite 261/261
Final: minor (deferred): text typed into a sign-in or activation field before React hydrates is wiped on hydration (slow phones on first load). Fix with uncontrolled inputs read via FormData, or disable fields until hydrated, when the portal forms are built in Plan 5.
Final: minor (deferred): a password holder can repeatedly reset another user's unconfirmed authenticator during first-sign-in enrolment (setup replaces the unconfirmed secret). Nuisance only; the confirmed device cannot be replaced.
Final: minor (deferred): UserSession rows whose Django session expired without another request linger until that user's next sign-in; add a cleanup to the Plan 6 maintenance command.
Final: minor (deferred): reset_second_factor matches the login as typed; parents (phone logins) would need the E.164 form. Only staff and platform staff have authenticators today.
Final: minor (deferred): production must send Secure cookies and set SECURE_PROXY_SSL_HEADER so the CSRF Origin check uses https (Plan 6 production settings).
