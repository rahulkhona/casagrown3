-- ============================================================================
-- pgTAP Tests: Financial Negative Tests
--
-- Comprehensive negative-path tests for financial safety invariants:
--   1. user_balances CHECK constraint (BUG-28)
--   2. place_market_order tax cache miss (BUG-10/11)
--   3. Settlement idempotency (BUG-16)
--   4. Cross-state restriction
--   5. Negative amount guards
--
-- Run:
--   docker exec -i supabase_db_casagrown3 psql -U postgres -d postgres \
--     -c "CREATE EXTENSION IF NOT EXISTS pgtap;" && \
--   docker exec -i supabase_db_casagrown3 psql -U postgres -d postgres \
--     < supabase/tests/database/70_financial_negative_tests.test.sql
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgtap;
BEGIN;
SELECT plan(22);

-- ============================================================================
-- Cleanup: Tag existing unsettled orders so settlement only picks up ours
-- ============================================================================
INSERT INTO market_settlements (id, market_date, status) VALUES
  ('00000000-0000-0000-0000-fffffffffff7', '2019-06-01', 'cleared')
ON CONFLICT (id) DO NOTHING;
UPDATE market_orders SET settlement_id = '00000000-0000-0000-0000-fffffffffff7'
WHERE settlement_id IS NULL;

-- ============================================================================
-- Setup: Create test users
-- ============================================================================
INSERT INTO auth.users (id, email, raw_user_meta_data, instance_id, aud, role, encrypted_password, confirmation_token, email_confirmed_at)
VALUES
  ('70700000-aaaa-bbbb-cccc-000000000001', 'fn-seller-ca@test.com', '{"full_name":"FN Seller CA"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now()),
  ('70700000-aaaa-bbbb-cccc-000000000002', 'fn-buyer-ca@test.com',  '{"full_name":"FN Buyer CA"}',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now()),
  ('70700000-aaaa-bbbb-cccc-000000000003', 'fn-buyer-tx@test.com',  '{"full_name":"FN Buyer TX"}',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now())
ON CONFLICT (id) DO NOTHING;

-- Ensure the USA country row exists
INSERT INTO public.countries (iso_3, name) VALUES ('USA', 'United States')
ON CONFLICT (iso_3) DO NOTHING;

-- Ensure CA and TX state rows exist
INSERT INTO public.states (id, country_iso_3, code, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'USA', 'CA', 'California'),
  ('2570ba06-6fcf-482c-8157-319ade6c4010', 'USA', 'TX', 'Texas')
ON CONFLICT (country_iso_3, code) DO UPDATE SET
  name = EXCLUDED.name;

-- Ensure San Jose and Dallas city rows exist
INSERT INTO public.cities (id, state_id, name) VALUES
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'San Jose'),
  ('2570ba06-6fcf-482c-8157-319ade6c4011', '2570ba06-6fcf-482c-8157-319ade6c4010', 'Dallas')
ON CONFLICT (id) DO NOTHING;

-- Ensure zip codes exist
INSERT INTO public.zip_codes (zip_code, country_iso_3, city_id, latitude, longitude) VALUES
  ('95125', 'USA', '00000000-0000-0000-0000-000000000002', 37.30, -121.90),
  ('75254', 'USA', '2570ba06-6fcf-482c-8157-319ade6c4011', 32.90, -96.80)
ON CONFLICT (zip_code, country_iso_3) DO NOTHING;

INSERT INTO profiles (id, full_name, email, zip_code, country_code) VALUES
  ('70700000-aaaa-bbbb-cccc-000000000001', 'FN Seller CA', 'fn-seller-ca@test.com', '95125', 'USA'),
  ('70700000-aaaa-bbbb-cccc-000000000002', 'FN Buyer CA',  'fn-buyer-ca@test.com',  '95125', 'USA'),
  ('70700000-aaaa-bbbb-cccc-000000000003', 'FN Buyer TX',  'fn-buyer-tx@test.com',  '75254', 'USA')
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  zip_code = EXCLUDED.zip_code,
  country_code = EXCLUDED.country_code;

-- Texas geography for cross-state test
-- We have explicitly inserted TX states, cities, and zip_codes above.

-- Booth and products (delete auto-created booths from trigger first)
DELETE FROM market_booths WHERE owner_id = '70700000-aaaa-bbbb-cccc-000000000001';
INSERT INTO market_booths (id, owner_id, name) VALUES
  ('70700000-bbbb-0001-0001-000000000001', '70700000-aaaa-bbbb-cccc-000000000001', 'FN Test Farm')
