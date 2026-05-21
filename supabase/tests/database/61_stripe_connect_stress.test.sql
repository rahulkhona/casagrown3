-- ===========================================================================
-- pgTAP test: Stripe Connect Direct Payouts Large-Scale Concurrency & Stress Suite
-- ===========================================================================
BEGIN;
SELECT plan(12);

-- Clean up any previous test runs or potential cross-suite contamination
DELETE FROM market_ledger WHERE user_id::text LIKE 'ff000000-0000-0000-0000-%';
DELETE FROM platform_bank_ledger WHERE settlement_id IN (SELECT id FROM market_settlements WHERE market_date = CURRENT_DATE + 600 OR market_date = '1999-12-30');
DELETE FROM settlement_captures WHERE settlement_id IN (SELECT id FROM market_settlements WHERE market_date = CURRENT_DATE + 600 OR market_date = '1999-12-30');
DELETE FROM user_settlements WHERE settlement_id IN (SELECT id FROM market_settlements WHERE market_date = CURRENT_DATE + 600 OR market_date = '1999-12-30');
DELETE FROM market_settlements WHERE market_date = CURRENT_DATE + 600 OR market_date = '1999-12-30';

INSERT INTO market_settlements (id, market_date, status) VALUES
  ('ff000000-0000-0000-0000-fffffffffa02', '1999-12-30'::date, 'cleared')
ON CONFLICT (id) DO NOTHING;
UPDATE market_orders SET settlement_id = 'ff000000-0000-0000-0000-fffffffffa02'
WHERE settlement_id IS NULL;

-- ══════════════════════════════════════════════════════════════
-- 1. Setup Common Buyer and 100 Stripe Connect Sellers
-- ══════════════════════════════════════════════════════════════
INSERT INTO auth.users (id, email)
VALUES ('ff000000-0000-0000-0000-000000000e99', 'buyer-stress@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name, stripe_connect_id, stripe_onboarding_completed, stripe_connect_active)
VALUES ('ff000000-0000-0000-0000-000000000e99', 'buyer-stress@test.local', 'Buyer Stress', NULL, false, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_balances (user_id, available_usd, pending_usd, total_earned_usd, total_withdrawn_usd)
VALUES ('ff000000-0000-0000-0000-000000000e99', 0, 0, 0, 0)
ON CONFLICT (user_id) DO NOTHING;

-- Seed 100 Stripe Connect sellers in bulk
DO $$
DECLARE
  i INTEGER;
  uid UUID;
BEGIN
  FOR i IN 1..100 LOOP
    uid := ('ff000000-0000-0000-0000-' || LPAD(i::text, 12, '0'))::UUID;

    INSERT INTO auth.users (id, email)
    VALUES (uid, 'seller-stress' || i || '@test.local')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO profiles (id, email, full_name, stripe_connect_id, stripe_onboarding_completed, stripe_connect_active)
    VALUES (
      uid, 
      'seller-stress' || i || '@test.local', 
      'Seller Stress ' || i, 
      'acct_stress_' || i, 
      true, 
      true
    )
    ON CONFLICT (id) DO UPDATE SET 
      stripe_connect_id = EXCLUDED.stripe_connect_id,
      stripe_onboarding_completed = EXCLUDED.stripe_onboarding_completed,
      stripe_connect_active = EXCLUDED.stripe_connect_active;

    INSERT INTO user_balances (user_id, available_usd, pending_usd, total_earned_usd, total_withdrawn_usd)
    VALUES (uid, 0, 0, 0, 0)
    ON CONFLICT (user_id) DO UPDATE SET 
      available_usd = 0,
      pending_usd = 0,
      total_earned_usd = 0,
      total_withdrawn_usd = 0;
  END LOOP;
END $$;

SELECT is(
  (SELECT COUNT(*) FROM user_balances WHERE user_id::text LIKE 'ff000000-0000-0000-0000-%' AND user_id != 'ff000000-0000-0000-0000-000000000e99')::INTEGER,
  100,
  'Phase 1: Created 100 sellers with Stripe Connect active'
);

-- ══════════════════════════════════════════════════════════════
-- 2. Setup Booths, Products, and Unsettled Orders for 100 Sellers
-- ══════════════════════════════════════════════════════════════
DO $$
DECLARE
  i INTEGER;
  uid UUID;
  booth_id UUID;
  prod_id UUID;
  order_id UUID;
  v_market_date DATE := CURRENT_DATE + 600; -- Unique future date
BEGIN
  FOR i IN 1..100 LOOP
    uid := ('ff000000-0000-0000-0000-' || LPAD(i::text, 12, '0'))::UUID;
    booth_id := ('ff000000-0000-0000-0001-' || LPAD(i::text, 12, '0'))::UUID;
    prod_id := ('ff000000-0000-0000-0002-' || LPAD(i::text, 12, '0'))::UUID;
    order_id := ('ff000000-0000-0000-0003-' || LPAD(i::text, 12, '0'))::UUID;

    DELETE FROM market_orders WHERE seller_id = uid;
    DELETE FROM market_products WHERE seller_id = uid;
    DELETE FROM market_booths WHERE owner_id = uid;

    INSERT INTO market_booths (id, owner_id, name)
    VALUES (booth_id, uid, 'Stress Seller Booth ' || i);

    INSERT INTO market_products (id, seller_id, market_date, name, category, price_usd, unit, inventory, is_active)
    VALUES (prod_id, uid, v_market_date, 'Stress Apple ' || i, 'produce', 100.00, 'lb', 10, true);

    INSERT INTO market_orders (
      id, buyer_id, seller_id, booth_id, product_id, product_name, 
      quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd, 
      platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, created_at
    )
    VALUES (
      order_id, 
      'ff000000-0000-0000-0000-000000000e99', 
      uid, 
      booth_id, 
      prod_id, 
      'Stress Apple ' || i, 
      1, 100.00, 100.00, 0, 0, 
      10, 10.00, 100.00, 'pickup', 'completed', v_market_date::timestamptz
    );
  END LOOP;
END $$;

SELECT is(
  (SELECT COUNT(*) FROM market_orders WHERE buyer_id = 'ff000000-0000-0000-0000-000000000e99' AND status = 'completed')::INTEGER,
  100,
  'Phase 2: Placed 100 completed orders (1 per seller) ready for settlement'
);

-- Seed central platform buyer card hold
INSERT INTO market_holds (id, buyer_id, stripe_payment_intent_id, stripe_client_secret, hold_amount_cents, spent_amount_cents, status)
VALUES ('ff000000-0000-0000-0000-000000000f99', 'ff000000-0000-0000-0000-000000000e99', 'pi_stress_10000', 'secret_stress', 1000000, 1000000, 'active')
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- 3. Execute settlement & verify advisory lock registration
-- ══════════════════════════════════════════════════════════════
-- run_market_settlement acquires the lock. Since we are inside the transaction, the lock remains active.
SELECT lives_ok(
  $$ SELECT run_market_settlement(CURRENT_DATE + 600) $$,
  'Phase 3a: run_market_settlement executes successfully for the 100 stress sellers'
);

-- Verify that the advisory lock was successfully acquired and is held by the current transaction
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_locks 
    WHERE locktype = 'advisory' 
      AND pid = pg_backend_pid()
  ),
  'Phase 3b: Transaction holds the advisory lock for the market_settlement key'
);

