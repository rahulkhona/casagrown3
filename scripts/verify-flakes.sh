#!/usr/bin/env bash
export PATH="$HOME/.deno/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/opt/homebrew/Cellar/node@22/22.22.0/bin:/Applications/Docker.app/Contents/Resources/bin:/usr/local/bin:$PATH"

echo "=========================================="
echo "Resetting Database & Edge Functions..."
echo "=========================================="
npx supabase db reset
SERVICE_ROLE_KEY=$(npx supabase status -o env 2>/dev/null | grep SERVICE_ROLE_KEY | cut -d'"' -f2)
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" node scripts/init-storage.js
pkill -f "npx supabase functions serve" 2>/dev/null || true
npx supabase functions serve --env-file supabase/.env.local &>/dev/null &
EDGE_PID=$!
sleep 5

echo ""
echo "=========================================="
echo "1. Testing Market Flakes (2 tests)"
echo "=========================================="
(cd apps/next-market && npm run dev &>/dev/null) &
PID1=$!
echo "Waiting for Market server (:3001)..."
for i in {1..30}; do curl -s "http://localhost:3001" &>/dev/null && break || sleep 1; done
(cd apps/next-market && npx playwright test e2e/scenarios/notifications-payouts.spec.ts:444 e2e/scenarios/pioneer-banner.spec.ts:7 --reporter=list)
kill $PID1 2>/dev/null || true
lsof -Pni :3001 | grep LISTEN | awk '{print $2}' | xargs -r kill -9 2>/dev/null || true
sleep 3

echo ""
echo "=========================================="
echo "2. Testing Admin Flakes (2 tests)"
echo "=========================================="
(cd apps/next-admin && PORT=3003 npm run dev &>/dev/null) &
PID2=$!
echo "Waiting for Admin server (:3003)..."
for i in {1..30}; do curl -s "http://localhost:3003" &>/dev/null && break || sleep 1; done
(cd apps/next-admin && npx playwright test e2e/home.spec.ts:4 e2e/payout-queue.spec.ts:20 --reporter=list)
kill $PID2 2>/dev/null || true
lsof -Pni :3003 | grep LISTEN | awk '{print $2}' | xargs -r kill -9 2>/dev/null || true
sleep 3

echo ""
echo "=========================================="
echo "3. Testing Metrics Flakes (7 tests)"
echo "=========================================="
(cd apps/next-metrics && npm run dev &>/dev/null) &
PID3=$!
echo "Waiting for Metrics server (:3004)..."
for i in {1..30}; do curl -s "http://localhost:3004" &>/dev/null && break || sleep 1; done
(cd apps/next-metrics && npx playwright test e2e/marketing.spec.ts:34 e2e/marketing.spec.ts:45 e2e/metrics.spec.ts:57 e2e/metrics.spec.ts:67 e2e/metrics.spec.ts:101 e2e/metrics.spec.ts:110 e2e/metrics.spec.ts:124 --reporter=list)
kill $PID3 2>/dev/null || true
lsof -Pni :3004 | grep LISTEN | awk '{print $2}' | xargs -r kill -9 2>/dev/null || true

kill $EDGE_PID 2>/dev/null || true
echo "=========================================="
echo "Verification Complete."
echo "=========================================="
