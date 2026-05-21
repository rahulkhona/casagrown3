-- ===========================================================================
-- pgTAP test: Stripe Connect Cashflow & Ledger Netting Suite
-- ===========================================================================
BEGIN;
SELECT plan(15);

-- Clean up any previous test runs or potential cross-suite contamination
DELETE FROM market_ledger WHERE user_id::text LIKE 'ff000000-0000-0000-0000-%';
DELETE FROM platform_bank_ledger WHERE settlement_id IN (SELECT id FROM market_settlements WHERE market_date = CURRENT_DATE + 500 OR market_date = '1999-12-31');
DELETE FROM settlement_captures WHERE settlement_id IN (SELECT id FROM market_settlements WHERE market_date = CURRENT_DATE + 500 OR market_date = '1999-12-31');
DELETE FROM user_settlements WHERE settlement_id IN (SELECT id FROM market_settlements WHERE market_date = CURRENT_DATE + 500 OR market_date = '1999-12-31');
DELETE FROM market_settlements WHERE market_date = CURRENT_DATE + 500 OR market_date = '1999-12-31';

INSERT INTO market_settlements (id, market_date, status) VALUES
  ('ff000000-0000-0000-0000-fffffffffa01', '1999-12-31'::date, 'cleared')
ON CONFLICT (id) DO NOTHING;
UPDATE market_orders SET settlement_id = 'ff000000-0000-0000-0000-fffffffffa01'
WHERE settlement_id IS NULL;

-- ══════════════════════════════════════════════════════════════
-- Setup Test Users
-- ══════════════════════════════════════════════════════════════
INSERT INTO auth.users (id, email)
VALUES
  ('ff000000-0000-0000-0000-000000000a01', 'seller-a-legacy@test.local'),
  ('ff000000-0000-0000-0000-000000000b01', 'seller-b-stripe@test.local'),
  ('ff000000-0000-0000-0000-000000000c01', 'seller-c-stripe@test.local'),
  ('ff000000-0000-0000-0000-000000000d01', 'buyer-split@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name, stripe_connect_id, stripe_onboarding_completed, stripe_connect_active)
VALUES
  ('ff000000-0000-0000-0000-000000000a01', 'seller-a-legacy@test.local', 'Seller A Legacy', NULL, false, false),
  ('ff000000-0000-0000-0000-000000000b01', 'seller-b-stripe@test.local', 'Seller B Stripe', 'acct_seller_b', true, true),
  ('ff000000-0000-0000-0000-000000000c01', 'seller-c-stripe@test.local', 'Seller C Stripe', 'acct_seller_c', true, true),
  ('ff000000-0000-0000-0000-000000000d01', 'buyer-split@test.local', 'Buyer Split', NULL, false, false)
ON CONFLICT (id) DO UPDATE SET
  stripe_connect_id = EXCLUDED.stripe_connect_id,
  stripe_onboarding_completed = EXCLUDED.stripe_onboarding_completed,
  stripe_connect_active = EXCLUDED.stripe_connect_active;

-- Setup zeroed balances
INSERT INTO user_balances (user_id, available_usd, pending_usd, total_earned_usd, total_withdrawn_usd)
VALUES
  ('ff000000-0000-0000-0000-000000000a01', 0, 0, 0, 0),
  ('ff000000-0000-0000-0000-000000000b01', 0, 0, 0, 0),
  ('ff000000-0000-0000-0000-000000000c01', 0, 0, 0, 0),
  ('ff000000-0000-0000-0000-000000000d01', 0, 0, 0, 0)
ON CONFLICT (user_id) DO UPDATE SET
  available_usd = 0,
  pending_usd = 0,
  total_earned_usd = 0,
  total_withdrawn_usd = 0;

-- ══════════════════════════════════════════════════════════════
-- Setup Booths, Products, and Split Carts
-- ══════════════════════════════════════════════════════════════
DELETE FROM market_booths WHERE owner_id IN ('ff000000-0000-0000-0000-000000000a01', 'ff000000-0000-0000-0000-000000000b01', 'ff000000-0000-0000-0000-000000000c01');

INSERT INTO market_booths (id, owner_id, name)
VALUES
  ('ff000000-0000-0000-0000-000000001a01', 'ff000000-0000-0000-0000-000000000a01', 'Seller A Legacy Booth'),
  ('ff000000-0000-0000-0000-000000001b01', 'ff000000-0000-0000-0000-000000000b01', 'Seller B Stripe Booth'),
  ('ff000000-0000-0000-0000-000000001c01', 'ff000000-0000-0000-0000-000000000c01', 'Seller C Stripe Booth')
ON CONFLICT (id) DO NOTHING;

INSERT INTO market_products (id, seller_id, market_date, name, category, price_usd, unit, inventory, is_active)
VALUES
  ('ff000000-0000-0000-0000-000000002a01', 'ff000000-0000-0000-0000-000000000a01', CURRENT_DATE + 500, 'A apples', 'produce', 30.00, 'lb', 10, true),
  ('ff000000-0000-0000-0000-000000002b01', 'ff000000-0000-0000-0000-000000000b01', CURRENT_DATE + 500, 'B berries', 'produce', 40.00, 'lb', 10, true),
  ('ff000000-0000-0000-0000-000000002c01', 'ff000000-0000-0000-0000-000000000c01', CURRENT_DATE + 500, 'C cherries', 'produce', 50.00, 'lb', 10, true)
ON CONFLICT (id) DO NOTHING;

-- Create orders to simulate a single buyer shopping from multiple sellers
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name, quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd, platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, created_at)
VALUES
  ('ff000000-0000-0000-0000-000000003a01', 'ff000000-0000-0000-0000-000000000d01', 'ff000000-0000-0000-0000-000000000a01', 'ff000000-0000-0000-0000-000000001a01', 'ff000000-0000-0000-0000-000000002a01', 'A apples', 1, 30.00, 30.00, 0, 0, 10, 3.00, 30.00, 'pickup', 'completed', (CURRENT_DATE + 500)::timestamptz),
  ('ff000000-0000-0000-0000-000000003b01', 'ff000000-0000-0000-0000-000000000d01', 'ff000000-0000-0000-0000-000000000b01', 'ff000000-0000-0000-0000-000000001b01', 'ff000000-0000-0000-0000-000000002b01', 'B berries', 1, 40.00, 40.00, 0, 0, 10, 4.00, 40.00, 'pickup', 'completed', (CURRENT_DATE + 500)::timestamptz),
  ('ff000000-0000-0000-0000-000000003c01', 'ff000000-0000-0000-0000-000000000d01', 'ff000000-0000-0000-0000-000000000c01', 'ff000000-0000-0000-0000-000000001c01', 'ff000000-0000-0000-0000-000000002c01', 'C cherries', 1, 50.00, 50.00, 0, 0, 10, 5.00, 50.00, 'pickup', 'completed', (CURRENT_DATE + 500)::timestamptz)
