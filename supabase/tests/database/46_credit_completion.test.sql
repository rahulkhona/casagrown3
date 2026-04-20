-- ============================================================
-- Test 46: Credit Completion & Settlement Netting
-- Tests: seller fee credit waiver, buyer purchase credit,
--        settlement netting with credit offsets
-- ============================================================
BEGIN;

SELECT plan(13);

-- ──────────────────────────────────────────────────────────
-- SETUP: Create isolated test users
-- ──────────────────────────────────────────────────────────

-- Seller + Buyer1 (for seller fee credit test)
-- Buyer2 (for buyer purchase credit + netting test)
INSERT INTO auth.users (id, email) VALUES
  ('cc460001-0000-0000-0000-000000000001', 'buyer1_46@test.com'),
  ('cc460001-0000-0000-0000-000000000002', 'seller_46@test.com'),
  ('cc460001-0000-0000-0000-000000000003', 'buyer2_46@test.com');

UPDATE profiles SET full_name = 'Buyer One', email = 'buyer1_46@test.com'
  WHERE id = 'cc460001-0000-0000-0000-000000000001';
UPDATE profiles SET full_name = 'Seller CC', email = 'seller_46@test.com'
  WHERE id = 'cc460001-0000-0000-0000-000000000002';
UPDATE profiles SET full_name = 'Buyer Two', email = 'buyer2_46@test.com'
  WHERE id = 'cc460001-0000-0000-0000-000000000003';

-- Seed product
INSERT INTO market_products (id, seller_id, name, price_usd, market_date) VALUES
  ('cc460001-a100-0000-0000-000000000001', 'cc460001-0000-0000-0000-000000000002',
   'Test Product', 10.00, CURRENT_DATE);


-- ──────────────────────────────────────────────────────────
-- TEST 1-2: SELLER PLATFORM_FEE CREDIT WAIVER
--
-- Business logic:
--   Seller has $100 platform_fee credit (max 10% of subtotal per txn)
--   Order: $50 subtotal, disputed $10 → $40 final subtotal
--   Fee rate: 10% (0.10) → $4.00 fee
--   Credit cap: 10% of $40 = $4.00
--   Credit consumed: min($100, $4.00, $4.00) = $4.00
--   Remaining fee: $0.00
--   Remaining credit: $100 - $4 = $96.00
-- ──────────────────────────────────────────────────────────

-- Give Seller a $100 Platform Fee credit (max 10% of subtotal per txn)
INSERT INTO user_credits (id, user_id, amount_usd, remaining_usd, credit_type, max_pct_per_txn, source)
VALUES ('cc460001-c000-0000-0000-000000000001', 'cc460001-0000-0000-0000-000000000002',
  100.00, 100.00, 'platform_fee', 10, 'escalation_resolution');

-- Create $50 order (Buyer1 → Seller)
INSERT INTO market_orders (id, buyer_id, seller_id, subtotal_usd, total_usd, status,
  platform_fee_pct, platform_fee_usd,
  booth_id, product_id, product_name, quantity, unit_price_usd, fulfillment_type)
VALUES ('cc460001-aa00-0000-0000-000000000001',
  'cc460001-0000-0000-0000-000000000001', 'cc460001-0000-0000-0000-000000000002',
  50.00, 50.00, 'delivered', 10, 5.00,
  (SELECT id FROM market_booths WHERE owner_id = 'cc460001-0000-0000-0000-000000000002'),
  'cc460001-a100-0000-0000-000000000001', 'Test Product', 5, 10.00, 'delivery');

-- Dispute: $10 partial refund
INSERT INTO order_disputes (order_id, initiated_by, refund_amount_usd, status, reason)
VALUES ('cc460001-aa00-0000-0000-000000000001', 'cc460001-0000-0000-0000-000000000002',
  10.00, 'staff_resolved', 'Partial refund for quality issue');

-- Complete the order
SELECT _complete_market_order_with_receipt('cc460001-aa00-0000-0000-000000000001');

SELECT results_eq(
  $$SELECT platform_fee_usd::numeric FROM market_orders WHERE id = 'cc460001-aa00-0000-0000-000000000001'$$,
  ARRAY[0.00::numeric],
  'Platform fee wiped out: $4 fee fully covered by seller credit'
);