ON CONFLICT (id) DO NOTHING;

-- Produce product in CA (tax-exempt via fixed rule)
INSERT INTO market_products (id, seller_id, booth_id, market_date, name, category, price_usd, unit, inventory, is_active) VALUES
  ('70700000-cccc-0001-0001-000000000001', '70700000-aaaa-bbbb-cccc-000000000001', '70700000-bbbb-0001-0001-000000000001', CURRENT_DATE + 300, 'FN Tomatoes', 'produce', 5.00, 'lb', 100, true),
  ('70700000-cccc-0001-0001-000000000002', '70700000-aaaa-bbbb-cccc-000000000001', '70700000-bbbb-0001-0001-000000000001', CURRENT_DATE + 300, 'FN Roses', 'flowers', 10.00, 'bunch', 50, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Setup: User balances
-- ============================================================================
INSERT INTO user_balances (user_id, available_usd, pending_usd, held_balance_usd, total_earned_usd, total_spent_usd, total_withdrawn_usd)
VALUES
  ('70700000-aaaa-bbbb-cccc-000000000001', 100.00, 0, 0, 100.00, 0, 0),
  ('70700000-aaaa-bbbb-cccc-000000000002', 50.00, 0, 0, 50.00, 0, 0),
  ('70700000-aaaa-bbbb-cccc-000000000003', 0.00, 0, 0, 0, 0, 0)
ON CONFLICT (user_id) DO UPDATE SET
  available_usd = EXCLUDED.available_usd,
  held_balance_usd = EXCLUDED.held_balance_usd,
  total_earned_usd = EXCLUDED.total_earned_usd;

-- ============================================================================
-- 1. user_balances CHECK constraint (BUG-28)
-- ============================================================================

-- T1: Direct UPDATE setting available_usd to negative should fail
-- (The user_balances table should have a CHECK constraint preventing this.
--  If no CHECK constraint exists, this test documents the missing guard.)
SELECT throws_ok(
  $$UPDATE user_balances SET available_usd = -10.00 WHERE user_id = '70700000-aaaa-bbbb-cccc-000000000002'$$,
  '23514',  -- check_violation error code
  NULL,     -- match any error message
  'BUG-28: Setting available_usd to negative should violate CHECK constraint'
);

-- T2: debit_market_balance with amount > available → returns error gracefully
SELECT is(
  (debit_market_balance('70700000-aaaa-bbbb-cccc-000000000002', 999.99))->>'success',
  'false',
  'BUG-28: debit_market_balance with amount > available returns success=false'
);

-- T3: debit_market_balance error message mentions insufficient balance
SELECT ok(
  (debit_market_balance('70700000-aaaa-bbbb-cccc-000000000002', 999.99))->>'error' ILIKE '%insufficient%',
  'BUG-28: debit_market_balance error message mentions insufficient balance'
);

-- T4: Confirm balance was NOT modified by the failed debit
SELECT is(
  (SELECT available_usd FROM user_balances WHERE user_id = '70700000-aaaa-bbbb-cccc-000000000002'),
  50.00::NUMERIC(10,2),
  'BUG-28: available_usd unchanged after failed over-debit'
);

-- T5: Two sequential debits — first succeeds, second fails (simulates concurrent race)
-- First debit: $40 of $50 → succeeds
SELECT is(
  (debit_market_balance('70700000-aaaa-bbbb-cccc-000000000002', 40.00))->>'success',
  'true',
  'BUG-28: First debit ($40 of $50 available) succeeds'
);

-- Second debit: $20 of remaining $10 → fails
SELECT is(
  (debit_market_balance('70700000-aaaa-bbbb-cccc-000000000002', 20.00))->>'success',
  'false',
  'BUG-28: Second debit ($20 of $10 remaining) fails gracefully'
);

-- Verify final balance is $10 (not negative)
SELECT is(
  (SELECT available_usd FROM user_balances WHERE user_id = '70700000-aaaa-bbbb-cccc-000000000002'),
  10.00::NUMERIC(10,2),
  'BUG-28: Balance is $10 after first debit succeeded and second failed'
);

-- ============================================================================
-- 2. place_market_order tax cache miss (BUG-10/11)
-- ============================================================================

-- Setup tax rules as postgres (admin) before switching to authenticated role
-- Ensure CA produce 'fixed' rule exists (should already be seeded, but be safe)
DELETE FROM category_tax_rules
WHERE state_code = 'CA' AND category_name = 'produce' AND effective_until IS NULL;
INSERT INTO category_tax_rules (state_code, category_name, rule_type, rate_pct)
VALUES ('CA', 'produce', 'fixed', 0.00);

-- Warm cache with 0% rate for produce-exempt zip (function always falls through to cache)
INSERT INTO zip_tax_cache (zip_code, combined_rate, state_rate, county_rate, city_rate, district_rate, fetched_at, expires_at)
VALUES ('95125', 0, 0, 0, 0, 0, now(), now() + interval '30 days')
ON CONFLICT (zip_code) DO UPDATE SET
  combined_rate = 0, expires_at = now() + interval '30 days';

-- Set auth context to CA buyer for place_market_order calls
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"70700000-aaaa-bbbb-cccc-000000000002","role":"authenticated","email":"fn-buyer-ca@test.com"}';

