# SDD ledger — plan: docs/superpowers/plans/2026-10-09-plan-2-platform-foundation.md
Spec: docs/superpowers/specs/2026-10-09-multi-school-platform-design.md (amends the Phase 1 spec)
Pre-flight: Task 2 consumes Task 1 branding/slugs; Task 3 consumes Task 2 School/SchoolOwned/mixin change; Task 4 consumes resolve_host + is_site_public + Task 3 PLATFORM_PRIVACY_NOTICE_BODY; Task 5 consumes Task 2 payload (base_url, logo, levels_offered, brand); Task 6 consumes Task 5 types; Task 7 consumes Task 4 API (url added); Task 8 consumes all — names match across Interfaces blocks.
Ruling: request_school()/school_for_host() helpers instead of a tenancy middleware (amendment §3.2 says middleware) — same single choke point, no per-request query on endpoints that need no school — cost if wrong: Plan 3 adds middleware for session binding anyway.
Ruling: Django's three app migrations regenerated from scratch (no data migration) — nothing deployed, dev DB new — cost if wrong: an old local SQLite db must be deleted.
Ruling: suspended school pages render /unavailable with HTTP 200 + noindex, not 503 (amendment §2.4) — App Router has no API to set 503 from a page — cost if wrong: crawlers briefly see a 200; noindex limits it.
Ruling: SiteSettings merged into School.is_live/went_live_at — one row per school already holds site state — cost if wrong: none (no data).
Task 0: complete (commits cc15017..e26a92d, tests: bash -c 'cd backend && .venv/Scripts/python -m pytest -q' → ...........                                                              [100%])
Task 1: complete (commits e26a92d..963e558, tests: bash -c 'cd backend && .venv/Scripts/python -m pytest -q tests/school' → ................................                                         [100%])
Task 2: complete (commits 963e558..d5235af, tests: bash -c 'cd backend && .venv/Scripts/python -m pytest -q' → ................................................................         [100%])
Task 3: complete (commits d5235af..aa6711a, tests: bash -c 'cd backend && .venv/Scripts/python -m pytest -q' → ......................................................................   [100%])
Task 4: complete (commits aa6711a..40e6bd8, tests: bash -c 'cd backend && .venv/Scripts/python -m pytest -q' → .......                                                                  [100%])
Task 5: Ruling: plan line "`frontend/src/test/site-fixture.ts`: in makeSite, add…" was read by the materializer as a whole file — restored from git and applied as an edit — cost if wrong: none, tests cover the fixture.
Task 5: complete (commits 40e6bd8..c39a99a, tests: bash -c 'cd frontend && npx vitest run' →              learn more: https://vitest.dev/guide/improving-performance#test-environments)
Task 6: Ruling: brand-link.test.tsx asserted the removed AD Smart SVG mark — now asserts the decorative monogram (same intent: accessible name is only the school name) — cost if wrong: none.
Task 6: complete (commits c39a99a..1743762, tests: bash -c 'cd frontend && npx vitest run --reporter=dot' →              learn more: https://vitest.dev/guide/improving-performance#test-environments)
Task 7: Ruling: dev check found the running next dev serving a stale api.ts (500s); restarted it — not a code defect — cost if wrong: none.
Task 7: complete (commits 1743762..6f5abf2, tests: bash -c 'cd frontend && npx vitest run --reporter=dot' →              learn more: https://vitest.dev/guide/improving-performance#test-environments)
Task 8: Ruling: home page Lighthouse performance fell to 86 once the logo became an <img>; logo now fetchPriority=low + decoding=async (test added, RED→GREEN) — 94–96 on all four pages — cost if wrong: the logo appears a moment later on slow phones.
Task 8: complete (commits 6f5abf2..1bae88d, tests: bash -c 'cd frontend && npx vitest run --reporter=dot' →              learn more: https://vitest.dev/guide/improving-performance#test-environments)
Final review: self-review against code-reviewer.md (no reviewer agent spawned: the user has not asked for subagents). Verified: scripts/check.sh green (151 backend, 113 frontend, audits clean), e2e 60/60, Lighthouse 94–96 perf / 100 a11y; unknown-school robots/sitemap/OG all 404; no Critical or Important findings.
Final: minor (deferred): routeFor does not validate Host characters — a crafted Host with "/.." can steer the rewrite to another internal tree (public pages only; Caddy rejects such hosts in production). Fix with a [a-z0-9.-] check in Plan 6.
Final: minor (deferred): BrandStyle's value whitelist would allow url(...)-shaped strings; values are Django-computed colours only. Tighten to hex/rgb() in Plan 5 when schools can edit colours.
Final: minor (deferred): platform payload checks go-live per school (4 queries each) — fine for tens of schools; batch it before hundreds.
Final: minor (deferred): production must set SITE_URL_TEMPLATE / PLATFORM_DOMAIN and bind Django to 127.0.0.1 (ALLOWED_HOSTS=*, USE_X_FORWARDED_HOST) — Plan 6 production settings must refuse dev defaults.
Final: minor (deferred): subdomain → verified primary custom domain redirect (amendment §2.3) not built; needed with domain verification in Plan 5/6 (until then OG/canonical stay on the subdomain).
Final: minor (deferred): PrivacyNotice (school, version) uniqueness does not cover the platform's own notices (NULL school).