SELECT results_eq(
  $$SELECT remaining_usd::numeric FROM user_credits WHERE id = 'cc460001-c000-0000-0000-000000000001'$$,
  ARRAY[96.00::numeric],
  'Seller credit consumed $4.00 (10% of $40 adjusted subtotal), $96 remaining'
);


-- ──────────────────────────────────────────────────────────
-- TEST 3-4: BUYER PURCHASE CREDIT APPLICATION
--
-- Business logic:
--   Buyer2 has $20 purchase credit (max 100% of order per txn)
--   Order: $35 total
--   Credit applied: min($20, $35, $35) = $20.00
--   Remaining credit: $0.00
-- ──────────────────────────────────────────────────────────

-- Give Buyer2 a $20 purchase credit (100% cap)
INSERT INTO user_credits (id, user_id, amount_usd, remaining_usd, credit_type, max_pct_per_txn, source)
VALUES ('cc460001-c000-0000-0000-000000000002', 'cc460001-0000-0000-0000-000000000003',
  20.00, 20.00, 'purchase', 100, 'escalation_resolution');

-- Give Buyer2 zero balance to isolate credit netting
INSERT INTO user_balances (user_id, pending_usd, total_earned_usd, held_balance_usd, total_spent_usd)
VALUES ('cc460001-0000-0000-0000-000000000003', 0, 0, 0, 0)
ON CONFLICT (user_id) DO UPDATE SET held_balance_usd = 0;

-- Create $35 order (Buyer2 → Seller)
INSERT INTO market_orders (id, buyer_id, seller_id, subtotal_usd, total_usd, status,
  booth_id, product_id, product_name, quantity, unit_price_usd, fulfillment_type)
VALUES ('cc460001-aa00-0000-0000-000000000002',
  'cc460001-0000-0000-0000-000000000003', 'cc460001-0000-0000-0000-000000000002',
  35.00, 35.00, 'delivered',
  (SELECT id FROM market_booths WHERE owner_id = 'cc460001-0000-0000-0000-000000000002'),
  'cc460001-a100-0000-0000-000000000001', 'Test Product', 3, 11.67, 'delivery');

-- Stripe hold for $35 (Buyer2)
INSERT INTO market_holds (id, buyer_id, hold_amount_cents, status, stripe_payment_intent_id, stripe_client_secret)
VALUES ('cc460001-aaa0-0000-0000-000000000001', 'cc460001-0000-0000-0000-000000000003',
  3500, 'active', 'pi_test_cc46_001', 'cs_test_cc46_001');

-- Complete the order (consumes $20 credit)
SELECT _complete_market_order_with_receipt('cc460001-aa00-0000-0000-000000000002');

SELECT results_eq(
  $$SELECT credit_applied_usd::numeric FROM market_orders WHERE id = 'cc460001-aa00-0000-0000-000000000002'$$,
  ARRAY[20.00::numeric],
  'Buyer2 $20 purchase credit applied to $35 order'
);

SELECT results_eq(
  $$SELECT remaining_usd::numeric FROM user_credits WHERE id = 'cc460001-c000-0000-0000-000000000002'$$,
  ARRAY[0.00::numeric],
  'Buyer2 credit fully consumed'
);


-- ──────────────────────────────────────────────────────────
-- TEST 5-6: SETTLEMENT NETTING WITH CREDIT OFFSET
--
-- Business logic:
--   Buyer2 total_purchases = $35
--   Buyer2 credit_applied = $20
--   card_purchases = $35 - $0 balance - $20 credit = $15
--   Hold = $35 → capture $15, release $20
-- ──────────────────────────────────────────────────────────

SELECT run_market_settlement();

SELECT results_eq(
  $$SELECT capture_amount_usd::numeric FROM settlement_captures WHERE hold_id = 'cc460001-aaa0-0000-0000-000000000001'$$,
  ARRAY[15.00::numeric],
  'Netting captures only $15 (total $35 minus $20 credit)'
);

SELECT results_eq(
  $$SELECT release_amount_usd::numeric FROM settlement_captures WHERE hold_id = 'cc460001-aaa0-0000-0000-000000000001'$$,
  ARRAY[20.00::numeric],
  'Netting releases $20 back to Buyer2 card (credit offset)'
);


