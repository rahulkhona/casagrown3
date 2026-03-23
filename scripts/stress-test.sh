#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# stress-test.sh — Heavy load & comprehensive testing (~15+ min)
# Runs: All pre-push suites + parallel workers + benchmarks
# Usage: ./scripts/stress-test.sh
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
echo "  🔥 STRESS TEST: COMPREHENSIVE SUITE"
echo "═══════════════════════════════════════════"

# ── Phase 1: Unit & Function Tests ──
echo ""
echo "── Phase 1: Unit & Function Tests ──"

run_suite "Vitest (all unit tests)" \
  "(cd apps/next-market && npx vitest run 2>&1 | tail -5)"

run_suite "Deno (all edge function tests)" \
  "(cd supabase/functions && deno test _tests/ tests/ --allow-all --no-check 2>&1 | tail -5)"

# ── Phase 2: Database Tests + Benchmarks ──
echo ""
echo "── Phase 2: Database Tests + Benchmarks ──"

run_suite "pgTAP (all database tests)" \
  "(npx supabase test db 2>&1 | tail -10)"

# ── Phase 3: E2E with Parallel Workers ──
echo ""
echo "── Phase 3: E2E with Parallel Workers (stress) ──"

run_suite "Playwright Market — parallel (3 workers)" \
  "(cd apps/next-market && npx playwright test e2e/scenarios/ --workers=3 --reporter=line 2>&1 | tail -15)"

run_suite "Playwright Admin — all tests" \
  "(cd apps/next-admin && npx playwright test e2e/ --reporter=line 2>&1 | tail -10)"

# ── Phase 4: Repeat E2E (catch flaky tests) ──
echo ""
echo "── Phase 4: Flaky Detection (repeat e2e) ──"

run_suite "Playwright Market — 2nd run (flaky detection)" \
  "(cd apps/next-market && npx playwright test e2e/scenarios/ --reporter=line 2>&1 | tail -10)"

# ── Summary ──
echo ""
echo "═══════════════════════════════════════════"
echo "  STRESS TEST RESULTS: $PASSED passed, $FAILED failed"
echo "═══════════════════════════════════════════"
for r in "${RESULTS[@]}"; do echo "$r"; done
echo ""

if [ "$FAILED" -gt 0 ]; then
  echo "⚠️  STRESS TEST: $FAILED suite(s) had failures"
  echo "    Review output above for details."
  exit 1
fi
echo "✅ STRESS TEST: ALL SUITES PASSED"
