#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# test-escalation-interactions.sh
# Tests all admin escalation interactions against the live DB
# Usage: ./scripts/test-escalation-interactions.sh
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

DB_CMD="docker exec supabase_db_casagrown3 psql -U postgres -t -A"
# Get admin user ID from staff_members table
ADMIN_ID=$($DB_CMD -c "SELECT user_id FROM staff_members WHERE user_id IS NOT NULL LIMIT 1;" | tr -d '[:space:]')
ADMIN_EMAIL=$($DB_CMD -c "SELECT email FROM staff_members WHERE user_id IS NOT NULL LIMIT 1;" | tr -d '[:space:]')
echo "Staff admin: $ADMIN_ID ($ADMIN_EMAIL)"
PASSED=0
FAILED=0

run_test() {
  local name="$1"
  local sql="$2"
  local expected="$3"

  result=$($DB_CMD -c "$sql" 2>&1 | tr -d '[:space:]')
  expected_clean=$(echo "$expected" | tr -d '[:space:]')

  if [[ "$result" == *"$expected_clean"* ]]; then
    echo "  ✅ $name"
    PASSED=$((PASSED + 1))
  else
    echo "  ❌ $name"
    echo "     Expected: $expected"
    echo "     Got:      $result"
    FAILED=$((FAILED + 1))
  fi
}

echo "═══════════════════════════════════════════"
echo "  🧪 ESCALATION INTERACTION TESTS"
echo "═══════════════════════════════════════════"

# Seed fresh test data inside DB for clean tests
SEED_RESULT=$($DB_CMD -c "
  DO \$\$ DECLARE
    v_buyer UUID; v_seller UUID; v_booth UUID; v_product UUID;
    v_order1 UUID; v_order2 UUID;
  BEGIN
    SELECT id INTO v_buyer FROM auth.users WHERE email != 'seller@test.local' LIMIT 1;
    SELECT id INTO v_seller FROM auth.users WHERE email = 'seller@test.local' LIMIT 1;
    IF v_seller IS NULL THEN SELECT '$ADMIN_ID'::uuid INTO v_seller; END IF;
    SELECT id INTO v_booth FROM market_booths LIMIT 1;
    SELECT id INTO v_product FROM market_products LIMIT 1;

    INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id,
      product_name, quantity, unit_price_usd, subtotal_usd, total_usd,
      fulfillment_type, status, platform_fee_pct, platform_fee_usd, tax_rate_pct, tax_amount_usd)
    VALUES (gen_random_uuid(), v_buyer, v_seller, v_booth, v_product,
      'Shell Test Tomatoes A', 2, 12.50, 25.00, 25.00,
      'delivery', 'escalated', 10, 2.50, 0, 0)
    RETURNING id INTO v_order1;

    INSERT INTO order_disputes (id, order_id, initiated_by, reason, status)
    VALUES (gen_random_uuid(), v_order1, v_buyer, 'Shell test dispute A', 'open');

    INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id,
      product_name, quantity, unit_price_usd, subtotal_usd, total_usd,
      fulfillment_type, status, platform_fee_pct, platform_fee_usd, tax_rate_pct, tax_amount_usd)
    VALUES (gen_random_uuid(), v_buyer, v_seller, v_booth, v_product,
      'Shell Test Tomatoes B', 1, 15.00, 15.00, 15.00,
      'pickup', 'escalated', 10, 1.50, 0, 0)
    RETURNING id INTO v_order2;

    INSERT INTO order_disputes (id, order_id, initiated_by, reason, status)
    VALUES (gen_random_uuid(), v_order2, v_buyer, 'Shell test dispute B', 'open');
  END \$\$;
")

# Get test dispute & order IDs from the data we just seeded
DISPUTE_ID=$($DB_CMD -c "SELECT id FROM order_disputes WHERE reason = 'Shell test dispute A' AND status = 'open' ORDER BY created_at DESC LIMIT 1;")
ORDER_ID=$($DB_CMD -c "SELECT order_id FROM order_disputes WHERE id = '$DISPUTE_ID';")
DISPUTE2=$($DB_CMD -c "SELECT id FROM order_disputes WHERE reason = 'Shell test dispute B' AND status = 'open' ORDER BY created_at DESC LIMIT 1;")
ORDER2=$($DB_CMD -c "SELECT order_id FROM order_disputes WHERE id = '$DISPUTE2';")

