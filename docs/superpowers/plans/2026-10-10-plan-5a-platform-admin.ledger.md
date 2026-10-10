# SDD ledger — plan: docs/superpowers/plans/2026-10-10-plan-5a-platform-admin.md
Spec: docs/superpowers/specs/2026-10-09-multi-school-platform-design.md (§4, §5, §9)
Ruling (plan): Plan 5 split into 5A (platform admin, this plan) and 5B (school admin screens, support grants, on-demand revalidation); custom domains move to Plan 6 with DNS/TLS — each part ships working software; cost if wrong: re-ordering only.
Pre-flight:
- T1→T2..T4: PlatformStaffView, school_row/school_detail, ops/console fixtures, PLATFORM_STAFF matrix label — match.
- T2→T3: services._issue_password, views._one_time — T3 rewrites services.py keeping T2's functions verbatim.
- T1..T4→T5..T7: endpoint paths/payloads match the frontend types and calls.
- T5→T6,T7: types, StatusBadge/STATUS_LABEL, suggestSlug, patchJson — match.
- T8: admin root now redirects to /schools (T5) — sign-in.spec expectation updated in T8.
Task 1: complete (commits cb0a49c..564adb7, tests: backend/.venv/Scripts/python -m pytest -q backend/tests → ...................................                                      [100%])
Task 2: complete (commits 564adb7..7c67666, tests: backend/.venv/Scripts/python -m pytest -q backend/tests → .......................................                                  [100%])
Task 3: complete (commits 7c67666..0e638fc, tests: backend/.venv/Scripts/python -m pytest -q backend/tests → ...........................................                              [100%])
Task 4: complete (commits 0e638fc..11f477c, tests: backend/.venv/Scripts/python -m pytest -q backend/tests → ..............................................                           [100%])
Task 5: complete (commits 11f477c..31348a6, tests: npm --prefix frontend test →              learn more: https://vitest.dev/guide/improving-performance#test-environments)
Task 6: Ruling: the plan's school page ran an Administrator's username and phone into one text node, so the test could not find the phone — the phone is now its own tel: link — cost if wrong: none
Task 6: complete (commits 31348a6..b6dbc0e, tests: npm --prefix frontend test →              learn more: https://vitest.dev/guide/improving-performance#test-environments)
Task 7: complete (commits b6dbc0e..71a1af3, tests: npm --prefix frontend test →              learn more: https://vitest.dev/guide/improving-performance#test-environments)
Task 8: Ruling: the new browser test found that pages without a theme toggle (all admin screens but Account) did not follow a device switch to dark mode — moved "follow the device while on System" into the boot script that runs on every page (boot-script.test RED→GREEN) and removed the toggle's duplicate listener — cost if wrong: none; one listener instead of two
Task 8: complete (commits 71a1af3..3cb119a, tests: grep -c 'All checks passed.' .superpowers/sdd/2026-10-10-plan-5a-platform-admin/check-1.log → 2)
Final review: self-review against code-reviewer.md (no reviewer agent spawned: the user has not asked for subagents). Verified: WITH_E2E=1 scripts/check.sh green (334 backend, 159 frontend, audits clean, e2e 74/74, Lighthouse 91–97 perf / 100 a11y / 100 best practices); every /api/platform/ route refuses signed-out visitors and school staff (route-walking test); no Critical or Important findings.
Final: minor (deferred): a suspended school's public pages can stay cached for up to 5 minutes until on-demand revalidation arrives (Plan 5B); its sign-ins and API stop at once.
Final: minor (deferred): the schools list works out each school's go-live list (about 4 queries a school) — fine for tens of schools; batch it before hundreds.
Final: minor (deferred): resets ask for confirmation with the browser's own dialog; a styled dialog can replace it with the school admin screens.
Final: minor (deferred): the platform audit view shows the latest 200 entries only (documented shortcut).
Final: minor (deferred): platform staff accounts are still made with manage.py create_user (amendment §5: a screen comes later).