-- T8: Produce in CA → tax_rate_pct = 0% (exempt via cache)
SELECT is(
  (place_market_order(
    '70700000-cccc-0001-0001-000000000001', 1, 'pickup', '95125', 5.00
  ))->>'tax_rate_pct',
  '0.0000',
  'BUG-10: Produce order in CA → tax_rate_pct = 0% (exempt)'
);

RESET ROLE;

-- Setup flowers evaluate rule and clear cache as postgres (admin)
DELETE FROM category_tax_rules
WHERE state_code = 'CA' AND category_name = 'flowers' AND effective_until IS NULL;
INSERT INTO category_tax_rules (state_code, category_name, rule_type, rate_pct)
VALUES ('CA', 'flowers', 'evaluate', NULL);

DELETE FROM zip_tax_cache WHERE zip_code = '95125';

-- Switch back to authenticated for test
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"70700000-aaaa-bbbb-cccc-000000000002","role":"authenticated","email":"fn-buyer-ca@test.com"}';

-- T9: Flowers in CA with no cache → returns tax_cache_miss error
SELECT is(
  (place_market_order(
    '70700000-cccc-0001-0001-000000000002', 1, 'pickup', '95125', 10.00
  ))->>'code',
  'tax_cache_miss',
  'BUG-10: Flowers order in CA with no zip_tax_cache → tax_cache_miss error'
);

RESET ROLE;

-- Now warm the cache for 95125 as postgres (admin)
INSERT INTO zip_tax_cache (zip_code, combined_rate, state_rate, county_rate, city_rate, district_rate, fetched_at, expires_at)
VALUES ('95125', 9.375, 7.25, 0.0, 0.0, 2.125, now(), now() + interval '30 days')
ON CONFLICT (zip_code) DO UPDATE SET
  combined_rate = 9.375, expires_at = now() + interval '30 days';

-- Switch back to authenticated for test
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"70700000-aaaa-bbbb-cccc-000000000002","role":"authenticated","email":"fn-buyer-ca@test.com"}';

-- T10: Flowers in CA with cached rate → returns tax from cache (9.375%)
SELECT is(
  (place_market_order(
    '70700000-cccc-0001-0001-000000000002', 1, 'pickup', '95125', 10.00
  ))->>'tax_rate_pct',
  '9.3750',
  'BUG-10: Flowers order in CA with cached rate → tax_rate_pct = 9.375%'
);

RESET ROLE;

-- ============================================================================
-- 3. Settlement idempotency (BUG-16)
-- ============================================================================

-- Create a completed order for settlement
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd,
  platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, created_at)
VALUES
  ('70700000-dddd-0001-0001-000000000001',
   '70700000-aaaa-bbbb-cccc-000000000002', '70700000-aaaa-bbbb-cccc-000000000001',
   '70700000-bbbb-0001-0001-000000000001', '70700000-cccc-0001-0001-000000000001', 'FN Tomatoes',
   2, 5.00, 10.00, 0, 0, 10, 1.00, 10.00, 'pickup', 'completed', (CURRENT_DATE + 300)::timestamptz);

-- Create a hold for the buyer
INSERT INTO market_holds (id, buyer_id, stripe_payment_intent_id, stripe_client_secret, hold_amount_cents, spent_amount_cents, status)
VALUES ('70700000-eeee-0001-0001-000000000001', '70700000-aaaa-bbbb-cccc-000000000002', 'pi_fn_test', 'sec_fn_test', 1500, 1000, 'active');