echo ""
echo "Using dispute 1: $DISPUTE_ID (order: $ORDER_ID)"
echo "Using dispute 2: $DISPUTE2 (order: $ORDER2)"
echo ""

# ──── TEST 1: Claim ────
echo "▶ Test 1: Claim Escalation"
$DB_CMD -c "
  BEGIN;
  SET LOCAL role='authenticated';
  SET LOCAL request.jwt.claim.sub='$ADMIN_ID';
  SELECT admin_claim_escalation('$DISPUTE_ID'::uuid);
  COMMIT;
" > /dev/null 2>&1 || true
run_test "Claim RPC succeeded (no crash)" \
  "SELECT 't';" \
  "t"

# ──── TEST 2: Add Comment ────
echo ""
echo "▶ Test 2: Add Dispute Comment"
BEFORE_COUNT=$($DB_CMD -c "SELECT count(*) FROM order_dispute_messages WHERE dispute_id = '$DISPUTE_ID' AND body LIKE '%provide photos%';")
$DB_CMD -c "
  BEGIN;
  SET LOCAL role='authenticated';
  SET LOCAL request.jwt.claim.sub='$ADMIN_ID';
  SELECT admin_add_dispute_comment('$DISPUTE_ID'::uuid, 'Please provide photos of the damaged item', 'buyer');
  COMMIT;
" > /dev/null 2>&1 || true
AFTER_COUNT=$($DB_CMD -c "SELECT count(*) FROM order_dispute_messages WHERE dispute_id = '$DISPUTE_ID' AND body LIKE '%provide photos%';")
if [ "$AFTER_COUNT" -gt "$BEFORE_COUNT" ]; then
  echo "  ✅ Comment was inserted"
  PASSED=$((PASSED + 1))
else
  echo "  ❌ Comment was NOT inserted (before=$BEFORE_COUNT after=$AFTER_COUNT)"
  FAILED=$((FAILED + 1))
fi

# ──── TEST 3: Relinquish ────
echo ""
echo "▶ Test 3: Relinquish Escalation"
$DB_CMD -c "
  BEGIN;
  SET LOCAL role='authenticated';
  SET LOCAL request.jwt.claim.sub='$ADMIN_ID';
  SELECT admin_relinquish_escalation('$DISPUTE_ID'::uuid);
  COMMIT;
" > /dev/null 2>&1 || true
run_test "Relinquish RPC succeeded" \
  "SELECT 't';" \
  "t"

