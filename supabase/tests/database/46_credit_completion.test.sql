BEGIN;

SELECT plan(13);

-- Seed users
INSERT INTO auth.users (id, email) VALUES
  ('cc400001-0000-0000-0000-000000000001', 'buyer@test.com'),
  ('cc400001-0000-0000-0000-000000000002', 'seller@test.com');

INSERT INTO profiles (id, full_name, email) VALUES
  ('cc400001-0000-0000-0000-000000000001', 'Buyer CC', 'buyer@test.com'),
  ('cc400002-0000-0000-0000-000000000002', 'Seller CC', 'seller@test.com');

-- Create a booth
INSERT INTO market_booths (id, owner_id) VALUES
  ('cc400001-b000-0000-0000-000000000001', 'cc400001-0000-0000-0000-000000000002');

-- Seed product
INSERT INTO market_products (id, owner_id, booth_id, default_price_usd) VALUES
  ('cc400001-p000-0000-0000-000000000001', 'cc400001-0000-0000-0000-000000000002', 'cc400001-b000-0000-0000-000000000001', 10.00);


-- ──────────────────────────────────────────────────────────
-- TEST SELLER ADVANCED CREDIT (Platform Fee WAIVER + Dispute Math)
-- ──────────────────────────────────────────────────────────

-- Give Seller a 100% Platform Fee Apology Credit (Maxes out at 10% of subtotal)
INSERT INTO user_credits (id, user_id, amount_usd, remaining_usd, credit_type, max_pct_per_txn, source)
VALUES ('cc400001-c000-0000-0000-000000000001', 'cc400001-0000-0000-0000-000000000002', 100.00, 100.00, 'platform_fee', 10, 'escalation_resolution');

-- Create an order for $50.00 (with assumed $5.00 platform fee)
INSERT INTO market_orders (id, buyer_id, seller_id, subtotal_usd, total_usd, status, platform_fee_pct, platform_fee_usd)
VALUES ('cc400001-o000-0000-0000-000000000001', 'cc400001-0000-0000-0000-000000000001', 'cc400001-0000-0000-0000-000000000002', 50.00, 50.00, 'delivered', 10, 5.00);

-- Provide a Partial Refund / Discount via Dispute ($10)
INSERT INTO order_disputes (order_id, initiated_by, refund_amount_usd, status)
VALUES ('cc400001-o000-0000-0000-000000000001', 'cc400001-0000-0000-0000-000000000002', 10.00, 'staff_resolved');

-- Complete the order (which should calculate subtotal $40, recalculate fee to $4.00, and consume $4.00 of credit)
SELECT _complete_market_order_with_receipt('cc400001-o000-0000-0000-000000000001');

SELECT results_eq(
  $$SELECT platform_fee_usd::numeric FROM market_orders WHERE id = 'cc400001-o000-0000-0000-000000000001'$$,
  ARRAY[0.00::numeric],
  'Platform fee perfectly wiped out after recalculating scaled fee from dispute action'
);

SELECT results_eq(
  $$SELECT remaining_usd::numeric FROM user_credits WHERE id = 'cc400001-c000-0000-0000-000000000001'$$,
  ARRAY[96.00::numeric],
  'Accurately consumed only $4.00 (10% of new $40 subtotal) of Seller Credit'
);


-- ──────────────────────────────────────────────────────────
-- TEST BUYER CREDIT NETTING OFFSET (Stripe Math)
-- ──────────────────────────────────────────────────────────

-- Give Buyer a $20 Apology Credit (Maxes out at 100% of order)
INSERT INTO user_credits (id, user_id, amount_usd, remaining_usd, credit_type, max_pct_per_txn, source)
VALUES ('cc400001-c000-0000-0000-000000000002', 'cc400001-0000-0000-0000-000000000001', 20.00, 20.00, 'purchase', 100, 'escalation_resolution');

-- Give Buyer 0 balance to isolate credit netting behavior
INSERT INTO user_balances (user_id, pending_usd, total_earned_usd, held_balance_usd, total_spent_usd)
VALUES ('cc400001-0000-0000-0000-000000000001', 0, 0, 0, 0)
ON CONFLICT (user_id) DO UPDATE SET held_balance_usd = 0;

-- Create $35 Order placed via Stripe
INSERT INTO market_orders (id, buyer_id, seller_id, subtotal_usd, total_usd, status)
VALUES ('cc400001-o000-0000-0000-000000000002', 'cc400001-0000-0000-0000-000000000001', 'cc400001-0000-0000-0000-000000000002', 35.00, 35.00, 'delivered');

-- Hold created by Stripe for the full $35 (3500 cents)
INSERT INTO market_holds (id, buyer_id, hold_amount_cents, status)
VALUES ('cc400001-h000-0000-0000-000000000001', 'cc400001-0000-0000-0000-000000000001', 3500, 'active');

-- Complete the order (Should consume the $20 Buyer credit, leaving $15 required from Stripe)
SELECT _complete_market_order_with_receipt('cc400001-o000-0000-0000-000000000002');

SELECT results_eq(
  $$SELECT credit_applied_usd::numeric FROM market_orders WHERE id = 'cc400001-o000-0000-0000-000000000002'$$,
  ARRAY[20.00::numeric],
  'Order logically applied the $20 Buyer purchase credit at completion phase'
);

SELECT results_eq(
  $$SELECT remaining_usd::numeric FROM user_credits WHERE id = 'cc400001-c000-0000-0000-000000000002'$$,
  ARRAY[0.00::numeric],
  'Buyer credit bucket was successfully emptied'
);

-- Run the settlement engine
SELECT run_market_settlement();

-- Validate that Netting correctly isolated the Credit from the Stripe Hold math
SELECT results_eq(
  $$SELECT capture_amount_usd::numeric FROM settlement_captures WHERE hold_id = 'cc400001-h000-0000-0000-000000000001'$$,
  ARRAY[15.00::numeric],
  'Netting engine correctly requested Stripe capture of $15.00 (Total ($35) - Credit Applied ($20))'
);

SELECT results_eq(
  $$SELECT release_amount_usd::numeric FROM settlement_captures WHERE hold_id = 'cc400001-h000-0000-0000-000000000001'$$,
  ARRAY[20.00::numeric],
  'Netting engine correctly released the remaining $20.00 back to the Buyer credit card over-authorization'
);

ROLLBACK;
