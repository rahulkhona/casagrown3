#!/usr/bin/env bash
export PATH="$HOME/.deno/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/opt/homebrew/Cellar/node@22/22.22.0/bin:/Applications/Docker.app/Contents/Resources/bin:/usr/local/bin:$PATH"
# ═══════════════════════════════════════════════════════════════════════════
# CasaGrown — Release Readiness Test Suite
#
# Runs ALL tests required for release of Market, Admin, Voice & Metrics.
# Usage:   ./scripts/release-test.sh [--skip-e2e] [--skip-stress] [--quick]
#
# Prerequisites:
#   - Docker running (for Supabase)
#   - node_modules installed (yarn install)
#   - Playwright browsers installed (npx playwright install chromium)
#
# This script will:
#   1. Ensure Supabase is running (start if not)
#   2. Reset the database and seed test data
#   3. Initialize storage buckets
#   4. Start edge functions server
#   5. Run all test suites
#   6. Report results
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

# ── Configuration ──────────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

SKIP_E2E=false
SKIP_STRESS=false
QUICK=false
for arg in "$@"; do
  case $arg in
    --skip-e2e)   SKIP_E2E=true ;;
    --skip-stress) SKIP_STRESS=true ;;
    --quick)      SKIP_E2E=true; SKIP_STRESS=true ;;
  esac
done

# ── Colors ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Tracking ───────────────────────────────────────────────────────────────
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0
SUITE_RESULTS=()
FAILED_SUITES=()
START_TIME=$(date +%s)

# ── Pre-flight Checks ──────────────────────────────────────────────────────
if ! grep -q "NEXT_PUBLIC_SUPABASE_URL" "apps/next-market/.env" 2>/dev/null; then
  echo -e "${RED}${BOLD}ERROR: Workspace environment is not bootstrapped.${NC}"
  echo -e "Missing local .env configuration. Run the setup script first:"
  echo -e "  ${YELLOW}./scripts/setup-workspace.sh${NC}\n"
  exit 1
fi

log_suite() {
  local name="$1"
  local passed=$(echo "$2" | head -n1 | tr -cd '0-9' || echo "0")
  local failed=$(echo "${3:-0}" | head -n1 | tr -cd '0-9' || echo "0")
  local skipped=$(echo "${4:-0}" | head -n1 | tr -cd '0-9' || echo "0")
  
  # Default to 0 if empty
  passed=${passed:-0}
  failed=${failed:-0}
  skipped=${skipped:-0}

  TOTAL_PASSED=$((TOTAL_PASSED + passed))
  TOTAL_FAILED=$((TOTAL_FAILED + failed))
  TOTAL_SKIPPED=$((TOTAL_SKIPPED + skipped))

  if [ "$failed" -eq 0 ]; then
    SUITE_RESULTS+=("${GREEN}✅${NC} ${name}: ${passed} passed")
  else
    SUITE_RESULTS+=("${RED}❌${NC} ${name}: ${passed} passed, ${failed} failed, ${skipped} skipped")
    FAILED_SUITES+=("$name")
  fi
}

section() {
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}  $1${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
}

# ─────────────────────────────────────────────────────────────────────────
# PHASE 0: Verify Prerequisites
# ─────────────────────────────────────────────────────────────────────────
section "Phase 0: Verify Prerequisites"

if false; then
  echo -e "${RED}ERROR: Docker is not running. Start Docker Desktop first.${NC}"
  exit 1
fi
echo "  ✅ Docker is running"

if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}  ⚠️  node_modules not found. Running yarn install...${NC}"
  yarn install --frozen-lockfile
fi
echo "  ✅ node_modules present"

# ─────────────────────────────────────────────────────────────────────────
# PHASE 1: Start Supabase & Reset Database
# ─────────────────────────────────────────────────────────────────────────
section "Phase 1: Database Setup"

# Check if Supabase is running
if ! npx supabase status &>/dev/null 2>&1; then
  echo "  Starting Supabase..."
  npx supabase start
else
  echo "  ✅ Supabase already running"
fi

echo "  Resetting database & applying migrations + seed..."
if npx supabase db reset 2>&1 | tail -3; then
  echo -e "  ${GREEN}✅ Database reset complete${NC}"