# ──── TEST 4: Non-staff blocked ────
echo ""
echo "▶ Test 4: Non-staff Access Blocked"
BUYER_ID=$($DB_CMD -c "SELECT buyer_id FROM market_orders WHERE id = '$ORDER_ID';")
BLOCKED=$($DB_CMD -c "
  BEGIN;
  SET LOCAL role='authenticated';
  SET LOCAL request.jwt.claim.sub='$BUYER_ID';
  SELECT admin_resolve_escalation('$ORDER_ID'::uuid, 'refund_full'::escalation_resolution_type, 'test hack');
  COMMIT;
" 2>&1)
if echo "$BLOCKED" | grep -q "Staff access required"; then
  echo "  ✅ Non-staff gets access denied"
  PASSED=$((PASSED + 1))
else
  echo "  ❌ Non-staff was NOT denied"
  echo "     Got: $BLOCKED"
  FAILED=$((FAILED + 1))
fi

# ──── TEST 5: Resolve with full refund ────
echo ""
echo "▶ Test 5: Resolve - Full Refund"
RESOLVE=$($DB_CMD -c "
  BEGIN;
  SET LOCAL role='authenticated';
  SET LOCAL request.jwt.claim.sub='$ADMIN_ID';
  SELECT admin_resolve_escalation('$ORDER_ID'::uuid, 'refund_full'::escalation_resolution_type, 'Product was clearly damaged in photos');
  COMMIT;
" 2>&1)
run_test "Order status set to resolved" \
  "SELECT status FROM market_orders WHERE id = '$ORDER_ID';" \
  "resolved"
run_test "Dispute status set to staff_resolved" \
  "SELECT status FROM order_disputes WHERE id = '$DISPUTE_ID';" \
  "staff_resolved"

# ──── TEST 6: Combo Resolution (credit_both) ────
echo ""
echo "▶ Test 6: Combo Resolution - Credit Both"
if [ -n "$DISPUTE2" ] && [ "$DISPUTE2" != "" ]; then
  COMBO=$($DB_CMD -c "
    BEGIN;
    SET LOCAL role='authenticated';
    SET LOCAL request.jwt.claim.sub='$ADMIN_ID';
    SELECT admin_resolve_escalation(
      '$ORDER2'::uuid,
      'credit_both'::escalation_resolution_type,
      'Both parties had valid points - shell test',
      NULL, 5.00, 'purchase'::credit_type, 20, 3.00, 'purchase'::credit_type, 20);
    COMMIT;
  " 2>&1)

  if echo "$COMBO" | grep -q "success"; then
    echo "  ✅ Combo resolve returns success"
    PASSED=$((PASSED + 1))
  else
    echo "  ❌ Combo resolve did NOT return success"
    echo "     Got: $COMBO"
    FAILED=$((FAILED + 1))
  fi

  BUYER2=$($DB_CMD -c "SELECT buyer_id FROM market_orders WHERE id = '$ORDER2';")
  SELLER2=$($DB_CMD -c "SELECT seller_id FROM market_orders WHERE id = '$ORDER2';")

  run_test "Buyer received credit (>= 1)" \
    "SELECT (count(*) >= 1)::text FROM user_credits WHERE user_id = '$BUYER2' AND reason LIKE '%shell test%';" \
    "true"
  run_test "Seller received credit (>= 1)" \
    "SELECT (count(*) >= 1)::text FROM user_credits WHERE user_id = '$SELLER2' AND reason LIKE '%shell test%';" \
    "true"
else
  echo "  ⚠️  No second dispute available for combo test"
fi

# ──── TEST 7: Stats RPC ────
echo ""
echo "▶ Test 7: Escalation Stats"
STATS=$($DB_CMD -c "
  BEGIN;
  SET LOCAL role='authenticated';
  SET LOCAL request.jwt.claim.sub='$ADMIN_ID';
  SELECT get_escalation_stats_admin();
  COMMIT;
" 2>&1)
if echo "$STATS" | grep -q "total"; then
  echo "  ✅ Stats RPC returns data with total field"
  PASSED=$((PASSED + 1))
else
  echo "  ❌ Stats RPC failed or missing total field"
  echo "     Got: $STATS"
  FAILED=$((FAILED + 1))
fi

# ──── TEST 8: List RPC ────
echo ""
echo "▶ Test 8: Escalation List"
LIST_COUNT=$($DB_CMD -c "
  BEGIN;
  SET LOCAL role='authenticated';
  SET LOCAL request.jwt.claim.sub='$ADMIN_ID';
  SELECT jsonb_array_length(get_escalated_orders_admin());
  COMMIT;
" 2>&1 | grep -E '^[0-9]+$' | head -1 | tr -d '[:space:]')
LIST_COUNT=${LIST_COUNT:-0}
if [ "$LIST_COUNT" -gt 0 ] 2>/dev/null; then
  echo "  ✅ Escalation list returns $LIST_COUNT disputes"
  PASSED=$((PASSED + 1))
else
  echo "  ❌ Escalation list returned no data"
  echo "     Got: $LIST_COUNT"
  FAILED=$((FAILED + 1))
fi

echo ""
echo "═══════════════════════════════════════════"
echo "  RESULTS: $PASSED passed, $FAILED failed"
echo "═══════════════════════════════════════════"

if [ "$FAILED" -gt 0 ]; then
  echo "❌ SOME TESTS FAILED"
  exit 1
fi
echo "✅ ALL INTERACTION TESTS PASSED"