ON CONFLICT (id) DO NOTHING;

-- Create a single combined hold representing card authorization on central platform account
INSERT INTO market_holds (id, buyer_id, stripe_payment_intent_id, stripe_client_secret, hold_amount_cents, spent_amount_cents, status)
VALUES ('ff000000-0000-0000-0000-000000000e01', 'ff000000-0000-0000-0000-000000000d01', 'pi_split_buyer_120', 'secret_split', 12000, 12000, 'active')
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- Run Market Settlement
-- ══════════════════════════════════════════════════════════════
SELECT lives_ok(
  $$SELECT run_market_settlement(CURRENT_DATE + 500)$$,
  'Settlement runs successfully for multi-seller checkout date'
);

-- 1. Status Assertions on User Settlements
SELECT is(
  (SELECT status FROM user_settlements 
   WHERE settlement_id = (SELECT settlement_id FROM market_orders WHERE id = 'ff000000-0000-0000-0000-000000003a01') 
     AND user_id = 'ff000000-0000-0000-0000-000000000a01'),
  'pending',
  'Seller A (Legacy): status is pending, clears into wallet'
);

SELECT is(
  (SELECT status FROM user_settlements 
   WHERE settlement_id = (SELECT settlement_id FROM market_orders WHERE id = 'ff000000-0000-0000-0000-000000003a01') 
     AND user_id = 'ff000000-0000-0000-0000-000000000b01'),
  'stripe_transfer_pending',
  'Seller B (Stripe): status is stripe_transfer_pending'
);

SELECT is(
  (SELECT status FROM user_settlements 
   WHERE settlement_id = (SELECT settlement_id FROM market_orders WHERE id = 'ff000000-0000-0000-0000-000000003a01') 
     AND user_id = 'ff000000-0000-0000-0000-000000000c01'),
  'stripe_transfer_pending',
  'Seller C (Stripe): status is stripe_transfer_pending'
);