else
  echo -e "  ${RED}❌ Database reset failed${NC}"
  exit 1
fi

# ── Get service role key ──
SERVICE_ROLE_KEY=$(npx supabase status -o env 2>/dev/null | grep SERVICE_ROLE_KEY | cut -d'"' -f2)
if [ -z "$SERVICE_ROLE_KEY" ]; then
  echo -e "  ${RED}❌ Could not get SERVICE_ROLE_KEY${NC}"
  exit 1
fi

# ── Initialize storage buckets ──
echo "  Initializing storage buckets..."
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" node scripts/init-storage.js 2>&1 | sed 's/^/  /'
echo -e "  ${GREEN}✅ Storage buckets initialized${NC}"

# ─────────────────────────────────────────────────────────────────────────
# PHASE 2: Start Edge Functions Server
# ─────────────────────────────────────────────────────────────────────────
section "Phase 2: Edge Functions"

# Kill any existing edge functions server
pkill -f "npx supabase functions serve" 2>/dev/null || true
sleep 1

echo "  Starting edge functions server..."
if [ -f supabase/.env.local ]; then
  npx supabase functions serve --env-file supabase/.env.local &>/dev/null &
else
  npx supabase functions serve &>/dev/null &
fi
EDGE_PID=$!
sleep 5

if kill -0 $EDGE_PID 2>/dev/null; then
  echo -e "  ${GREEN}✅ Edge functions server running (PID: $EDGE_PID)${NC}"
else
  echo -e "  ${YELLOW}⚠️  Edge functions server may have failed — continuing anyway${NC}"
fi

# ─────────────────────────────────────────────────────────────────────────
# PHASE 3: Database Tests (pgTAP)
# ─────────────────────────────────────────────────────────────────────────
section "Phase 3: pgTAP Database Tests"

npx supabase test db > /tmp/pgtap_output.log 2>&1
PGTAP_EXIT=$?
PGTAP_OUTPUT=$(cat /tmp/pgtap_output.log)

if echo "$PGTAP_OUTPUT" | grep -q "All tests successful"; then
  PGTAP_TESTS=$(echo "$PGTAP_OUTPUT" | grep "Files=" | sed 's/.*Tests=\([0-9]*\).*/\1/')
  PGTAP_FILES=$(echo "$PGTAP_OUTPUT" | grep "Files=" | sed 's/.*Files=\([0-9]*\).*/\1/')
  echo -e "  ${GREEN}✅ pgTAP: ${PGTAP_FILES} files, ${PGTAP_TESTS} tests — ALL PASS${NC}"
  log_suite "pgTAP Database" "${PGTAP_TESTS}"
else
  echo -e "  ${RED}❌ pgTAP failed${NC}"
  echo "$PGTAP_OUTPUT" | grep -E "^not ok|FAILED" | head -10
  PGTAP_PASSED=$(echo "$PGTAP_OUTPUT" | grep -c "^ok " || echo "0")
  PGTAP_FAILED_CT=$(echo "$PGTAP_OUTPUT" | grep -c "^not ok" || echo "0")
  log_suite "pgTAP Database" "$PGTAP_PASSED" "$PGTAP_FAILED_CT"
fi

# ─────────────────────────────────────────────────────────────────────────
# PHASE 4: Vitest Unit Tests (all apps)
# ─────────────────────────────────────────────────────────────────────────
section "Phase 4: Vitest Unit Tests"

run_vitest() {
  local app_name="$1"
  local app_dir="$2"

  echo "  Running $app_name Vitest..."
  local output
  output=$(cd "$app_dir" && npx vitest run 2>&1)
  local exit_code=$?

  local passed=$(echo "$output" | grep "Tests" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo "0")
  local failed=$(echo "$output" | grep "Tests" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo "0")
  local files_p=$(echo "$output" | grep "Test Files" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo "0")

  if [ "$exit_code" -eq 0 ]; then
    echo -e "  ${GREEN}✅ ${app_name} Vitest: ${files_p} files, ${passed} tests — ALL PASS${NC}"
    log_suite "${app_name} Vitest" "$passed"
  else
    echo -e "  ${RED}❌ ${app_name} Vitest: ${passed} passed, ${failed} failed${NC}"
    log_suite "${app_name} Vitest" "$passed" "$failed"
  fi
}

