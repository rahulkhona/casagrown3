#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# pre-push.sh — Full regression before pushing (~5 min)
# Runs: Vitest + Deno + pgTAP + Playwright (market + admin)
# Usage: ./scripts/pre-push.sh
# Prerequisites: Supabase running locally, market on :3001, admin on :3005
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASSED=0
FAILED=0
RESULTS=()

run_suite() {
  local name="$1"
  local cmd="$2"
  echo ""
  echo "▶ $name..."
  if eval "$cmd"; then
    PASSED=$((PASSED + 1))
    RESULTS+=("  ✅ $name")
  else
    FAILED=$((FAILED + 1))
    RESULTS+=("  ❌ $name")
  fi
}

echo "═══════════════════════════════════════════"
echo "  🚀 PRE-PUSH: FULL REGRESSION"
echo "═══════════════════════════════════════════"

# 1. Vitest — Unit tests
run_suite "Vitest (500+ unit tests)" \
  "(cd apps/next-market && npx vitest run 2>&1 | tail -5)"

# 2. Deno — Edge function tests
run_suite "Deno (119+ edge function tests)" \
  "(cd supabase/functions && deno test _tests/ tests/ --allow-all --no-check 2>&1 | tail -5)"

# 3. pgTAP — Database tests
run_suite "pgTAP (333+ database tests)" \
  "(npx supabase test db 2>&1 | tail -5)"

# 4. Playwright — Market E2E
run_suite "Playwright Market (118+ e2e tests)" \
  "(cd apps/next-market && npx playwright test e2e/scenarios/ --reporter=line 2>&1 | tail -10)"

# 5. Playwright — Admin E2E
run_suite "Playwright Admin (6+ e2e tests)" \
  "(cd apps/next-admin && npx playwright test e2e/ --reporter=line 2>&1 | tail -10)"

echo ""
echo "═══════════════════════════════════════════"
echo "  RESULTS: $PASSED passed, $FAILED failed"
echo "═══════════════════════════════════════════"
for r in "${RESULTS[@]}"; do echo "$r"; done
echo ""

if [ "$FAILED" -gt 0 ]; then
  echo "❌ PRE-PUSH: SOME SUITES FAILED"
  exit 1
fi
echo "✅ PRE-PUSH: ALL SUITES PASSED — safe to push"