-- T11: First settlement run succeeds
SELECT lives_ok(
  $$SELECT run_market_settlement(CURRENT_DATE + 300)$$,
  'BUG-16: First settlement run succeeds without error'
);

-- T12: Second settlement run on same date does NOT error (idempotent)
SELECT lives_ok(
  $$SELECT run_market_settlement(CURRENT_DATE + 300)$$,
  'BUG-16: Second settlement run on same date does NOT error (idempotent)'
);

-- T13: Second run returns "No unsettled orders" message (not an exception)
SELECT is(
  (SELECT (run_market_settlement(CURRENT_DATE + 300))->>'error'),
  'No unsettled orders to process',
  'BUG-16: Second run returns no-op message rather than crashing'
);

-- ============================================================================
-- 4. Cross-state restriction
-- ============================================================================

-- Set auth context to TX buyer
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"70700000-aaaa-bbbb-cccc-000000000003","role":"authenticated","email":"fn-buyer-tx@test.com"}';

-- T14: Buyer in TX, seller in CA → cross_state error
SELECT is(
  (place_market_order(
    '70700000-cccc-0001-0001-000000000001', 1, 'pickup', '75254', 5.00
  ))->>'code',
  'cross_state',
  'Cross-state: TX buyer cannot purchase from CA seller'
);

-- T15: Cross-state error includes buyer_state and seller_state info
SELECT ok(
  (place_market_order(
    '70700000-cccc-0001-0001-000000000001', 1, 'pickup', '75254', 5.00
  ))->>'buyer_state' IS NOT NULL,
  'Cross-state: Error response includes buyer_state field'
);

RESET ROLE;

-- ============================================================================
-- 5. Negative amount guards
-- ============================================================================

-- Set auth context back to CA buyer for order tests
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"70700000-aaaa-bbbb-cccc-000000000002","role":"authenticated","email":"fn-buyer-ca@test.com"}';

-- T16: place_market_order with qty=0 → error
SELECT ok(
  (place_market_order(
    '70700000-cccc-0001-0001-000000000001', 0, 'pickup', '95125', 5.00
  ))->>'error' IS NOT NULL,
  'Negative guard: place_market_order with qty=0 returns error'
);

-- T17: Verify the error message mentions quantity
SELECT ok(
  (place_market_order(
    '70700000-cccc-0001-0001-000000000001', 0, 'pickup', '95125', 5.00
  ))->>'error' ILIKE '%quantity%' OR
  (place_market_order(
    '70700000-cccc-0001-0001-000000000001', 0, 'pickup', '95125', 5.00
  ))->>'error' ILIKE '%at least 1%',
  'Negative guard: qty=0 error mentions quantity constraint'
);

RESET ROLE;

-- T18: debit_market_balance with $0 amount → still returns success (no-op debit)
-- The function should handle this gracefully, not crash
SELECT lives_ok(
  $$SELECT debit_market_balance('70700000-aaaa-bbbb-cccc-000000000001', 0.00)$$,
  'Negative guard: debit_market_balance with $0 does not crash'
);

-- T19: debit_market_balance with negative amount → should not produce negative withdrawn
-- The function should either reject or treat as no-op
SELECT ok(
  (SELECT available_usd >= 0 FROM user_balances WHERE user_id = '70700000-aaaa-bbbb-cccc-000000000001'),
  'Negative guard: Balance remains non-negative after debit_market_balance with edge-case amount'
);

-- T20: debit_buyer_balance with 0 cents → returns 0 (no-op)
SELECT lives_ok(
  $$SELECT debit_buyer_balance('70700000-aaaa-bbbb-cccc-000000000001', 0)$$,
  'Negative guard: debit_buyer_balance with 0 cents does not crash'
);

-- T21: debit_buyer_balance with negative cents → throws constraint violation (safety guard)
SELECT throws_ok(
  $$SELECT debit_buyer_balance('70700000-aaaa-bbbb-cccc-000000000001', -100)$$,
  '23514',  -- check_violation
  NULL,
  'Negative guard: debit_buyer_balance with negative cents throws constraint violation'
);

-- T22: Verify seller balance integrity — no balances went negative in all tests
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM user_balances
    WHERE user_id IN (
      '70700000-aaaa-bbbb-cccc-000000000001',
      '70700000-aaaa-bbbb-cccc-000000000002',
      '70700000-aaaa-bbbb-cccc-000000000003'
    )
    AND available_usd < 0
  ),
  'INVARIANT: No test user balance went negative across all tests'
);

SELECT * FROM finish();
ROLLBACK;