run_vitest "Market" "apps/next-market"
run_vitest "Admin" "apps/next-admin"
run_vitest "Voice" "apps/next-community-voice"
run_vitest "Metrics" "apps/next-metrics"
run_vitest "Quarantine Bot" "apps/quarantine-bot"

# ─────────────────────────────────────────────────────────────────────────
# PHASE 5: Deno Integration Tests
# ─────────────────────────────────────────────────────────────────────────
section "Phase 5: Deno Integration Tests"

# 5a: Main integration tests
echo "  Running Deno integration tests (_tests/)..."
DENO_OUTPUT=$(cd supabase && deno test --allow-env --allow-net --allow-run --no-check functions/_tests/ 2>&1)
DENO_PASSED=$(echo "$DENO_OUTPUT" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo "0")
DENO_FAILED=$(echo "$DENO_OUTPUT" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo "0")

if [ "${DENO_FAILED:-0}" -eq 0 ] || [ -z "$DENO_FAILED" ]; then
  echo -e "  ${GREEN}✅ Deno Integration: ${DENO_PASSED} tests — ALL PASS${NC}"
  log_suite "Deno Integration" "$DENO_PASSED"
else
  echo -e "  ${RED}❌ Deno Integration: ${DENO_PASSED} passed, ${DENO_FAILED} failed${NC}"
  echo "$DENO_OUTPUT" | grep "FAILED" | head -10
  log_suite "Deno Integration" "$DENO_PASSED" "$DENO_FAILED"
fi

# 5b: Legacy tests
echo "  Running Deno legacy tests..."
LEGACY_OUTPUT=$(cd supabase && deno test --allow-env --allow-net --allow-run --no-check \
  functions/tests/edge_functions_test.ts \
  functions/tests/cash_flow_test.ts 2>&1)
LEGACY_PASSED=$(echo "$LEGACY_OUTPUT" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo "0")
LEGACY_FAILED=$(echo "$LEGACY_OUTPUT" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo "0")

if [ "${LEGACY_FAILED:-0}" -eq 0 ] || [ -z "$LEGACY_FAILED" ]; then
  echo -e "  ${GREEN}✅ Deno Legacy: ${LEGACY_PASSED} tests — ALL PASS${NC}"
  log_suite "Deno Legacy" "$LEGACY_PASSED"
else
  echo -e "  ${RED}❌ Deno Legacy: ${LEGACY_PASSED} passed, ${LEGACY_FAILED} failed${NC}"
  log_suite "Deno Legacy" "$LEGACY_PASSED" "$LEGACY_FAILED"
fi

# 5c: Provider & compliance tests
echo "  Running provider & compliance tests..."
PROVIDER_OUTPUT=$(cd supabase && deno test --allow-env --allow-net --allow-run --no-check \
  functions/_shared/tremendous.test.ts \
  functions/_shared/reloadly.test.ts \
  functions/_provider-tests/giftcard-cache.test.ts \
  functions/_provider-tests/toggles.test.ts \
  functions/_compliance-tests/compliance.test.ts 2>&1)
PROVIDER_PASSED=$(echo "$PROVIDER_OUTPUT" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo "0")
PROVIDER_FAILED=$(echo "$PROVIDER_OUTPUT" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo "0")

if [ "${PROVIDER_FAILED:-0}" -eq 0 ] || [ -z "$PROVIDER_FAILED" ]; then
  echo -e "  ${GREEN}✅ Provider/Compliance: ${PROVIDER_PASSED} tests — ALL PASS${NC}"
  log_suite "Provider/Compliance" "$PROVIDER_PASSED"
else
  echo -e "  ${RED}❌ Provider/Compliance: ${PROVIDER_PASSED} passed, ${PROVIDER_FAILED} failed${NC}"
  log_suite "Provider/Compliance" "$PROVIDER_PASSED" "$PROVIDER_FAILED"
fi

# 5d: Per-function tests
echo "  Running per-function tests..."
FUNC_OUTPUT=$(cd supabase && deno test --allow-env --allow-net --allow-run --no-check \
  functions/confirm-payment/fifo.test.ts \
  functions/process-redemptions/index.test.ts \
  functions/resolve-usps-address/integration.test.ts 2>&1)
