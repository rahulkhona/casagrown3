#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# db-start.sh — Start all Supabase services and verify health
# ─────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
CHECK="✅"
CROSS="❌"
WARN="⚠️"

BASE_URL="http://127.0.0.1:54321"

log()  { echo -e "${GREEN}${CHECK} $1${NC}"; }
warn() { echo -e "${YELLOW}${WARN}  $1${NC}"; }
fail() { echo -e "${RED}${CROSS} $1${NC}"; }

# ── 1. Start Supabase ────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo "  Starting Supabase local development setup"
echo "═══════════════════════════════════════════════"
echo ""

# Check if already running
if supabase status 2>&1 | grep -q "is running"; then
  STATUS_OUTPUT=$(supabase status 2>&1)
  STOPPED=$(echo "$STATUS_OUTPUT" | grep "Stopped services:" || true)
  if [ -n "$STOPPED" ]; then
    warn "Supabase is running but some services are stopped:"
    echo "    $STOPPED"
    echo ""
    echo "Performing full restart to bring all services up..."
    supabase stop
    supabase start
  else
    log "Supabase is already running with all services"
  fi
else
  echo "Starting Supabase..."
  supabase start
fi

echo ""

# ── 2. Start Edge Functions ──────────────────────────────────
echo "Starting Edge Functions..."

# Kill any existing functions serve process
pkill -f "supabase functions serve" 2>/dev/null || true
sleep 1

# Start functions serve in background
supabase functions serve > /tmp/supabase-functions.log 2>&1 &
FUNCTIONS_PID=$!

# Wait for functions to be ready (up to 15s)
FUNCTIONS_READY=false
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w '' "$BASE_URL/functions/v1/" 2>/dev/null; then
    FUNCTIONS_READY=true
    break
  fi
  sleep 0.5
done

if [ "$FUNCTIONS_READY" = true ]; then
  log "Edge Functions serving (PID: $FUNCTIONS_PID)"
else
  warn "Edge Functions may still be starting (PID: $FUNCTIONS_PID)"
fi

echo ""

# ── 3. Health Checks ─────────────────────────────────────────
echo "═══════════════════════════════════════════════"
echo "  Running health checks"
echo "═══════════════════════════════════════════════"
echo ""

FAILURES=0

# Extract keys from supabase status
ANON_KEY=$(supabase status 2>&1 | grep 'anon key' | awk '{print $NF}')
SERVICE_KEY=$(supabase status 2>&1 | grep 'service_role key' | awk '{print $NF}')

# REST API
if curl -sf -o /dev/null "$BASE_URL/rest/v1/" -H "apikey: $ANON_KEY"; then
  log "REST API          $BASE_URL/rest/v1"
else
  fail "REST API          Not responding"
  FAILURES=$((FAILURES + 1))
fi

# Auth
if curl -sf -o /dev/null "$BASE_URL/auth/v1/health"; then
  log "Auth              $BASE_URL/auth/v1"
else
  fail "Auth              Not responding"
  FAILURES=$((FAILURES + 1))
fi

# Storage
if curl -sf -o /dev/null "$BASE_URL/storage/v1/status"; then
  log "Storage           $BASE_URL/storage/v1"
else
  fail "Storage           Not responding"
  FAILURES=$((FAILURES + 1))
fi

# Storage buckets exist
BUCKET_COUNT=$(curl -s "$BASE_URL/storage/v1/bucket" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" 2>/dev/null \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

if [ "$BUCKET_COUNT" -gt 0 ] 2>/dev/null; then
  log "Storage Buckets   $BUCKET_COUNT bucket(s) found"
else
  fail "Storage Buckets   None found — seed data may not have been applied"
  FAILURES=$((FAILURES + 1))
fi

# Edge Functions
EDGE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/functions/v1/pair-delegation" \
  -H "Content-Type: application/json" \
  -d '{"action":"lookup","code":"healthcheck"}' 2>/dev/null || echo "000")

if [ "$EDGE_STATUS" = "404" ] || [ "$EDGE_STATUS" = "200" ]; then
  log "Edge Functions    Responding (pair-delegation → $EDGE_STATUS)"
else
  fail "Edge Functions    Not responding (HTTP $EDGE_STATUS)"
  FAILURES=$((FAILURES + 1))
fi

# Database — test a simple query
DB_CHECK=$(curl -s "$BASE_URL/rest/v1/profiles?select=id&limit=1" \
  -H "apikey: $ANON_KEY" 2>/dev/null || echo "error")

if echo "$DB_CHECK" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
  log "Database          Queryable via REST"
else
  fail "Database          Query failed"
  FAILURES=$((FAILURES + 1))
fi

# Studio
if curl -sf -o /dev/null "http://127.0.0.1:54323"; then
  log "Studio            http://127.0.0.1:54323"
else
  warn "Studio            Not responding (optional)"
fi

# Mailpit
if curl -sf -o /dev/null "http://127.0.0.1:54324"; then
  log "Mailpit           http://127.0.0.1:54324"
else
  warn "Mailpit           Not responding (optional)"
fi

echo ""

# ── 4. Summary ───────────────────────────────────────────────
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  All services healthy! Ready for development.${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
else
  echo -e "${RED}═══════════════════════════════════════════════${NC}"
  echo -e "${RED}  $FAILURES service(s) failed health check.${NC}"
  echo -e "${RED}  Try: supabase stop && supabase start${NC}"
  echo -e "${RED}═══════════════════════════════════════════════${NC}"
  exit 1
fi

echo ""
echo "Edge Functions log: /tmp/supabase-functions.log"
echo ""
