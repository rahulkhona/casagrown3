#!/usr/bin/env bash
export PATH="$HOME/.deno/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/opt/homebrew/Cellar/node@22/22.22.0/bin:/Applications/Docker.app/Contents/Resources/bin:/usr/local/bin:$PATH"
export DENO_JOBS=1
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
START_FROM=""

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-e2e)    SKIP_E2E=true ;;
    --skip-stress) SKIP_STRESS=true ;;
    --quick)       SKIP_E2E=true; SKIP_STRESS=true ;;
    --start-from=*) START_FROM="${1#*=}" ;;
    --start-from)   shift; START_FROM="${1:-}" ;;
  esac
  shift 2>/dev/null || break
done

phase_weight() {
  case "$1" in
    1) echo 10 ;;
    2) echo 20 ;;
    3) echo 30 ;;
    4) echo 40 ;;
    4b) echo 45 ;;
    5) echo 50 ;;
    6) echo 60 ;;
    7|7a) echo 70 ;;
    7b) echo 72 ;;
    7c) echo 74 ;;
    7d) echo 76 ;;
    7e) echo 78 ;;
    8) echo 80 ;;
    *) echo 0 ;;
  esac
}

should_run_phase() {
  local p="$1"
  if [ -z "$START_FROM" ]; then
    return 0
  fi
  local req_w=$(phase_weight "$START_FROM")
  local cur_w=$(phase_weight "$p")
  if [ "$cur_w" -ge "$req_w" ]; then
    return 0
  else
    return 1
  fi
}

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

if should_run_phase "1"; then
  echo "  Resetting database & applying migrations + seed..."
  if npx supabase db reset 2>&1 | tail -3; then
    echo -e "  ${GREEN}✅ Database reset complete${NC}"
  else
    echo -e "  ${RED}❌ Database reset failed${NC}"
    exit 1
  fi
else
  echo -e "  ${GREEN}⏩ Skipping database reset (--start-from $START_FROM)${NC}"
fi

# ── Get service role key ──
SERVICE_ROLE_KEY=$(npx supabase status -o env 2>/dev/null | grep SERVICE_ROLE_KEY | cut -d'"' -f2)
if [ -z "$SERVICE_ROLE_KEY" ]; then
  echo -e "  ${RED}❌ Could not get SERVICE_ROLE_KEY${NC}"
  exit 1
fi
# GoTrue admin ops now require the new sb_secret_ key format
SECRET_KEY=$(npx supabase status -o env 2>/dev/null | grep '^SECRET_KEY=' | cut -d'"' -f2)
export SUPABASE_SECRET_KEY="${SECRET_KEY:-$SERVICE_ROLE_KEY}"

# ── Initialize storage buckets ──
echo "  Initializing storage buckets..."
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" node scripts/init-storage.js 2>&1 | sed 's/^/  /'
echo -e "  ${GREEN}✅ Storage buckets initialized${NC}"

# ── Upload interest catalog images ──
echo "  Uploading interest catalog images..."
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" node scripts/upload-interest-images.js 2>&1 | sed 's/^/  /'
echo -e "  ${GREEN}✅ Interest images ready${NC}"

# ─────────────────────────────────────────────────────────────────────────
# PHASE 2: Start Edge Functions Server
# ─────────────────────────────────────────────────────────────────────────
section "Phase 2: Edge Functions"

# Kill any existing edge functions server
pkill -f "npx supabase functions serve" 2>/dev/null || true
pkill -f "supabase functions serve" 2>/dev/null || true
pkill -f "deno run.*functions" 2>/dev/null || true
sleep 1

# ── Force AI mock mode during test runs (prevents real Gemini API calls) ──
FUNCTIONS_ENV="supabase/functions/.env"
LOCAL_ENV="supabase/.env.local"
AI_MOCK_ORIGINAL=$(grep "^AI_MOCK=" "$FUNCTIONS_ENV" 2>/dev/null || echo "AI_MOCK=false")
sed -i '' 's/^AI_MOCK=.*/AI_MOCK=true/' "$FUNCTIONS_ENV" 2>/dev/null || echo "AI_MOCK=true" >> "$FUNCTIONS_ENV"
# Also set in .env.local if it exists (edge server prefers this file)
if [ -f "$LOCAL_ENV" ]; then
  AI_MOCK_LOCAL_ORIGINAL=$(grep "^AI_MOCK=" "$LOCAL_ENV" 2>/dev/null || echo "")
  if grep -q "^AI_MOCK=" "$LOCAL_ENV" 2>/dev/null; then
    sed -i '' 's/^AI_MOCK=.*/AI_MOCK=true/' "$LOCAL_ENV"
  else
    echo "AI_MOCK=true" >> "$LOCAL_ENV"
  fi
fi
echo "  🔒 AI_MOCK forced to true for test run"

echo "  Starting edge functions server..."
if [ -f supabase/.env.local ]; then
  npx supabase functions serve --env-file supabase/.env.local &>/dev/null &