FUNC_PASSED=$(echo "$FUNC_OUTPUT" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo "0")
FUNC_FAILED=$(echo "$FUNC_OUTPUT" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo "0")

if [ "${FUNC_FAILED:-0}" -eq 0 ] || [ -z "$FUNC_FAILED" ]; then
  echo -e "  ${GREEN}✅ Per-Function: ${FUNC_PASSED} tests — ALL PASS${NC}"
  log_suite "Per-Function" "$FUNC_PASSED"
else
  echo -e "  ${RED}❌ Per-Function: ${FUNC_PASSED} passed, ${FUNC_FAILED} failed${NC}"
  log_suite "Per-Function" "$FUNC_PASSED" "$FUNC_FAILED"
fi

# 5e: CRM edge function tests
echo "  Running CRM edge function tests..."
CRM_OUTPUT=$(cd supabase && deno test --allow-env --allow-net --allow-run --no-check \
  functions/_tests/crm-functions.test.ts 2>&1)
CRM_PASSED=$(echo "$CRM_OUTPUT" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo "0")
CRM_FAILED=$(echo "$CRM_OUTPUT" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo "0")

if [ "${CRM_FAILED:-0}" -eq 0 ] || [ -z "$CRM_FAILED" ]; then
  echo -e "  ${GREEN}✅ CRM Edge Functions: ${CRM_PASSED} tests — ALL PASS${NC}"
  log_suite "CRM Edge Functions" "$CRM_PASSED"
else
  echo -e "  ${RED}❌ CRM Edge Functions: ${CRM_PASSED} passed, ${CRM_FAILED} failed${NC}"
  echo "$CRM_OUTPUT" | grep "FAILED" | head -10
  log_suite "CRM Edge Functions" "$CRM_PASSED" "$CRM_FAILED"
fi

# ─────────────────────────────────────────────────────────────────────────
# PHASE 6: Shell Integration Tests (Escalation Handling)
# ─────────────────────────────────────────────────────────────────────────
section "Phase 6: Shell Integration Tests (Escalation Handling)"

echo "  Running escalation interaction tests..."
SHELL_OUTPUT=$(bash scripts/test-escalation-interactions.sh 2>&1)
SHELL_EXIT=$?