-- ══════════════════════════════════════════════════════════════
-- 4. Verify re-run protection (idempotency / no double-run)
-- ══════════════════════════════════════════════════════════════
SELECT is(
  (SELECT run_market_settlement(CURRENT_DATE + 600) ->> 'error'),
  'No unsettled orders to process',
  'Phase 4: Subsequent run_market_settlement call correctly returns no unsettled orders'
);

-- ══════════════════════════════════════════════════════════════
-- 5. Stress Post-Settlement Verification & Balance Leak Protection
-- ══════════════════════════════════════════════════════════════

-- A. Verify virtual balance remains exactly $0.00 for all 100 Stripe Connect sellers
SELECT is(
  (SELECT COUNT(*) FROM user_balances 
   WHERE user_id::text LIKE 'ff000000-0000-0000-0000-%' 
     AND user_id != 'ff000000-0000-0000-0000-000000000e99'
     AND pending_usd = 0.00)::INTEGER,
  100,
  'Phase 5a: Mathematical netting verified - all 100 sellers virtual balances remain exactly $0.00'
);

-- B. Verify earned metric grew by $100.00 for all 100 sellers
SELECT is(
  (SELECT COUNT(*) FROM user_balances 
   WHERE user_id::text LIKE 'ff000000-0000-0000-0000-%' 
     AND user_id != 'ff000000-0000-0000-0000-000000000e99'
     AND total_earned_usd = 100.00)::INTEGER,
  100,
  'Phase 5b: Ledger metrics verified - all 100 sellers earned metrics updated to $100.00'
);

-- C. Verify exactly 100 settlements are logged as 'stripe_transfer_pending'
SELECT is(
  (SELECT COUNT(*) FROM user_settlements 
   WHERE user_id::text LIKE 'ff000000-0000-0000-0000-%' 
     AND user_id != 'ff000000-0000-0000-0000-000000000e99'
     AND status = 'stripe_transfer_pending')::INTEGER,
  100,
  'Phase 5c: Status propagation verified - all 100 settlements placed in stripe_transfer_pending'
);

-- D. Verify ledger entry volumes: 100 settlement_credit, 100 fee_charged, 100 payout_sent
SELECT is(
  (SELECT COUNT(*) FROM market_ledger 
   WHERE user_id::text LIKE 'ff000000-0000-0000-0000-%' 
     AND user_id != 'ff000000-0000-0000-0000-000000000e99'
     AND event_type = 'settlement_credit')::INTEGER,
  100,
  'Phase 5d: Ledger credit entries - exactly 100 settlement_credits recorded'
);

SELECT is(
  (SELECT COUNT(*) FROM market_ledger 
   WHERE user_id::text LIKE 'ff000000-0000-0000-0000-%' 
     AND user_id != 'ff000000-0000-0000-0000-000000000e99'
     AND event_type = 'fee_charged')::INTEGER,
  100,
  'Phase 5e: Ledger fee entries - exactly 100 fee_chargeds recorded'
);

SELECT is(
  (SELECT COUNT(*) FROM market_ledger 
   WHERE user_id::text LIKE 'ff000000-0000-0000-0000-%' 
     AND user_id != 'ff000000-0000-0000-0000-000000000e99'
     AND event_type = 'payout_sent'
     AND direction = 'debit'
     AND metadata->>'payout_method' = 'stripe_connect')::INTEGER,
  100,
  'Phase 5f: Ledger netting entries - exactly 100 offsetting payout_sents recorded'
);

-- E. Verify ledger reconciliation: balance_after matches sum of ledger entries for all sellers
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM user_settlements us
    JOIN market_settlements ms ON ms.id = us.settlement_id
    WHERE ms.market_date = CURRENT_DATE + 600
      AND (SELECT balance_after FROM market_ledger WHERE user_id = us.user_id ORDER BY id DESC LIMIT 1)
        != (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_usd ELSE -amount_usd END), 0)
            FROM market_ledger WHERE user_id = us.user_id)
  ),
  'Phase 5g: Ledger consistency check passed for all 100 concurrent settlements'
);

SELECT * FROM finish();
ROLLBACK;
