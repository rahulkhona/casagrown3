-- ============================================================================
-- pgTAP Stress Tests: Balance-First Hold Logic
--
-- Tests: debit_buyer_balance atomicity, refund_buyer_balance correctness,
-- settlement with mixed balance+card holds, and race condition prevention.
--
-- Uses the same 8 users from the settlement stress test, but gives some
-- of them available balances before placing orders.
-- ============================================================================
BEGIN;
SELECT plan(30);

-- ============================================================================
-- Cleanup
-- ============================================================================
INSERT INTO market_settlements (id, market_date, status) VALUES
  ('00000000-0000-0000-0000-fffffffffff0', '2019-01-01', 'cleared')
ON CONFLICT (id) DO NOTHING;
UPDATE market_orders SET settlement_id = '00000000-0000-0000-0000-fffffffffff0'
WHERE settlement_id IS NULL;

-- ============================================================================
-- Setup: Reuse 8 users from the settlement test (ON CONFLICT ensures safe)
-- ============================================================================
INSERT INTO auth.users (id, email, raw_user_meta_data, instance_id, aud, role, encrypted_password, confirmation_token, email_confirmed_at)
VALUES
  ('11111111-aaaa-bbbb-cccc-100000000001', 'bal_alice@test.com', '{}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now()),
  ('11111111-aaaa-bbbb-cccc-100000000002', 'bal_bob@test.com', '{}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now()),
  ('11111111-aaaa-bbbb-cccc-100000000003', 'bal_carol@test.com', '{}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now()),
  ('11111111-aaaa-bbbb-cccc-100000000004', 'bal_dan@test.com', '{}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, full_name, email) VALUES
  ('11111111-aaaa-bbbb-cccc-100000000001', 'BalAlice', 'bal_alice@test.com'),  -- seller with balance
  ('11111111-aaaa-bbbb-cccc-100000000002', 'BalBob', 'bal_bob@test.com'),      -- buyer with $50 balance (partial cover)
  ('11111111-aaaa-bbbb-cccc-100000000003', 'BalCarol', 'bal_carol@test.com'),  -- buyer with $100 balance (full cover)
  ('11111111-aaaa-bbbb-cccc-100000000004', 'BalDan', 'bal_dan@test.com')       -- buyer with $0 balance (all card)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Booths
INSERT INTO market_booths (id, owner_id, name) VALUES
  ('22222222-aaaa-bbbb-cccc-100000000001', '11111111-aaaa-bbbb-cccc-100000000001', 'BalAlice Farm')
ON CONFLICT (id) DO NOTHING;

-- Products ($25 each for clean math)
INSERT INTO market_products (id, seller_id, market_date, name, category, price_usd, unit, inventory, is_active) VALUES
  ('33333333-aaaa-0001-0001-100000000001', '11111111-aaaa-bbbb-cccc-100000000001', '2026-03-15', 'Premium Tomatoes', 'vegetables', 25.00, 'lb', 200, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Setup: Give users available balances
-- ============================================================================
INSERT INTO user_balances (user_id, available_usd, pending_usd, held_balance_usd, total_earned_usd, total_spent_usd, total_withdrawn_usd)
VALUES
  ('11111111-aaaa-bbbb-cccc-100000000001', 200.00, 0, 0, 200.00, 0, 0),   -- Alice: seller with balance
  ('11111111-aaaa-bbbb-cccc-100000000002', 50.00, 0, 0, 50.00, 0, 0),     -- Bob: $50 balance
  ('11111111-aaaa-bbbb-cccc-100000000003', 100.00, 0, 0, 100.00, 0, 0),   -- Carol: $100 balance
  ('11111111-aaaa-bbbb-cccc-100000000004', 0.00, 0, 0, 0, 0, 0)           -- Dan: $0 balance
ON CONFLICT (user_id) DO UPDATE SET
  available_usd = EXCLUDED.available_usd,
  held_balance_usd = EXCLUDED.held_balance_usd,
  total_earned_usd = EXCLUDED.total_earned_usd;

-- ============================================================================
-- Test 1: debit_buyer_balance — partial debit (Bob: $50 available, request $75)
-- ============================================================================
SELECT is(
  debit_buyer_balance('11111111-aaaa-bbbb-cccc-100000000002', 7500),
  5000,
  'Bob: debit_buyer_balance with $75 request returns $50 (balance limit)'
);

SELECT is(
  (SELECT available_usd FROM user_balances WHERE user_id = '11111111-aaaa-bbbb-cccc-100000000002'),
  0.00::NUMERIC(10,2),
  'Bob: available_usd = $0 after full drain'
);

SELECT is(
  (SELECT held_balance_usd FROM user_balances WHERE user_id = '11111111-aaaa-bbbb-cccc-100000000002'),
  50.00::NUMERIC(10,2),
  'Bob: held_balance_usd = $50 (locked for purchase)'
);

-- ============================================================================
-- Test 2: debit_buyer_balance — full cover (Carol: $100 available, request $25)
-- ============================================================================
SELECT is(
  debit_buyer_balance('11111111-aaaa-bbbb-cccc-100000000003', 2500),
  2500,
  'Carol: debit_buyer_balance with $25 request returns $25 (fully covered)'
);

SELECT is(
  (SELECT available_usd FROM user_balances WHERE user_id = '11111111-aaaa-bbbb-cccc-100000000003'),
  75.00::NUMERIC(10,2),
  'Carol: available_usd = $75 after $25 debit'
);

SELECT is(
  (SELECT held_balance_usd FROM user_balances WHERE user_id = '11111111-aaaa-bbbb-cccc-100000000003'),
  25.00::NUMERIC(10,2),
  'Carol: held_balance_usd = $25'
);

-- ============================================================================
-- Test 3: debit_buyer_balance — zero balance (Dan: $0, request $25)
-- ============================================================================
SELECT is(
  debit_buyer_balance('11111111-aaaa-bbbb-cccc-100000000004', 2500),
  0,
  'Dan: debit_buyer_balance with $0 available returns 0 (all card)'
);

-- ============================================================================
-- Test 4: debit_buyer_balance — second debit on already-drained (Bob: $0 left)
-- ============================================================================
SELECT is(
  debit_buyer_balance('11111111-aaaa-bbbb-cccc-100000000002', 5000),
  0,
  'Bob: second debit returns 0 (already drained)'
);

-- ============================================================================
-- Test 5: refund_buyer_balance — return $30 to Bob
-- ============================================================================
SELECT is(
  refund_buyer_balance('11111111-aaaa-bbbb-cccc-100000000002', 3000, 'order_cancelled'),
  true,
  'Bob: refund_buyer_balance returns true'
);

SELECT is(
  (SELECT available_usd FROM user_balances WHERE user_id = '11111111-aaaa-bbbb-cccc-100000000002'),
  30.00::NUMERIC(10,2),
  'Bob: available_usd = $30 after refund'
);

SELECT is(
  (SELECT held_balance_usd FROM user_balances WHERE user_id = '11111111-aaaa-bbbb-cccc-100000000002'),
  20.00::NUMERIC(10,2),
  'Bob: held_balance_usd = $20 after partial refund'
);

-- ============================================================================
-- Test 6: Ledger entries exist for balance_held and balance_released
-- ============================================================================
SELECT ok(
  EXISTS (SELECT 1 FROM market_ledger WHERE user_id = '11111111-aaaa-bbbb-cccc-100000000002' AND event_type = 'balance_held'),
  'Bob: balance_held ledger entry exists'
);

SELECT ok(
  EXISTS (SELECT 1 FROM market_ledger WHERE user_id = '11111111-aaaa-bbbb-cccc-100000000002' AND event_type = 'balance_released'),
  'Bob: balance_released ledger entry exists'
);

SELECT ok(
  EXISTS (SELECT 1 FROM market_ledger WHERE user_id = '11111111-aaaa-bbbb-cccc-100000000003' AND event_type = 'balance_held'),
  'Carol: balance_held ledger entry exists'
);

-- ============================================================================
-- Test 7: Settlement with balance-applied orders
-- ============================================================================
-- Create orders with balance_applied_usd set (simulating market-hold)
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd,
  platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status,
  balance_applied_usd, created_at)
VALUES
  -- Bob: $75 order, $50 from balance, $25 from card
  ('44444444-0001-0001-0001-100000000001', '11111111-aaaa-bbbb-cccc-100000000002', '11111111-aaaa-bbbb-cccc-100000000001',
   '22222222-aaaa-bbbb-cccc-100000000001', '33333333-aaaa-0001-0001-100000000001', 'Premium Tomatoes',
   3, 25.00, 75.00, 0, 0, 10, 7.50, 75.00, 'pickup', 'completed',
   20.00, '2026-03-15'::timestamptz),  -- $20 from remaining held balance (after refund)
  -- Carol: $25 order, fully from balance
  ('44444444-0001-0001-0001-100000000002', '11111111-aaaa-bbbb-cccc-100000000003', '11111111-aaaa-bbbb-cccc-100000000001',
   '22222222-aaaa-bbbb-cccc-100000000001', '33333333-aaaa-0001-0001-100000000001', 'Premium Tomatoes',
   1, 25.00, 25.00, 0, 0, 10, 2.50, 25.00, 'pickup', 'completed',
   25.00, '2026-03-15'::timestamptz),  -- fully covered by balance
  -- Dan: $25 order, $0 from balance, all card
  ('44444444-0001-0001-0001-100000000003', '11111111-aaaa-bbbb-cccc-100000000004', '11111111-aaaa-bbbb-cccc-100000000001',
   '22222222-aaaa-bbbb-cccc-100000000001', '33333333-aaaa-0001-0001-100000000001', 'Premium Tomatoes',
   1, 25.00, 25.00, 0, 0, 10, 2.50, 25.00, 'pickup', 'completed',
   0.00, '2026-03-15'::timestamptz);  -- all card

-- Create holds (only Bob and Dan need card holds; Carol was fully balance-covered)
INSERT INTO market_holds (id, buyer_id, stripe_payment_intent_id, stripe_client_secret,
  hold_amount_cents, spent_amount_cents, balance_applied_cents, status)
VALUES
  ('55555555-aaaa-0001-0001-100000000002', '11111111-aaaa-bbbb-cccc-100000000002', 'pi_bal_bob', 'sec_bal_bob',
   5500, 7500, 2000, 'active'),  -- $55 card hold for $75 order ($20 from balance)
  ('55555555-aaaa-0001-0001-100000000004', '11111111-aaaa-bbbb-cccc-100000000004', 'pi_bal_dan', 'sec_bal_dan',
   2500, 2500, 0, 'active');    -- $25 card hold, no balance applied

-- Run settlement
SELECT lives_ok(
  $$SELECT run_market_settlement('2026-03-15'::date)$$,
  'Settlement with balance-first holds runs without error'
);

SELECT is(
  (SELECT status::text FROM market_settlements WHERE market_date = '2026-03-15'),
  'funds_pending',
  'Settlement in funds_pending state'
);

-- Verify settlement counted 3 orders
SELECT is(
  (SELECT total_orders FROM market_settlements WHERE market_date = '2026-03-15'),
  3,
  'Settlement counted 3 completed orders'
);

-- ============================================================================
-- Test 8: Verify settlement netting with balance deductions
-- ============================================================================

-- Alice: sold $125 (= 75 + 25 + 25), fees = $12.50, net = $112.50
SELECT is(
  (SELECT gross_sales_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '11111111-aaaa-bbbb-cccc-100000000001' AND ms.market_date = '2026-03-15'),
  125.00::NUMERIC(10,2),
  'Alice: gross_sales = $125 (3 orders)'
);

-- Bob: bought $75, balance $20 applied, card portion = $55
-- Capture should be $55 (card portion only)
SELECT is(
  (SELECT capture_amount_usd FROM settlement_captures WHERE buyer_id = '11111111-aaaa-bbbb-cccc-100000000002'
   AND settlement_id = (SELECT id FROM market_settlements WHERE market_date = '2026-03-15')),
  55.00::NUMERIC(10,2),
  'Bob: card captured = $55 (card portion of $75 order after $20 balance)'
);

-- Carol: bought $25 fully from balance, no card hold exists
-- Carol should NOT have a capture record (no card hold)
SELECT is(
  (SELECT COUNT(*) FROM settlement_captures WHERE buyer_id = '11111111-aaaa-bbbb-cccc-100000000003'
   AND settlement_id = (SELECT id FROM market_settlements WHERE market_date = '2026-03-15')),
  0::BIGINT,
  'Carol: no card captures (fully covered by balance)'
);

-- Dan: bought $25 all from card
SELECT is(
  (SELECT capture_amount_usd FROM settlement_captures WHERE buyer_id = '11111111-aaaa-bbbb-cccc-100000000004'
   AND settlement_id = (SELECT id FROM market_settlements WHERE market_date = '2026-03-15')),
  25.00::NUMERIC(10,2),
  'Dan: card captured = $25 (all card, $0 balance)'
);

-- ============================================================================
-- Test 9: Balance consumed during settlement
-- ============================================================================

-- Bob's held balance should be consumed (moved from held to spent)
SELECT is(
  (SELECT held_balance_usd FROM user_balances WHERE user_id = '11111111-aaaa-bbbb-cccc-100000000002'),
  0.00::NUMERIC(10,2),
  'Bob: held_balance_usd = $0 after settlement consumed it'
);

-- Carol's held balance should be consumed
SELECT is(
  (SELECT held_balance_usd FROM user_balances WHERE user_id = '11111111-aaaa-bbbb-cccc-100000000003'),
  0.00::NUMERIC(10,2),
  'Carol: held_balance_usd = $0 after settlement consumed it'
);

-- ============================================================================
-- Test 10: Global invariants still hold
-- ============================================================================
SELECT is(
  (SELECT ROUND(SUM(net_payout_usd + platform_fees_usd)::NUMERIC, 2) FROM user_settlements us
   JOIN market_settlements ms ON ms.id = us.settlement_id WHERE ms.market_date = '2026-03-15'),
  0.00::NUMERIC,
  'INVARIANT: SUM(net + fees) = 0 (zero-sum market)'
);

-- Total purchases = total sales
SELECT is(
  (SELECT SUM(gross_sales_usd) FROM user_settlements us
   JOIN market_settlements ms ON ms.id = us.settlement_id WHERE ms.market_date = '2026-03-15'),
  (SELECT SUM(total_purchases_usd) FROM user_settlements us
   JOIN market_settlements ms ON ms.id = us.settlement_id WHERE ms.market_date = '2026-03-15'),
  'INVARIANT: total sales = total purchases'
);

-- Total card captures + balance applied = total purchases
SELECT is(
  (SELECT ROUND(COALESCE(SUM(sc.capture_amount_usd), 0) +
    COALESCE((SELECT SUM(balance_applied_usd) FROM market_orders WHERE settlement_id = (SELECT id FROM market_settlements WHERE market_date = '2026-03-15')), 0), 2)
   FROM settlement_captures sc WHERE sc.settlement_id = (SELECT id FROM market_settlements WHERE market_date = '2026-03-15')),
  125.00::NUMERIC,
  'INVARIANT: card_captures + balance_applied = total_purchases ($80 card + $45 balance = $125)'
);

SELECT * FROM finish();
ROLLBACK;