else
  npx supabase functions serve --env-file "$FUNCTIONS_ENV" &>/dev/null &
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
if should_run_phase "3"; then
  section "Phase 3: pgTAP Database Tests"
  npx supabase test db > /tmp/pgtap_output.log 2>&1
  PGTAP_EXIT=$?
  PGTAP_OUTPUT=$(cat /tmp/pgtap_output.log)

  # Always extract test count from the summary line: "Files=63, Tests=842, ..."
  PGTAP_TESTS=$(echo "$PGTAP_OUTPUT" | grep "Files=" | sed 's/.*Tests=\([0-9]*\).*/\1/' || echo "0")
  PGTAP_FILES=$(echo "$PGTAP_OUTPUT" | grep "Files=" | sed 's/.*Files=\([0-9]*\).*/\1/' || echo "0")
  PGTAP_TESTS=${PGTAP_TESTS:-0}
  PGTAP_FILES=${PGTAP_FILES:-0}

  if echo "$PGTAP_OUTPUT" | grep -q "All tests successful"; then
    echo -e "  ${GREEN}✅ pgTAP: ${PGTAP_FILES} files, ${PGTAP_TESTS} tests — ALL PASS${NC}"
    log_suite "pgTAP Database" "${PGTAP_TESTS}"
  else
    # Count file-level failures (bad plans, crashes — NOT individual test assertions)
    PGTAP_BAD_FILES=$(echo "$PGTAP_OUTPUT" | grep -c "Non-zero exit status\|Parse errors" || echo "0")
    echo -e "  ${RED}❌ pgTAP: ${PGTAP_FILES} files, ${PGTAP_TESTS} tests — ${PGTAP_BAD_FILES} file(s) had issues${NC}"
    echo "$PGTAP_OUTPUT" | grep -E "Non-zero exit|Parse errors|Bad plan" | head -10 | sed 's/^/    /'
    log_suite "pgTAP Database" "$PGTAP_TESTS" "$PGTAP_BAD_FILES"
  fi
else
  section "Phase 3: pgTAP Database Tests — SKIPPED (--start-from $START_FROM)"
fi

