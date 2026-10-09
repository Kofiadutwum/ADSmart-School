#!/usr/bin/env bash
# Every check in one command: lint, types, tests and dependency audits.
# WITH_E2E=1 scripts/check.sh also runs the browser tests and Lighthouse.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="$ROOT/backend/.venv/Scripts/python"
[ -x "$PY" ] || PY="$ROOT/backend/.venv/bin/python"

echo "== Backend: lint"
(cd "$ROOT/backend" && "$PY" -m ruff check . && "$PY" -m ruff format --check .)
echo "== Backend: tests"
(cd "$ROOT/backend" && "$PY" -m pytest)
echo "== Backend: dependency audit"
(cd "$ROOT/backend" && "$PY" -m pip_audit -r requirements.txt)
echo "== Frontend: lint, types, tests"
(cd "$ROOT/frontend" && npm run lint && npm run typecheck && npm test)
echo "== Frontend: dependency audit"
(cd "$ROOT/frontend" && npm audit --omit=dev --audit-level=high)
if [ "${WITH_E2E:-0}" = "1" ]; then
  echo "== Browser tests"
  (cd "$ROOT/frontend" && npm run e2e)
  echo "== Lighthouse"
  (cd "$ROOT/frontend" && npm run lighthouse)
fi
echo "All checks passed."