-- 2. Balance Netting Assertions
-- Seller A (Legacy): net $27 credited to pending_usd
SELECT is(
  (SELECT pending_usd FROM user_balances WHERE user_id = 'ff000000-0000-0000-0000-000000000a01'),
  27.00::NUMERIC(10,2),
  'Seller A (Legacy): pending_usd credited with $27.00 net payout'
);

-- Seller B (Stripe Connect): net $36 nets to exactly $0.00 virtual balance
SELECT is(
  (SELECT pending_usd FROM user_balances WHERE user_id = 'ff000000-0000-0000-0000-000000000b01'),
  0.00::NUMERIC(10,2),
  'Seller B (Stripe): pending_usd is $0.00 (virtual balance netted to zero)'
);

-- Seller C (Stripe Connect): net $45 nets to exactly $0.00 virtual balance
SELECT is(
  (SELECT pending_usd FROM user_balances WHERE user_id = 'ff000000-0000-0000-0000-000000000c01'),
  0.00::NUMERIC(10,2),
  'Seller C (Stripe): pending_usd is $0.00 (virtual balance netted to zero)'
);

-- 3. Ledger Netting Offsetting Assertions
-- Seller B (Stripe) Ledger Details:
-- Verify Gross credit
SELECT ok(
  EXISTS(
    SELECT 1 FROM market_ledger 
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b01' 
      AND event_type = 'settlement_credit' 
      AND amount_usd = 40.00 
      AND direction = 'credit'
  ),
  'Seller B Ledger: contains gross credit of $40.00'
);

-- Verify Platform Fee debit
SELECT ok(
  EXISTS(
    SELECT 1 FROM market_ledger 
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b01' 
      AND event_type = 'fee_charged' 
      AND amount_usd = 4.00 
      AND direction = 'debit'
  ),
  'Seller B Ledger: contains platform fee debit of $4.00'
);

-- Verify Offsetting Net debit payout
SELECT ok(
  EXISTS(
    SELECT 1 FROM market_ledger 
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b01' 
      AND event_type = 'payout_sent' 
      AND amount_usd = 36.00 
      AND direction = 'debit'
      AND metadata->>'payout_method' = 'stripe_connect'
      AND metadata->>'stripe_connect_id' = 'acct_seller_b'
  ),
  'Seller B Ledger: contains offsetting payout_sent debit of $36.00 with Connect metadata'
);

-- Seller C (Stripe) Ledger Details:
-- Verify Offsetting Net debit payout
SELECT ok(
  EXISTS(
    SELECT 1 FROM market_ledger 
    WHERE user_id = 'ff000000-0000-0000-0000-000000000c01' 
      AND event_type = 'payout_sent' 
      AND amount_usd = 45.00 
      AND direction = 'debit'
      AND metadata->>'payout_method' = 'stripe_connect'
      AND metadata->>'stripe_connect_id' = 'acct_seller_c'
  ),
  'Seller C Ledger: contains offsetting payout_sent debit of $45.00 with Connect metadata'
);

-- Seller A (Legacy) Ledger Details:
-- Verify NO payout_sent netting entry exists (since they clear into virtual balance)
SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM market_ledger 
    WHERE user_id = 'ff000000-0000-0000-0000-000000000a01' 
      AND event_type = 'payout_sent'
  ),
  'Seller A Ledger: does NOT contain any payout_sent debit entries (wallet settlement)'
);

-- 4. Global Settlement Integrity Metrics
SELECT is(
  (SELECT total_captured_usd FROM market_settlements 
   WHERE id = (SELECT settlement_id FROM market_orders WHERE id = 'ff000000-0000-0000-0000-000000003a01')),
  120.00::NUMERIC(10,2),
  'Settlement statistics: total captured is $120.00'
);

SELECT is(
  (SELECT total_payouts_usd FROM market_settlements 
   WHERE id = (SELECT settlement_id FROM market_orders WHERE id = 'ff000000-0000-0000-0000-000000003a01')),
  108.00::NUMERIC(10,2),
  'Settlement statistics: total payouts is $108.00 ($27 + $36 + $45)'
);

SELECT is(
  (SELECT total_fees_usd FROM market_settlements 
   WHERE id = (SELECT settlement_id FROM market_orders WHERE id = 'ff000000-0000-0000-0000-000000003a01')),
  12.00::NUMERIC(10,2),
  'Settlement statistics: total fees platform captured is $12.00 ($3 + $4 + $5)'
);

SELECT * FROM finish();
ROLLBACK;