-- ──────────────────────────────────────────────────────────
-- TEST 7-8: CREDIT USAGE LOG VERIFICATION
-- ──────────────────────────────────────────────────────────

SELECT results_eq(
  $$SELECT COUNT(*)::int FROM credit_usage_log WHERE order_id = 'cc460001-aa00-0000-0000-000000000001'$$,
  ARRAY[1],
  'Seller credit usage log has 1 entry for fee waiver order'
);

SELECT results_eq(
  $$SELECT COUNT(*)::int FROM credit_usage_log WHERE order_id = 'cc460001-aa00-0000-0000-000000000002' AND credit_id = 'cc460001-c000-0000-0000-000000000002'$$,
  ARRAY[1],
  'Buyer credit usage log has 1 entry for purchase credit on netting order'
);


-- ──────────────────────────────────────────────────────────
-- TEST 9-10: DIGITAL RECEIPT GENERATION
-- ──────────────────────────────────────────────────────────

SELECT results_eq(
  $$SELECT COUNT(*)::int FROM digital_receipts WHERE order_id = 'cc460001-aa00-0000-0000-000000000001'$$,
  ARRAY[1],
  'Seller fee waiver order has a digital receipt'
);

SELECT results_eq(
  $$SELECT COUNT(*)::int FROM digital_receipts WHERE order_id = 'cc460001-aa00-0000-0000-000000000002'$$,
  ARRAY[1],
  'Buyer credit order has a digital receipt'
);


-- ──────────────────────────────────────────────────────────
-- TEST 11: RECEIPT CONTAINS CREDIT INFO
-- ──────────────────────────────────────────────────────────

SELECT results_eq(
  $$SELECT (buyer_receipt->>'credit_applied')::numeric FROM digital_receipts WHERE order_id = 'cc460001-aa00-0000-0000-000000000002'$$,
  ARRAY[20.00::numeric],
  'Buyer receipt records $20 credit applied'
);


-- ──────────────────────────────────────────────────────────
-- TEST 12-13: CREDIT % CAP ENFORCEMENT
--
-- Business logic:
--   Buyer1 has $100 credit with 10% cap
--   Order: $50 → max credit = $5 (10% of $50)
--   Applied: $5, remaining: $95
-- ──────────────────────────────────────────────────────────

INSERT INTO user_credits (user_id, amount_usd, remaining_usd, credit_type,
  max_pct_per_txn, source, reason, granted_by)
VALUES ('cc460001-0000-0000-0000-000000000001',
  100.00, 100.00, 'purchase', 10,
  'escalation_resolution', 'Test large credit',
  'cc460001-0000-0000-0000-000000000002');

INSERT INTO market_orders (id, buyer_id, seller_id, subtotal_usd, total_usd, status,
  platform_fee_pct, platform_fee_usd,
  booth_id, product_id, product_name, quantity, unit_price_usd, fulfillment_type)
VALUES ('cc460001-aa00-0000-0000-000000000003',
  'cc460001-0000-0000-0000-000000000001', 'cc460001-0000-0000-0000-000000000002',
  50.00, 50.00, 'delivered', 10, 5.00,
  (SELECT id FROM market_booths WHERE owner_id = 'cc460001-0000-0000-0000-000000000002'),
  'cc460001-a100-0000-0000-000000000001', 'Test Product', 5, 10.00, 'delivery');

SELECT _complete_market_order_with_receipt('cc460001-aa00-0000-0000-000000000003');

SELECT results_eq(
  $$SELECT credit_applied_usd::numeric FROM market_orders WHERE id = 'cc460001-aa00-0000-0000-000000000003'$$,
  ARRAY[5.00::numeric],
  '10% cap limits $100 credit to $5.00 on $50 order'
);

SELECT results_eq(
  $$SELECT remaining_usd::numeric FROM user_credits
    WHERE user_id = 'cc460001-0000-0000-0000-000000000001'
      AND source = 'escalation_resolution'$$,
  ARRAY[95.00::numeric],
  'Only $5 consumed from $100 credit due to 10% cap'
);


ROLLBACK;