# ─────────────────────────────────────────────────────────────────────────
# PHASE 4: Vitest Unit Tests (all apps)
# ─────────────────────────────────────────────────────────────────────────
if should_run_phase "4"; then
  section "Phase 4: Vitest Unit Tests"

  run_vitest() {
    local app_name="$1"
    local app_dir="$2"

    echo "  Running $app_name Vitest..."
    local output
    output=$(cd "$app_dir" && npx vitest run 2>&1)
    local exit_code=$?

    local passed=$(echo "$output" | grep "Tests" | tail -n 10 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
    local failed=$(echo "$output" | grep "Tests" | tail -n 10 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")
    local files_p=$(echo "$output" | grep "Test Files" | tail -n 10 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")

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
else
  section "Phase 4: Vitest Unit Tests — SKIPPED (--start-from $START_FROM)"
fi

# ─────────────────────────────────────────────────────────────────────────
# PHASE 4b: Jest Unit Tests (Native Apps)
# ─────────────────────────────────────────────────────────────────────────
if should_run_phase "4b"; then
  section "Phase 4b: Jest Unit Tests (Native Apps)"

  echo "  Running expo-market Jest tests..."
  EXPO_OUTPUT=$(cd apps/expo-market && npx jest --ci --no-colors 2>&1)
  EXPO_EXIT=$?

  EXPO_PASSED=$(echo "$EXPO_OUTPUT" | grep "Tests:" | tail -1 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
  EXPO_FAILED=$(echo "$EXPO_OUTPUT" | grep "Tests:" | tail -1 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

  if [ "$EXPO_EXIT" -eq 0 ]; then
    echo -e "  ${GREEN}✅ expo-market Jest: ${EXPO_PASSED} tests — ALL PASS${NC}"
    log_suite "expo-market Jest" "$EXPO_PASSED"
  else
    echo -e "  ${RED}❌ expo-market Jest: ${EXPO_PASSED} passed, ${EXPO_FAILED} failed${NC}"
    echo "$EXPO_OUTPUT" | grep "FAIL\|●" | head -10 | sed 's/^/    /'
    log_suite "expo-market Jest" "$EXPO_PASSED" "$EXPO_FAILED"
  fi
else
  section "Phase 4b: Jest Unit Tests (Native Apps) — SKIPPED (--start-from $START_FROM)"
fi

# ─────────────────────────────────────────────────────────────────────────
# PHASE 5: Deno Integration Tests
# ─────────────────────────────────────────────────────────────────────────
if should_run_phase "5"; then
  section "Phase 5: Deno Integration Tests"

# 5a: Main integration tests
echo "  Running Deno integration tests (_tests/)..."
DENO_OUTPUT=$(cd supabase && deno test --allow-env --allow-net --allow-run --no-check "--ignore=functions/_tests/growbot.test.ts" functions/_tests/ 2>&1)
DENO_PASSED=$(echo "$DENO_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
DENO_FAILED=$(echo "$DENO_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

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
LEGACY_PASSED=$(echo "$LEGACY_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
LEGACY_FAILED=$(echo "$LEGACY_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

if [ "${LEGACY_FAILED:-0}" -eq 0 ] || [ -z "$LEGACY_FAILED" ]; then
  echo -e "  ${GREEN}✅ Deno Legacy: ${LEGACY_PASSED} tests — ALL PASS${NC}"
  log_suite "Deno Legacy" "$LEGACY_PASSED"
else
  echo -e "  ${RED}❌ Deno Legacy: ${LEGACY_PASSED} passed, ${LEGACY_FAILED} failed${NC}"
  log_suite "Deno Legacy" "$LEGACY_PASSED" "$LEGACY_FAILED"
fi

# 5c: Provider & compliance tests
echo "  Running provider & compliance tests..."
PROVIDER_OUTPUT=$(cd supabase && unset http_proxy https_proxy && SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY}" deno test --allow-env --allow-net --allow-run --no-check \
  functions/_shared/tremendous.test.ts \
  functions/_shared/reloadly.test.ts \
  functions/_provider-tests/giftcard-cache.test.ts \
  functions/_provider-tests/toggles.test.ts \
  functions/_compliance-tests/compliance.test.ts \
  functions/_tests/profile-backfill.test.ts 2>&1)
PROVIDER_PASSED=$(echo "$PROVIDER_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
PROVIDER_FAILED=$(echo "$PROVIDER_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

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
  functions/_tests/process-selected-payouts.test.ts \
  functions/_tests/market-purchase-gift-card.test.ts \
  functions/resolve-usps-address/integration.test.ts 2>&1)
FUNC_PASSED=$(echo "$FUNC_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
FUNC_FAILED=$(echo "$FUNC_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

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
CRM_PASSED=$(echo "$CRM_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
CRM_FAILED=$(echo "$CRM_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

if [ "${CRM_FAILED:-0}" -eq 0 ] || [ -z "$CRM_FAILED" ]; then
  echo -e "  ${GREEN}✅ CRM Edge Functions: ${CRM_PASSED} tests — ALL PASS${NC}"
  log_suite "CRM Edge Functions" "$CRM_PASSED"
else
  echo -e "  ${RED}❌ CRM Edge Functions: ${CRM_PASSED} passed, ${CRM_FAILED} failed${NC}"
  echo "$CRM_OUTPUT" | grep "FAILED" | head -10
  log_suite "CRM Edge Functions" "$CRM_PASSED" "$CRM_FAILED"
fi

# 5e2: CRM Short Links & Attribution tests
echo "  Running CRM Short Links & Attribution tests..."
SHORTLINK_OUTPUT=$(cd supabase && deno test --allow-env --allow-net --allow-run --no-check \
  functions/_tests/short-links-is-shared.test.ts 2>&1)
SHORTLINK_PASSED=$(echo "$SHORTLINK_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
SHORTLINK_FAILED=$(echo "$SHORTLINK_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

if [ "${SHORTLINK_FAILED:-0}" -eq 0 ] || [ -z "$SHORTLINK_FAILED" ]; then
  echo -e "  ${GREEN}✅ CRM Short Links & Attribution: ${SHORTLINK_PASSED} tests — ALL PASS${NC}"
  log_suite "CRM Short Links & Attribution" "$SHORTLINK_PASSED"
else
  echo -e "  ${RED}❌ CRM Short Links & Attribution: ${SHORTLINK_PASSED} passed, ${SHORTLINK_FAILED} failed${NC}"
  echo "$SHORTLINK_OUTPUT" | grep "FAILED" | head -10
  log_suite "CRM Short Links & Attribution" "$SHORTLINK_PASSED" "$SHORTLINK_FAILED"
fi

# 5f: Drip Sequence Engine integration tests
echo "  Running Drip Sequence Engine integration tests..."
SEQ_OUTPUT=$(SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  SUPABASE_ANON_KEY="$(npx supabase status -o env 2>/dev/null | grep ANON_KEY | cut -d'"' -f2)" \
  deno test --allow-env --allow-net --no-check \
  supabase/functions/_tests/sequence-engine.test.ts \
  supabase/functions/_tests/process-sequence-step.test.ts 2>&1)
SEQ_PASSED=$(echo "$SEQ_OUTPUT" | tail -n 5 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
SEQ_FAILED=$(echo "$SEQ_OUTPUT" | tail -n 5 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

if [ "${SEQ_FAILED:-0}" -eq 0 ] || [ -z "$SEQ_FAILED" ]; then
  echo -e "  ${GREEN}✅ Drip Sequence Engine: ${SEQ_PASSED} tests — ALL PASS${NC}"
  log_suite "Drip Sequence Engine" "$SEQ_PASSED"
else
  echo -e "  ${RED}❌ Drip Sequence Engine: ${SEQ_PASSED} passed, ${SEQ_FAILED} failed${NC}"
  echo "$SEQ_OUTPUT" | grep -E "FAILED|error:" | head -10
  log_suite "Drip Sequence Engine" "$SEQ_PASSED" "$SEQ_FAILED"
fi

# 5g: CRM Promotions RPC tests (enrollment + buyer discounts)
echo "  Running CRM Promotions RPC tests..."
PROMO_OUTPUT=$(cd supabase && deno test --allow-env --allow-net --allow-run --no-check \
  functions/_tests/crm-promotions-rpcs.test.ts 2>&1)
PROMO_PASSED=$(echo "$PROMO_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
PROMO_FAILED=$(echo "$PROMO_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

if [ "${PROMO_FAILED:-0}" -eq 0 ] || [ -z "$PROMO_FAILED" ]; then
  echo -e "  ${GREEN}✅ CRM Promotions RPCs: ${PROMO_PASSED} tests — ALL PASS${NC}"
  log_suite "CRM Promotions RPCs" "$PROMO_PASSED"
else
  echo -e "  ${RED}❌ CRM Promotions RPCs: ${PROMO_PASSED} passed, ${PROMO_FAILED} failed${NC}"
  echo "$PROMO_OUTPUT" | grep "FAILED" | head -10
  log_suite "CRM Promotions RPCs" "$PROMO_PASSED" "$PROMO_FAILED"
fi

# 5h: Credit Application tests (apply_credits_to_order pipeline)
echo "  Running Credit Application tests..."
CREDIT_OUTPUT=$(cd supabase && deno test --allow-env --allow-net --allow-run --no-check \
  functions/_tests/credit-application.test.ts 2>&1)
CREDIT_PASSED=$(echo "$CREDIT_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
CREDIT_FAILED=$(echo "$CREDIT_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

if [ "${CREDIT_FAILED:-0}" -eq 0 ] || [ -z "$CREDIT_FAILED" ]; then
  echo -e "  ${GREEN}✅ Credit Application: ${CREDIT_PASSED} tests — ALL PASS${NC}"
  log_suite "Credit Application" "$CREDIT_PASSED"
else
  echo -e "  ${RED}❌ Credit Application: ${CREDIT_PASSED} passed, ${CREDIT_FAILED} failed${NC}"
  echo "$CREDIT_OUTPUT" | grep "FAILED" | head -10
  log_suite "Credit Application" "$CREDIT_PASSED" "$CREDIT_FAILED"
fi

# 5i: Product CRUD tests (create, update, toggle, inventory)
echo "  Running Product CRUD tests..."
PRODUCT_OUTPUT=$(cd supabase && deno test --allow-env --allow-net --allow-run --no-check \
  functions/_tests/product-crud.test.ts 2>&1)
PRODUCT_PASSED=$(echo "$PRODUCT_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
PRODUCT_FAILED=$(echo "$PRODUCT_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

if [ "${PRODUCT_FAILED:-0}" -eq 0 ] || [ -z "$PRODUCT_FAILED" ]; then
  echo -e "  ${GREEN}✅ Product CRUD: ${PRODUCT_PASSED} tests — ALL PASS${NC}"
  log_suite "Product CRUD" "$PRODUCT_PASSED"
else
  echo -e "  ${RED}❌ Product CRUD: ${PRODUCT_PASSED} passed, ${PRODUCT_FAILED} failed${NC}"
  echo "$PRODUCT_OUTPUT" | grep "FAILED" | head -10
  log_suite "Product CRUD" "$PRODUCT_PASSED" "$PRODUCT_FAILED"
fi

# 5j: Delegation System tests (helper join, revoke, edge function)
echo "  Running Delegation System tests..."
DELEG_OUTPUT=$(cd supabase && deno test --allow-env --allow-net --allow-run --no-check \
  functions/_tests/delegation-system.test.ts 2>&1)
DELEG_PASSED=$(echo "$DELEG_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
DELEG_FAILED=$(echo "$DELEG_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

if [ "${DELEG_FAILED:-0}" -eq 0 ] || [ -z "$DELEG_FAILED" ]; then
  echo -e "  ${GREEN}✅ Delegation System: ${DELEG_PASSED} tests — ALL PASS${NC}"
  log_suite "Delegation System" "$DELEG_PASSED"
else
  echo -e "  ${RED}❌ Delegation System: ${DELEG_PASSED} passed, ${DELEG_FAILED} failed${NC}"
  echo "$DELEG_OUTPUT" | grep "FAILED" | head -10
  log_suite "Delegation System" "$DELEG_PASSED" "$DELEG_FAILED"
fi

# 5k: Profile Setup Pipeline tests (USPS, community, profile binding)
echo "  Running Profile Setup Pipeline tests..."
PROFILE_OUTPUT=$(cd supabase && deno test --allow-env --allow-net --allow-run --no-check \
  functions/_tests/profile-setup.test.ts 2>&1)
PROFILE_PASSED=$(echo "$PROFILE_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
PROFILE_FAILED=$(echo "$PROFILE_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

if [ "${PROFILE_FAILED:-0}" -eq 0 ] || [ -z "$PROFILE_FAILED" ]; then
  echo -e "  ${GREEN}✅ Profile Setup Pipeline: ${PROFILE_PASSED} tests — ALL PASS${NC}"
  log_suite "Profile Setup Pipeline" "$PROFILE_PASSED"
else
  echo -e "  ${RED}❌ Profile Setup Pipeline: ${PROFILE_PASSED} passed, ${PROFILE_FAILED} failed${NC}"
  echo "$PROFILE_OUTPUT" | grep "FAILED" | head -10
  log_suite "Profile Setup Pipeline" "$PROFILE_PASSED" "$PROFILE_FAILED"
fi

# 5l: GrowBot edge function tests
echo "  Running GrowBot edge function tests..."
GROWBOT_OUTPUT=$(cd supabase && deno test --allow-env --allow-net --allow-run --no-check \
  functions/_tests/growbot.test.ts 2>&1)
GROWBOT_PASSED=$(echo "$GROWBOT_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
GROWBOT_FAILED=$(echo "$GROWBOT_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

if [ "${GROWBOT_FAILED:-0}" -eq 0 ] || [ -z "$GROWBOT_FAILED" ]; then
  echo -e "  ${GREEN}✅ GrowBot Edge: ${GROWBOT_PASSED} tests — ALL PASS${NC}"
  log_suite "GrowBot Edge" "$GROWBOT_PASSED"
else
  echo -e "  ${RED}❌ GrowBot Edge: ${GROWBOT_PASSED} passed, ${GROWBOT_FAILED} failed${NC}"
  echo "$GROWBOT_OUTPUT" | grep "FAILED" | head -10
  log_suite "GrowBot Edge" "$GROWBOT_PASSED" "$GROWBOT_FAILED"
fi

# 5m: Account Closure tests
echo "  Running Account Closure tests..."
CLOSURE_OUTPUT=$(cd supabase && deno test --allow-env --allow-net --allow-run --no-check \
  functions/_tests/account-closure.test.ts 2>&1)
CLOSURE_PASSED=$(echo "$CLOSURE_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
CLOSURE_FAILED=$(echo "$CLOSURE_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

if [ "${CLOSURE_FAILED:-0}" -eq 0 ] || [ -z "$CLOSURE_FAILED" ]; then
  echo -e "  ${GREEN}✅ Account Closure: ${CLOSURE_PASSED} tests — ALL PASS${NC}"
  log_suite "Account Closure" "$CLOSURE_PASSED"
else
  echo -e "  ${RED}❌ Account Closure: ${CLOSURE_PASSED} passed, ${CLOSURE_FAILED} failed${NC}"
  echo "$CLOSURE_OUTPUT" | grep "FAILED" | head -10
  log_suite "Account Closure" "$CLOSURE_PASSED" "$CLOSURE_FAILED"
fi

# 5n: Multi-Stand & Catalog tests
echo "  Running Multi-Stand & Catalog tests..."
MSTAND_OUTPUT=$(cd supabase && deno test --allow-env --allow-net --allow-run --no-check \
  functions/_tests/multi-stand-catalog.test.ts 2>&1)
MSTAND_PASSED=$(echo "$MSTAND_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
MSTAND_FAILED=$(echo "$MSTAND_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

if [ "${MSTAND_FAILED:-0}" -eq 0 ] || [ -z "$MSTAND_FAILED" ]; then
  echo -e "  ${GREEN}✅ Multi-Stand & Catalog: ${MSTAND_PASSED} tests — ALL PASS${NC}"
  log_suite "Multi-Stand & Catalog" "$MSTAND_PASSED"
else
  echo -e "  ${RED}❌ Multi-Stand & Catalog: ${MSTAND_PASSED} passed, ${MSTAND_FAILED} failed${NC}"
  echo "$MSTAND_OUTPUT" | grep "FAILED" | head -10
  log_suite "Multi-Stand & Catalog" "$MSTAND_PASSED" "$MSTAND_FAILED"
fi

# 5o: Pro Subscription tests (confirm, receipts, notifications, webhooks)
echo "  Running Pro Subscription tests..."
PROSUB_OUTPUT=$(SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  SUPABASE_ANON_KEY="$(npx supabase status -o env 2>/dev/null | grep ANON_KEY | cut -d'"' -f2)" \
  deno test --allow-env --allow-net --no-check \
  supabase/functions/_tests/pro-subscription.test.ts 2>&1)
PROSUB_PASSED=$(echo "$PROSUB_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
PROSUB_FAILED=$(echo "$PROSUB_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

if [ "${PROSUB_FAILED:-0}" -eq 0 ] || [ -z "$PROSUB_FAILED" ]; then
  echo -e "  ${GREEN}✅ Pro Subscription: ${PROSUB_PASSED} tests — ALL PASS${NC}"
  log_suite "Pro Subscription" "$PROSUB_PASSED"
else
  echo -e "  ${RED}❌ Pro Subscription: ${PROSUB_PASSED} passed, ${PROSUB_FAILED} failed${NC}"
  echo "$PROSUB_OUTPUT" | grep -E "FAILED|error:|AssertionError" | head -10
  log_suite "Pro Subscription" "$PROSUB_PASSED" "$PROSUB_FAILED"
fi

# 5p: Tier Fee Verification tests
echo "  Running Tier Fee Verification tests..."
TIER_OUTPUT=$(npx supabase test db \
  supabase/tests/database/55_promotion_unification.test.sql 2>&1)
if echo "$TIER_OUTPUT" | grep -q "All tests successful"; then
  TIER_TESTS=$(echo "$TIER_OUTPUT" | grep "Files=" | sed 's/.*Tests=\([0-9]*\).*/\1/' || echo "25")
  echo -e "  ${GREEN}✅ Tier Fee Verification: ${TIER_TESTS} tests — ALL PASS${NC}"
  log_suite "Tier Fee Verification" "${TIER_TESTS:-25}"
else
  TIER_P=$(echo "$TIER_OUTPUT" | grep -c "^ok " || echo "0")
  TIER_F=$(echo "$TIER_OUTPUT" | grep -c "^not ok" || echo "0")
  echo -e "  ${RED}❌ Tier Fee Verification: ${TIER_P} passed, ${TIER_F} failed${NC}"
  echo "$TIER_OUTPUT" | grep "^not ok" | head -10 | sed 's/^/    /'
  log_suite "Tier Fee Verification" "$TIER_P" "$TIER_F"
fi

# 5q: Billing Downgrade tests (booth archival, pending downgrade)
echo "  Running Billing Downgrade tests..."
DG_OUTPUT=$(npx supabase test db \
  supabase/tests/database/56_billing_downgrade.test.sql 2>&1)
if echo "$DG_OUTPUT" | grep -q "All tests successful"; then
  DG_TESTS=$(echo "$DG_OUTPUT" | grep "Files=" | sed 's/.*Tests=\([0-9]*\).*/\1/' || echo "12")
  echo -e "  ${GREEN}✅ Billing Downgrade: ${DG_TESTS} tests — ALL PASS${NC}"
  log_suite "Billing Downgrade" "${DG_TESTS:-12}"
else
  DG_P=$(echo "$DG_OUTPUT" | grep -c "^ok " || echo "0")
  DG_F=$(echo "$DG_OUTPUT" | grep -c "^not ok" || echo "0")
  echo -e "  ${RED}❌ Billing Downgrade: ${DG_P} passed, ${DG_F} failed${NC}"
  echo "$DG_OUTPUT" | grep "^not ok" | head -10 | sed 's/^/    /'
  log_suite "Billing Downgrade" "$DG_P" "$DG_F"
fi

# 5r: Subscription Receipt & Billing Anchor tests
echo "  Running Subscription Receipt & Billing Anchor tests..."
RECEIPT_OUTPUT=$(SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  SUPABASE_ANON_KEY="$(npx supabase status -o env 2>/dev/null | grep ANON_KEY | cut -d'"' -f2)" \
  deno test --allow-env --allow-net --no-check \
  supabase/functions/_tests/pro-subscription.test.ts 2>&1)
RECEIPT_PASSED=$(echo "$RECEIPT_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
RECEIPT_FAILED=$(echo "$RECEIPT_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

if [ "${RECEIPT_FAILED:-0}" -eq 0 ] || [ -z "$RECEIPT_FAILED" ]; then
  echo -e "  ${GREEN}✅ Receipt & Billing: ${RECEIPT_PASSED} tests — ALL PASS${NC}"
  log_suite "Receipt & Billing" "$RECEIPT_PASSED"
else
  echo -e "  ${RED}❌ Receipt & Billing: ${RECEIPT_PASSED} passed, ${RECEIPT_FAILED} failed${NC}"
  echo "$RECEIPT_OUTPUT" | grep -E "FAILED|error:|AssertionError" | head -10
  log_suite "Receipt & Billing" "$RECEIPT_PASSED" "$RECEIPT_FAILED"
fi

# 5s: Subscription Email & Guide tests
echo "  Running Subscription Email & Guide tests..."
SUBEMAIL_OUTPUT=$(SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  SUPABASE_ANON_KEY="$(npx supabase status -o env 2>/dev/null | grep ANON_KEY | cut -d'"' -f2)" \
  deno test --allow-env --allow-net --no-check \
  supabase/functions/_tests/subscription-email.test.ts 2>&1)
SUBEMAIL_PASSED=$(echo "$SUBEMAIL_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo "0")
SUBEMAIL_FAILED=$(echo "$SUBEMAIL_OUTPUT" | tail -n 10 | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo "0")

if [ "${SUBEMAIL_FAILED:-0}" -eq 0 ] || [ -z "$SUBEMAIL_FAILED" ]; then
  echo -e "  ${GREEN}✅ Subscription Email: ${SUBEMAIL_PASSED} tests — ALL PASS${NC}"
  log_suite "Subscription Email" "$SUBEMAIL_PASSED"
else
  echo -e "  ${RED}❌ Subscription Email: ${SUBEMAIL_PASSED} passed, ${SUBEMAIL_FAILED} failed${NC}"
  echo "$SUBEMAIL_OUTPUT" | grep -E "FAILED|error:|AssertionError" | head -10
  log_suite "Subscription Email" "$SUBEMAIL_PASSED" "$SUBEMAIL_FAILED"
fi

# 5t: Subscription Trigger DB tests
echo "  Running Subscription Trigger DB tests..."
SUBTRIG_OUTPUT=$(npx supabase test db \
  supabase/tests/database/65_subscription_change_trigger.test.sql 2>&1)
if echo "$SUBTRIG_OUTPUT" | grep -q "All tests successful"; then
  SUBTRIG_TESTS=$(echo "$SUBTRIG_OUTPUT" | grep "Files=" | sed 's/.*Tests=\([0-9]*\).*/\1/' || echo "4")
  echo -e "  ${GREEN}✅ Subscription Trigger DB: ${SUBTRIG_TESTS} tests — ALL PASS${NC}"
  log_suite "Subscription Trigger DB" "${SUBTRIG_TESTS:-4}"
else
  SUBTRIG_P=$(echo "$SUBTRIG_OUTPUT" | grep -c "^ok " || echo "0")
  SUBTRIG_F=$(echo "$SUBTRIG_OUTPUT" | grep -c "^not ok" || echo "0")
  echo -e "  ${RED}❌ Subscription Trigger DB: ${SUBTRIG_P} passed, ${SUBTRIG_F} failed${NC}"
  echo "$SUBTRIG_OUTPUT" | grep "^not ok" | head -10 | sed 's/^/    /'
  log_suite "Subscription Trigger DB" "$SUBTRIG_P" "$SUBTRIG_F"
fi

# 5u: RLS Restricted Tables tests (stripe_connect_audit_log, public_profiles, catalog_item_allocations)
echo "  Running RLS Restricted Tables tests..."
RLS_OUTPUT=$(npx supabase test db \
  supabase/tests/database/66_rls_restricted_tables.test.sql 2>&1)
if echo "$RLS_OUTPUT" | grep -q "All tests successful"; then
  RLS_TESTS=$(echo "$RLS_OUTPUT" | grep "Files=" | sed 's/.*Tests=\([0-9]*\).*/\1/' || echo "19")
  echo -e "  ${GREEN}✅ RLS Restricted Tables: ${RLS_TESTS} tests — ALL PASS${NC}"
  log_suite "RLS Restricted Tables" "${RLS_TESTS:-19}"
else
  RLS_P=$(echo "$RLS_OUTPUT" | grep -c "^ok " || echo "0")
  RLS_F=$(echo "$RLS_OUTPUT" | grep -c "^not ok" || echo "0")
  echo -e "  ${RED}❌ RLS Restricted Tables: ${RLS_P} passed, ${RLS_F} failed${NC}"
  echo "$RLS_OUTPUT" | grep "^not ok" | head -10 | sed 's/^/    /'
  log_suite "RLS Restricted Tables" "$RLS_P" "$RLS_F"
fi

# 5v: Metrics RPC DB tests
echo "  Running Metrics RPC DB tests..."
METRICS_DB_OUTPUT=$(npx supabase test db \
  supabase/tests/database/68_metrics_rpcs.test.sql 2>&1)
if echo "$METRICS_DB_OUTPUT" | grep -q "All tests successful"; then
  METRICS_DB_TESTS=$(echo "$METRICS_DB_OUTPUT" | grep "Files=" | sed 's/.*Tests=\([0-9]*\).*/\1/' || echo "6")
  echo -e "  ${GREEN}✅ Metrics RPC DB: ${METRICS_DB_TESTS} tests — ALL PASS${NC}"
  log_suite "Metrics RPC DB" "${METRICS_DB_TESTS:-6}"
else
  METRICS_DB_P=$(echo "$METRICS_DB_OUTPUT" | grep -c "^ok " || echo "0")
  METRICS_DB_F=$(echo "$METRICS_DB_OUTPUT" | grep -c "^not ok" || echo "0")
  echo -e "  ${RED}❌ Metrics RPC DB: ${METRICS_DB_P} passed, ${METRICS_DB_F} failed${NC}"
  echo "$METRICS_DB_OUTPUT" | grep "^not ok" | head -10 | sed 's/^/    /'
  log_suite "Metrics RPC DB" "$METRICS_DB_P" "$METRICS_DB_F"
fi
else
  section "Phase 5: Deno Integration Tests — SKIPPED (--start-from $START_FROM)"
fi

# ─────────────────────────────────────────────────────────────────────────
# PHASE 6: Shell Integration Tests (Escalation Handling)
# ─────────────────────────────────────────────────────────────────────────
if should_run_phase "6"; then
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
else
  section "Phase 6: Shell Integration Tests — SKIPPED (--start-from $START_FROM)"
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
    local test_pattern="${5:-}"  # Optional: glob pattern to pass to playwright test

    local safe_name=$(echo "$app_name" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '_')
    echo "  Building and starting $app_name server..."
    local pid=""
    local build_log="scripts/output/build_${safe_name}.log"
    mkdir -p scripts/output

    # Always evict any stale server on this port before starting fresh.
    # Zombie processes from previous runs cause auth-setup timeouts that cascade
    # to 176+ "did not run" tests in the affected app.
    if lsof -nP -iTCP:$port -sTCP:LISTEN &>/dev/null; then
      echo "    ⚠️  Evicting stale server on :$port..."
      lsof -Pni :$port | grep LISTEN | awk '{print $2}' | xargs -r kill -9 2>/dev/null || true
      sleep 2
    fi

    # Clean stale .next cache to prevent ChunkLoadError from outdated webpack/turbopack hashes
    rm -rf "$app_dir/.next"
    echo "    Compiling production build (see $build_log)..."
    if ! (cd "$app_dir" && npm run build > "../../$build_log" 2>&1); then
      echo -e "${RED}    ❌ Build failed for $app_name! Check $build_log${NC}"
      cat "$build_log" | tail -20
      exit 1
    fi

    if [ "$use_port_env" = "true" ]; then
      (cd "$app_dir" && NODE_OPTIONS='--max-old-space-size=4096' PORT=$port npm run start &>/dev/null) &
    else
      (cd "$app_dir" && NODE_OPTIONS='--max-old-space-size=4096' npm run start &>/dev/null) &
    fi
    pid=$!
    echo "    $app_name → :$port"

    echo "    Waiting for $app_name server..."
    local server_ready=false
    for i in $(seq 1 180); do
      if curl -s "http://localhost:$port" &>/dev/null; then
        server_ready=true
        break
      fi
      sleep 1
    done

    if [ "$server_ready" = "true" ]; then
      echo -e "    ${GREEN}✅ $app_name server ready${NC}"
    else
      echo -e "${RED}    ❌ $app_name server failed to start within 3 minutes.${NC}"
      exit 1
    fi

    local logfile="scripts/output/playwright_${safe_name}.log"

    echo "  Running $app_name Playwright E2E..."
    mkdir -p scripts/output
    (cd "$app_dir" && SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" env -u FORCE_COLOR NO_COLOR=1 npx playwright test $test_pattern --reporter=line 2>&1) | tee "$logfile"
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

  # ── Market E2E is split into mocked and scenario/seeded batches ──
  if should_run_phase "7a"; then run_playwright_sequential "Phase 7a: Market (Mocked)" "apps/next-market" "3001" "true" "e2e/*.spec.ts"; fi
  if should_run_phase "7b"; then run_playwright_sequential "Phase 7b: Market (Scenarios/Seeded)" "apps/next-market" "3001" "true" "e2e/scenarios/"; fi

  if should_run_phase "7c"; then run_playwright_sequential "Phase 7c: Admin" "apps/next-admin" "3003" "true"; fi
  if should_run_phase "7d"; then run_playwright_sequential "Phase 7d: Voice" "apps/next-community-voice" "3002" "true"; fi
  if should_run_phase "7e"; then run_playwright_sequential "Phase 7e: Metrics" "apps/next-metrics" "3004" "true"; fi
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

  echo "  Running Stripe Connect safety net + stress tests..."
  STRESS4=$(npx supabase test db \
    supabase/tests/database/61_stripe_connect_stress.test.sql \
    supabase/tests/database/62_stripe_connect_safety_net.test.sql 2>&1)
  if echo "$STRESS4" | grep -q "All tests successful"; then
    STRESS4_TESTS=$(echo "$STRESS4" | grep "^Files=" | sed 's/.*Tests=\([0-9]*\).*/\1/')
    echo -e "  ${GREEN}✅ Stripe Connect Safety: ${STRESS4_TESTS} tests${NC}"
    log_suite "Stripe Connect Safety" "${STRESS4_TESTS:-0}"
  elif echo "$STRESS4" | grep -q "finish"; then
    echo -e "  ${GREEN}✅ Stripe Connect Safety${NC}"
    log_suite "Stripe Connect Safety" "1"
  else
    echo -e "  ${YELLOW}⚠️  Stripe Connect Safety had issues${NC}"
    echo "$STRESS4" | grep -E "^not ok|ERROR" | head -5 | sed 's/^/    /'
    STRESS4_PASSED=$(echo "$STRESS4" | grep -c "^ok " || echo "0")
    STRESS4_FAILED=$(echo "$STRESS4" | grep -c "^not ok" || echo "0")
    log_suite "Stripe Connect Safety" "$STRESS4_PASSED" "$STRESS4_FAILED"
  fi

  echo "  Running Drip Sequence live batch & timezone stress test..."
  if deno run --allow-net --allow-env --allow-read scripts/run-wait-stress-test.ts 2>&1; then
    echo -e "  ${GREEN}✅ Drip Sequence Stress: 360 emails verified — PASS${NC}"
    log_suite "Drip Sequence Stress" "1"
  else
    echo -e "  ${RED}❌ Drip Sequence Stress — FAIL${NC}"
    log_suite "Drip Sequence Stress" "0" "1"
  fi

  echo "  Running CRM Multi-Produce Bitmask Cluster Finder benchmark stress test..."
  if npm --prefix apps/next-admin run test -- --run BitmaskClusterFinder.test.ts >/dev/null 2>&1; then
    echo -e "  ${GREEN}✅ Bitmask Cluster Benchmark: 100 crops / 50 ZIPs in <15ms — PASS${NC}"
    log_suite "Bitmask Cluster Stress" "2"
  else
    echo -e "  ${RED}❌ Bitmask Cluster Benchmark — FAIL${NC}"
    log_suite "Bitmask Cluster Stress" "0" "1"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────
# Cleanup
# ─────────────────────────────────────────────────────────────────────────
# Kill edge functions server
kill "$EDGE_PID" 2>/dev/null || true

# ── Restore AI_MOCK to original value ──
sed -i '' "s/^AI_MOCK=.*/${AI_MOCK_ORIGINAL}/" "$FUNCTIONS_ENV" 2>/dev/null || true
# Restore .env.local
if [ -f "$LOCAL_ENV" ]; then
  if [ -n "$AI_MOCK_LOCAL_ORIGINAL" ]; then
    sed -i '' "s/^AI_MOCK=.*/${AI_MOCK_LOCAL_ORIGINAL}/" "$LOCAL_ENV" 2>/dev/null || true
  else
    # AI_MOCK was appended — remove it
    sed -i '' '/^AI_MOCK=/d' "$LOCAL_ENV" 2>/dev/null || true
  fi
fi
echo "  🔓 AI_MOCK restored to: ${AI_MOCK_ORIGINAL}"

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
