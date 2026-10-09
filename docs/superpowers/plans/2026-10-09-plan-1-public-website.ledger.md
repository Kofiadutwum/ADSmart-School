# SDD ledger — plan: docs/superpowers/plans/2026-10-09-plan-1-public-website.md
Spec: docs/superpowers/specs/2026-10-09-ad-smart-school-website-phase1-design.md (read)
Setup: Ruling: work on branch `plan-1-public-website` in the main checkout instead of a separate worktree — new repo with no other work in flight; keeps .claude/launch.json and preview paths simple — cost if wrong: none (branch isolates from main).
Pre-flight (shared interfaces):
- T3 build_renditions/image_payload -> T6 mixin, T7 payload: signatures match.
- T4 normalise_gh_phone/format_gh_local/whatsapp_link -> T5 clean(), T7 payload, T8 serializer/email: match.
- T5 FORMAT_HELP, PrivacyNotice.current -> T6 models/services: match.
- T7 PublicView/views.py -> T8 replaces views.py wholesale, keeping T7 views: consistent.
- T9 content keys -> T15/T16 contentOf keys (hero_*, levels_intro, level_<code>_*, admissions_*, contact_hours, footer_tagline, head_teacher_*): match.
- T7/T8 JSON shapes -> T12 types.ts; Enquiry.Level codes -> T12 LEVELS + T16 LEVEL_CODES: match.
- T11 CSS classes/tokens -> T12-T16 components: match (animate-sheet-in/fade-in added in T11).
- T13 getSite/getNewsList/contentOf -> T14-T17: match. T15 makeSite -> T17 seo.test: match.
Task 0: Ruling: added .superpowers/ to .gitignore — plan omitted it but the executing-plans workspace must stay out of git — cost if wrong: none
Task 0: complete (commits 8662c58..8b7b2ab, tests: bash -c 'test "$(ls backend/seed/placeholder_photos | wc -l)" -eq 14 && test -f docs/brand/ad-smart-school-logo.png && echo "14 photos + logo present"' → 14 photos + logo present)
Task 1: Ruling: settings use Django 6.1 MAILERS (DJANGO_EMAIL_BACKEND env still chooses the backend) instead of deprecated EMAIL_BACKEND; settings_test drops the locmem line because the test runner swaps every mailer to locmem — avoids a RemovedInDjango2028Warning — cost if wrong: one settings edit
Task 1: complete (commits 8b7b2ab..d51216e, tests: bash -c 'cd backend && .venv/Scripts/python -m pytest' → 1 passed in 0.23s)
Task 2: Ruling: api_exception_handler converts Django Http404/PermissionDenied to DRF exceptions before reading the code — plan code read the original Http404 (no code) so 404s came back as code 'error'; test_not_found_uses_the_same_shape caught it — cost if wrong: none
Task 2: complete (commits d51216e..db8f025, tests: bash -c 'cd backend && .venv/Scripts/python -m pytest' → 7 passed in 0.26s)
Task 3: complete (commits db8f025..9d05364, tests: bash -c 'cd backend && .venv/Scripts/python -m pytest' → 13 passed in 1.11s)
Task 4: complete (commits 9d05364..86262bf, tests: bash -c 'cd backend && .venv/Scripts/python -m pytest' → 29 passed in 1.23s)
Task 5: Ruling: unquoted self-referencing return annotations (Python 3.14 lazy annotations, ruff UP037); same applies to later models — cost if wrong: none
Task 5: complete (commits 86262bf..dd034df, tests: bash -c 'cd backend && .venv/Scripts/python -m pytest' → 37 passed in 1.50s)
Task 6: complete (commits dd034df..d6ba37d, tests: bash -c 'cd backend && .venv/Scripts/python -m pytest' → 48 passed in 2.24s)
Task 6: Ruling: ImageRenditionsMixin.__init__ placed before save() — ruff DJ012 requires magic methods first (plan had the opposite order) — cost if wrong: none
Task 7: Ruling: test_privacy_notice_404_when_none_is_in_effect also asserts the JSON code — as planned it passed before the view existed (unknown URLs 404 too) — cost if wrong: none
Task 7: complete (commits d6ba37d..38848fd, tests: bash -c 'cd backend && .venv/Scripts/python -m pytest' → 58 passed in 2.90s)
Task 8: complete (commits 38848fd..324ab59, tests: bash -c 'cd backend && .venv/Scripts/python -m pytest' → 78 passed in 2.83s)
Task 9: Ruling: run manage.py migrate before seeding the dev database — Tasks 5/6/8 only created migrations, so the dev DB lacked the new tables — cost if wrong: none
Task 9: complete (commits 324ab59..c5e5678, tests: bash -c 'cd backend && .venv/Scripts/python -m pytest' → 81 passed in 13.70s)
Task 10: Ruling: next.config keeps the scaffold's Tailwind turbopack loader but drops `cacheComponents`/`partialPrefetching` (create-next-app 16.4 enables them) — with them on, route `revalidate` is removed and `new Date()` during prerender is an error, breaking the plan's ISR model (spec §2.2); 16.4 docs fully support the non-Cache-Components model — cost if wrong: a migration when the next major makes Cache Components mandatory.
Task 10: Ruling: @types/node bumped ^20 → ^24 — vitest 5 requires >=22 and the machine runs Node 24 — cost if wrong: none.
Task 10: Ruling: frontend/.gitignore un-ignores .env.local.example (scaffold ignored all .env*); boilerplate frontend/README.md removed (root README comes in Task 18); scaffold AGENTS.md kept (Next regenerates it) — cost if wrong: none.
Task 10: Note: npm 12 blocked unrs-resolver's postinstall (eslint import resolver); lint works without it.
Task 10: complete (commits c5e5678..52018c9, tests: bash -c 'cd frontend && npm test 2>&1 | tail -4 && npm run lint && npm run typecheck >/dev/null && echo lint+types ok' → lint+types ok)
Task 11: Ruling: Lite-mode boot-script test stubs CSS.supports to false (jsdom 30 implements CSS.supports and reports blur as supported) and a new test checks full mode on a capable browser — cost if wrong: none
Process note: very long shell commands get truncated by the tool ("unexpected EOF"); large files are written with the Write tool or in smaller commands.
Task 11: complete (commits 52018c9..f58477e, tests: bash -c 'cd frontend && npm test 2>&1 | grep -E "Tests " && npm run lint && npm run typecheck >/dev/null && echo lint+types ok' → lint+types ok)
Task 12: Ruling: SwingIn uses its own useRef for the element (useAnimate only supplies animate) — react-hooks/immutability rejects mutating styles on the useAnimate scope — cost if wrong: none
Task 12: complete (commits f58477e..e0b1a72, tests: bash -c 'cd frontend && npm test 2>&1 | grep -E "Tests " && npm run lint && npm run typecheck >/dev/null && echo lint+types ok' → lint+types ok)
Task 13: complete (commits e0b1a72..0d68f29, tests: bash -c 'cd frontend && npm test 2>&1 | grep -E "Tests " && npm run lint && npm run typecheck >/dev/null && echo lint+types ok' → lint+types ok)
Task 14: complete (commits 0d68f29..f4806ae, tests: bash -c 'cd frontend && npm test 2>&1 | grep -E "Tests " && npm run lint && npm run typecheck >/dev/null && echo lint+types ok' → lint+types ok)
Task 15: Note: visual check done at desktop (logo matches PNG, hero/glass/ribbon OK); phone + dark check not finished before usage limit. .claude/launch.json kept but the preview tool reads the original session folder, so servers were started via shell.
Task 15: complete (commits f4806ae..b16a5d2, tests: bash -c 'cd frontend && npm test 2>&1 | grep -E "Tests "' →       Tests  55 passed (55))
Task 16: Ruling: EnquiryForm fetches its token in an effect that only sets state in promise callbacks, and reads the honeypot from the submitted form element (name="website") instead of a ref — React Compiler rules react-hooks/set-state-in-effect and react-hooks/refs rejected the plan's version — cost if wrong: none.
Task 16: Ruling: header theme toggle wrapped in a `hidden lg:block` div — the toggle's own inline-flex class overrode `hidden`, so it showed on phones and squeezed the school name (seen in the browser at 375px) — cost if wrong: none.
Task 16: complete (commits b16a5d2..a0317cf, tests: bash -c 'cd frontend && npm test 2>&1 | grep -E "Tests " && npm run lint && npm run typecheck >/dev/null && echo lint+types ok' → lint+types ok)
Task 17: complete (commits a0317cf..193e697, tests: bash -c 'cd frontend && npm test 2>&1 | grep -E "Tests " && npm run lint && npm run typecheck >/dev/null && echo lint+types ok' → lint+types ok)
Task 18: Ruling: e2e/Lighthouse servers use ports 8100 (Django) and 3100 (Next) — the plan's 8000 collides with the running dev server — cost if wrong: none.
Task 18: Ruling: Lighthouse runs through a Playwright-launched Chromium over the debugging port (e2e/lighthouse.mjs, lighthouse as a devDependency); @lhci/cli and lighthouserc.json removed — Lighthouse's own launcher fails on this Windows setup with "spawn UNKNOWN" for every browser — cost if wrong: none; thresholds unchanged (perf/a11y/best-practices >= 0.9, weight <= 500 KB, SEO advisory).
Task 18: Ruling: browser tests found two real bugs the unit tests missed — error summary lost focus to React Hook Form's own focusing (now shouldFocusError:false + summary focused on the first commit it exists), and closing the photo viewer did not return focus (Embla swallows focus; the gallery now restores it explicitly) — both covered by tests — cost if wrong: none.
Task 18: Ruling: to meet the performance budget (home was 86, 727 KB): gallery photos render only near the screen (300px margin), Poppins preloads only the latin subset (latin-ext still loads on demand via unicode-range), and the hero takes the 480w rendition on phones (it sits under a scrim and glass) — now 90-93, ~330 KB — cost if wrong: the hero is slightly softer on high-DPR phones; performance margin is thin (90 on home), so Lighthouse may occasionally dip below 90 run to run.
Task 18: complete (commits 193e697..695e7d6, tests: bash -c 'scripts/check.sh 2>&1 | tail -1' → All checks passed.)
Final review: self-review (no subagent tool used: the harness forbids spawning agents unless the user asks).
Final: fixed misleading NUM_PROXIES guidance (said raise to 2 behind Caddy; Next.js does not append X-Forwarded-For, so 2 would let visitors forge their IP and dodge enquiry limits) — test_ip_throttle_uses_the_address_added_by_the_reverse_proxy RED with NUM_PROXIES=2 → GREEN at 1, suite 82/82.
Final: Ruling: in development (no Caddy) every visitor reaches Django from Next.js's own address, so the 30/hour enquiry limit is shared by everyone — production behind Caddy is per-visitor — cost if wrong: only matters if production is deployed without Caddy (Plan 5 must keep Caddy in front).
Final: minor (deferred): enquiry email is sent inside the request; set an SMTP timeout in Plan 5's production mail settings so a slow mail server cannot hang submissions.
Final: minor (deferred): the enquiry form's date limits (min/max) are baked into the pre-built page and can be a day stale for up to 5 minutes after midnight; the server still rejects past dates.
Final: minor (deferred): home-page Lighthouse performance sits at 90-93, so run-to-run variance can dip it below 90.
