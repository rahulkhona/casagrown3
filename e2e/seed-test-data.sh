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

  echo ""
  echo -e "${GREEN}  ✅ Database reset complete${NC}"
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
echo "    • Looking for Basil (buy) — buyer"
echo "    • Tomato growing tips (advice) — buyer"
echo ""
echo -e "  ${CYAN}Community:${NC} Willow Glen (San Jose, CA 95125)"
echo -e "  ${CYAN}Points:${NC}    500 pts each user"
echo ""
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Ready for E2E tests!${NC}"
echo -e "${GREEN}  Run: maestro test e2e/maestro/${NC}"
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo ""