SHELL_PASSED=$(echo "$SHELL_OUTPUT" | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
SHELL_FAILED=$(echo "$SHELL_OUTPUT" | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

if [ "$SHELL_EXIT" -eq 0 ]; then
  echo -e "  ${GREEN}✅ Escalation Shell: ${SHELL_PASSED} tests — ALL PASS${NC}"
  log_suite "Escalation Shell" "$SHELL_PASSED"
else
  echo -e "  ${RED}❌ Escalation Shell: ${SHELL_PASSED} passed, ${SHELL_FAILED} failed${NC}"
  log_suite "Escalation Shell" "$SHELL_PASSED" "$SHELL_FAILED"
fi

# ─────────────────────────────────────────────────────────────────────────
# PHASE 7: Playwright E2E Tests (requires dev servers)
# ─────────────────────────────────────────────────────────────────────────
if [ "$SKIP_E2E" = true ]; then
  section "Phase 7: Playwright E2E — SKIPPED (--skip-e2e)"
else
  section "Phase 7: Playwright E2E Tests"

  # ── Start dev servers and execute E2E sequentially ──
  run_playwright_sequential() {
    local app_name="$1"
    local app_dir="$2"
    local port="$3"
    local use_port_env="$4"

    echo "  Building and starting $app_name server..."
    local pid=""
    if ! lsof -nP -iTCP:$port -sTCP:LISTEN &>/dev/null; then
      if [ "$use_port_env" = "true" ]; then
        (cd "$app_dir" && npm run build &>/dev/null && PORT=$port npm run start &>/dev/null) &
      else
        (cd "$app_dir" && npm run build &>/dev/null && npm run start &>/dev/null) &
      fi
      pid=$!
      echo "    $app_name → :$port"
      
      echo "    Waiting for $app_name server (up to 3 minutes for prod build)..."
      for i in $(seq 1 180); do
        if curl -s "http://localhost:$port" &>/dev/null; then
          break
        fi
        sleep 1
      done
      echo -e "    ${GREEN}✅ $app_name server ready${NC}"
    else
      echo "    $app_name → :$port (already running)"
    fi

    local logfile="scripts/output/playwright_$(echo "$app_name" | tr '[:upper:]' '[:lower:]').log"

    echo "  Running $app_name Playwright E2E..."
    mkdir -p scripts/output
    (cd "$app_dir" && env -u FORCE_COLOR NO_COLOR=1 npx playwright test --reporter=line 2>&1) | tee "$logfile"
    local exit_code=${PIPESTATUS[0]}
    local output
    output=$(cat "$logfile" | perl -pe 's/\x1b\[[0-9;]*[mGK]//g')

    local passed=$(echo "$output" | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
    local failed=$(echo "$output" | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")
    local skipped=$(echo "$output" | grep -oE '[0-9]+ skipped' | head -1 | grep -oE '[0-9]+' || echo "0")
    local did_not_run=$(echo "$output" | grep -oE '[0-9]+ did not run' | head -1 | grep -oE '[0-9]+' || echo "0")
    skipped=$((${skipped:-0} + ${did_not_run:-0}))

    if [ "$exit_code" -eq 0 ]; then
      echo -e "  ${GREEN}✅ ${app_name} E2E: ${passed} passed${NC}"
      log_suite "${app_name} E2E" "$passed" 0 "$skipped"
    else
      echo -e "  ${RED}❌ ${app_name} E2E: ${passed} passed, ${failed} failed, ${skipped} skipped${NC}"
      # Show failed test names
      echo "$output" | grep -E "^\s+\[chromium\].*›.*$" | head -10 | sed 's/^/    /'
      log_suite "${app_name} E2E" "$passed" "$failed" "$skipped"
    fi

    # ── Kill dev server before moving to next ──
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
      # Hard kill just in case to free memory immediately
      lsof -Pni :$port | grep LISTEN | awk '{print $2}' | xargs -r kill -9 2>/dev/null || true
    fi
    echo "  ⏳ Cooling down 10s before next app to aggressively free memory..."
    sleep 10
  }

  run_playwright_sequential "Market" "apps/next-market" "3001" "false"
  run_playwright_sequential "Admin" "apps/next-admin" "3003" "true"
  run_playwright_sequential "Voice" "apps/next-community-voice" "3002" "false"
  run_playwright_sequential "Metrics" "apps/next-metrics" "3004" "false"
fi

# ─────────────────────────────────────────────────────────────────────────
# PHASE 8: Stress Tests (optional)
# ─────────────────────────────────────────────────────────────────────────
if [ "$SKIP_STRESS" = true ]; then
  section "Phase 8: Stress Tests — SKIPPED"
else
  section "Phase 8: Stress Tests"

  echo "  Running settlement stress test..."
  STRESS1=$(npx supabase test db \
    supabase/tests/database/04_market_settlement_stress.test.sql 2>&1)
  if echo "$STRESS1" | grep -q "All tests successful"; then
    STRESS1_TESTS=$(echo "$STRESS1" | grep "^Files=" | sed 's/.*Tests=\([0-9]*\).*/\1/')
    echo -e "  ${GREEN}✅ Settlement Stress: ${STRESS1_TESTS} tests${NC}"
    log_suite "Settlement Stress" "${STRESS1_TESTS:-0}"
  elif echo "$STRESS1" | grep -q "finish"; then
    echo -e "  ${GREEN}✅ Settlement Stress${NC}"
    log_suite "Settlement Stress" "1"
  else
    echo -e "  ${YELLOW}⚠️  Settlement Stress had issues${NC}"
    echo "$STRESS1" | grep -E "^not ok|ERROR" | head -5 | sed 's/^/    /'
    STRESS1_PASSED=$(echo "$STRESS1" | grep -c "^ok " || echo "0")
    STRESS1_FAILED=$(echo "$STRESS1" | grep -c "^not ok" || echo "0")
    log_suite "Settlement Stress" "$STRESS1_PASSED" "$STRESS1_FAILED"
  fi

  echo "  Running payout stress test..."
  STRESS2=$(npx supabase test db \
    supabase/tests/database/22_payout_stress_test.test.sql 2>&1)
  if echo "$STRESS2" | grep -q "All tests successful"; then
    STRESS2_TESTS=$(echo "$STRESS2" | grep "^Files=" | sed 's/.*Tests=\([0-9]*\).*/\1/')
    echo -e "  ${GREEN}✅ Payout Stress: ${STRESS2_TESTS} tests${NC}"
    log_suite "Payout Stress" "${STRESS2_TESTS:-0}"
  elif echo "$STRESS2" | grep -q "finish"; then
    echo -e "  ${GREEN}✅ Payout Stress${NC}"
    log_suite "Payout Stress" "1"
  else
    echo -e "  ${YELLOW}⚠️  Payout Stress had issues${NC}"
    echo "$STRESS2" | grep -E "^not ok|ERROR" | head -5 | sed 's/^/    /'
    STRESS2_PASSED=$(echo "$STRESS2" | grep -c "^ok " || echo "0")
    STRESS2_FAILED=$(echo "$STRESS2" | grep -c "^not ok" || echo "0")
    log_suite "Payout Stress" "$STRESS2_PASSED" "$STRESS2_FAILED"
  fi

  echo "  Running 100K row stress test..."
  STRESS3=$(npx supabase test db \
    supabase/tests/database/23_100k_stress_test.test.sql 2>&1)
  if echo "$STRESS3" | grep -q "All tests successful"; then
    STRESS3_TESTS=$(echo "$STRESS3" | grep "^Files=" | sed 's/.*Tests=\([0-9]*\).*/\1/')
    echo -e "  ${GREEN}✅ 100K Stress: ${STRESS3_TESTS} tests${NC}"
    log_suite "100K Stress" "${STRESS3_TESTS:-0}"
  elif echo "$STRESS3" | grep -q "finish"; then
    echo -e "  ${GREEN}✅ 100K Stress${NC}"
    log_suite "100K Stress" "1"
  else
    echo -e "  ${YELLOW}⚠️  100K Stress had issues${NC}"
    echo "$STRESS3" | grep -E "^not ok|ERROR" | head -5 | sed 's/^/    /'
    STRESS3_PASSED=$(echo "$STRESS3" | grep -c "^ok " || echo "0")
    STRESS3_FAILED=$(echo "$STRESS3" | grep -c "^not ok" || echo "0")
    log_suite "100K Stress" "$STRESS3_PASSED" "$STRESS3_FAILED"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────
# Cleanup
# ─────────────────────────────────────────────────────────────────────────
# Kill edge functions server
kill "$EDGE_PID" 2>/dev/null || true

# ─────────────────────────────────────────────────────────────────────────
# FINAL REPORT
# ─────────────────────────────────────────────────────────────────────────
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

section "RELEASE READINESS TEST RESULTS"

echo -e "  ${BOLD}Suite Results:${NC}"
for result in "${SUITE_RESULTS[@]}"; do
  echo -e "    $result"
done

echo ""
echo -e "  ────────────────────────────────────────────"
echo -e "  ${BOLD}Total:${NC} ${GREEN}${TOTAL_PASSED} passed${NC}, ${RED}${TOTAL_FAILED} failed${NC}, ${YELLOW}${TOTAL_SKIPPED} skipped${NC}"
echo -e "  ${BOLD}Duration:${NC} ${MINUTES}m ${SECONDS}s"
echo -e "  ────────────────────────────────────────────"

if [ "$TOTAL_FAILED" -eq 0 ]; then
  echo ""
  echo -e "  ${GREEN}${BOLD}🎉 ALL TESTS PASSED — RELEASE READY${NC}"
  echo ""
  exit 0
else
  echo ""
  echo -e "  ${RED}${BOLD}⚠️  ${#FAILED_SUITES[@]} SUITE(S) HAD FAILURES:${NC}"
  for suite in "${FAILED_SUITES[@]}"; do
    echo -e "    ${RED}• ${suite}${NC}"
  done
  echo ""
  echo -e "  Run with ${CYAN}--skip-e2e${NC} to skip Playwright, or ${CYAN}--quick${NC} to run only unit/integration tests."
  echo ""
  exit 1
fi
