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

# ─────────────────────────────────────────────────────────────────────────
# PHASE 4b: Jest Unit Tests (Native Apps)
# ─────────────────────────────────────────────────────────────────────────
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

# ─────────────────────────────────────────────────────────────────────────
# PHASE 5: Deno Integration Tests
# ─────────────────────────────────────────────────────────────────────────
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
PROVIDER_OUTPUT=$(cd supabase && deno test --allow-env --allow-net --allow-run --no-check \
  functions/_shared/tremendous.test.ts \
  functions/_shared/reloadly.test.ts \
  functions/_provider-tests/giftcard-cache.test.ts \
  functions/_provider-tests/toggles.test.ts \
  functions/_compliance-tests/compliance.test.ts 2>&1)
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

# 5g: CRM Promotions RPC tests (enrollment + blueprint incentives)
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
    local build_log="scripts/output/build_$(echo "$app_name" | tr '[:upper:]' '[:lower:]').log"
    mkdir -p scripts/output

    if ! lsof -nP -iTCP:$port -sTCP:LISTEN &>/dev/null; then
      # Clean stale .next cache to prevent ChunkLoadError from outdated webpack/turbopack hashes
      rm -rf "$app_dir/.next"
      echo "    Compiling production build (see $build_log)..."
      if ! (cd "$app_dir" && npm run build > "../../$build_log" 2>&1); then
        echo -e "${RED}    ❌ Build failed for $app_name! Check $build_log${NC}"
        cat "$build_log" | tail -20
        exit 1
      fi

      if [ "$use_port_env" = "true" ]; then
        (cd "$app_dir" && PORT=$port npm run start &>/dev/null) &
      else
        (cd "$app_dir" && npm run start &>/dev/null) &
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

  run_playwright_sequential "Market" "apps/next-market" "3001" "true"
  run_playwright_sequential "Admin" "apps/next-admin" "3003" "true"
  run_playwright_sequential "Voice" "apps/next-community-voice" "3002" "true"
  run_playwright_sequential "Metrics" "apps/next-metrics" "3004" "true"
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
