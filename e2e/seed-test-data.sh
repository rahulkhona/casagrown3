#!/usr/bin/env bash
# =============================================================================
# seed-test-data.sh — Reset database and prepare environment for E2E tests
# =============================================================================
# Usage:
#   ./e2e/seed-test-data.sh          # Full reset (db reset + mailpit clear)
#   ./e2e/seed-test-data.sh --skip-reset  # Only clear mailpit (db already seeded)
#
# This script:
#   1. Resets the local Supabase database (runs all migrations + seed.sql)
#   2. Clears Mailpit messages to prevent stale OTPs
#   3. Prints a summary of the seeded test data
#
# Prerequisites:
#   - Docker running (for Supabase containers)
#   - Supabase CLI installed (npx supabase)
#   - Supabase stack started (npx supabase start)
# =============================================================================

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

MAILPIT_URL="${MAILPIT_URL:-http://localhost:54324}"
SKIP_RESET=false

for arg in "$@"; do
  case $arg in
    --skip-reset) SKIP_RESET=true ;;
    *) echo -e "${RED}Unknown option: $arg${NC}"; exit 1 ;;
  esac
done

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   CasaGrown E2E Test Data Seed Script       ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Reset Supabase database
# ---------------------------------------------------------------------------
if [ "$SKIP_RESET" = false ]; then
  echo -e "${YELLOW}[1/3] Resetting Supabase database...${NC}"
  echo "       This drops the DB, re-applies all migrations, and runs seed.sql"
  echo ""

  # Run from the repo root (where supabase/ directory lives)
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

  npx supabase db reset --workdir "$REPO_ROOT"

  # Wait for Supabase Auth to be healthy after container restart.
  # db reset restarts containers and auth may not be immediately ready,
  # causing "Database error finding user" on OTP login.
  echo ""
  echo -e "${YELLOW}  Waiting for Supabase Auth to be ready...${NC}"
  AUTH_URL="${SUPABASE_URL:-http://127.0.0.1:54321}/auth/v1/health"
  for i in $(seq 1 30); do
    if curl -sf "$AUTH_URL" > /dev/null 2>&1; then
      echo -e "${GREEN}  ✅ Auth service healthy${NC}"
      break
    fi
    if [ "$i" = "30" ]; then
      echo -e "${RED}  ⚠️  Auth service not responding after 30s — tests may fail${NC}"
    fi
    sleep 1
  done

  echo ""
  echo -e "${GREEN}  ✅ Database reset complete${NC}"

  # Clear app data on any booted iOS Simulator to invalidate stale auth sessions.
  # After a DB reset, all auth users are recreated with new UUIDs, so any cached
  # tokens in the app become invalid. Without this, Maestro flows that reuse the
  # cached session will fail.
  BOOTED_SIM=$(xcrun simctl list devices booted -j 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
for runtime, devices in data.get('devices', {}).items():
    for d in devices:
        if d.get('state') == 'Booted':
            print(d['udid'])
            sys.exit(0)
" 2>/dev/null || true)

  if [ -n "$BOOTED_SIM" ]; then
    echo ""
    echo -e "${YELLOW}  Clearing app data on simulator to invalidate stale auth...${NC}"
    # Terminate the app first (if running), then erase its data
    xcrun simctl terminate "$BOOTED_SIM" dev.casagrown.community 2>/dev/null || true
    # Remove app data container (keeps the app installed but clears storage/keychain data)
    APP_DATA_DIR=$(xcrun simctl get_app_container "$BOOTED_SIM" dev.casagrown.community data 2>/dev/null || true)
    if [ -n "$APP_DATA_DIR" ]; then
      rm -rf "$APP_DATA_DIR"/Library/Preferences/dev.casagrown.community* 2>/dev/null || true
      rm -rf "$APP_DATA_DIR"/Library/Application\ Support/* 2>/dev/null || true
      rm -rf "$APP_DATA_DIR"/Documents/* 2>/dev/null || true
      rm -rf "$APP_DATA_DIR"/tmp/* 2>/dev/null || true
      echo -e "${GREEN}  ✅ App data cleared on simulator${NC}"
    else
      echo -e "${YELLOW}  ⚠️  App not installed on simulator — will be fresh on first launch${NC}"
    fi
  fi
else
  echo -e "${YELLOW}[1/3] Skipping database reset (--skip-reset)${NC}"
fi

# ---------------------------------------------------------------------------
# Step 2: Clear Mailpit messages
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}[2/3] Clearing Mailpit messages...${NC}"

if curl -sf -X DELETE "${MAILPIT_URL}/api/v1/messages" > /dev/null 2>&1; then
  echo -e "${GREEN}  ✅ Mailpit messages cleared${NC}"
else
  echo -e "${RED}  ⚠️  Could not reach Mailpit at ${MAILPIT_URL}${NC}"
  echo "       Make sure Supabase is running (npx supabase start)"
fi

# ---------------------------------------------------------------------------
# Step 3: Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}[3/3] Seeded test data summary${NC}"
echo ""
echo -e "  ${CYAN}Test Users:${NC}"
echo "    ┌────────────────────────────────────────────────────────────────┐"
echo "    │ Role    │ Email              │ Password        │ UUID (prefix)│"
echo "    ├─────────┼────────────────────┼─────────────────┼──────────────┤"
echo "    │ Seller  │ seller@test.local  │ TestPassword123!│ a1111111-... │"
echo "    │ Buyer   │ buyer@test.local   │ TestPassword123!│ b2222222-... │"
echo "    └────────────────────────────────────────────────────────────────┘"
echo ""
echo -e "  ${CYAN}Test Posts:${NC}"
echo "    • Tomatoes (sell, 10 box @ 25pts) — seller"
echo "    • Strawberries (sell, 5 box @ 40pts) — seller"
echo "    • Peppers (sell, 8 bag @ 15pts) — buyer"
echo "    • Looking for Basil (buy) — buyer"
echo "    • Tomato growing tips (advice) — buyer"
echo ""
echo -e "  ${CYAN}Pre-Seeded Order:${NC}"
echo "    • Seller→Buyer: 3 bags Peppers, 45 pts, pending"
echo "    • Conversation + system message seeded"
echo ""
echo -e "  ${CYAN}Community:${NC} Willow Glen (San Jose, CA 95125)"
echo -e "  ${CYAN}Points:${NC}    500 pts (seller: 455 after escrow), 500 pts (buyer)"
echo ""
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Ready for E2E tests!${NC}"
echo -e "${GREEN}  Run: maestro test e2e/maestro/${NC}"
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo ""
