-- ============================================================================
-- Settlement Benchmark: 100,000 transactions
--
-- Tests settlement performance at scale to evaluate readiness for
-- national deployment (target: millions of transactions)
-- ============================================================================
BEGIN;

-- Timing helper
\timing on

-- ============================================================================
-- 1. Setup: 500 users, 50 booths, 200 products
-- ============================================================================
DO $$
DECLARE
  i INTEGER;
  v_user_id UUID;
BEGIN
  -- Silence notices for faster execution
  SET LOCAL client_min_messages = warning;

  RAISE NOTICE 'Creating 500 users...';
  FOR i IN 1..500 LOOP
    v_user_id := ('aaaaaaaa-bbb0-0000-0000-' || LPAD(i::TEXT, 12, '0'))::UUID;
    INSERT INTO auth.users (id, email, raw_user_meta_data, instance_id, aud, role, encrypted_password, confirmation_token, email_confirmed_at)
    VALUES (v_user_id, 'bench_user_' || i || '@test.com', '{}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO profiles (id, full_name, email) VALUES (v_user_id, 'Bench User ' || i, 'bench_user_' || i || '@test.com')
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
  END LOOP;

  RAISE NOTICE 'Creating 50 booths...';
  FOR i IN 1..50 LOOP
    v_user_id := ('aaaaaaaa-bbb0-0000-0000-' || LPAD(i::TEXT, 12, '0'))::UUID;
    INSERT INTO market_booths (id, owner_id, name)
    VALUES (('bbbbbbbb-bbb0-0000-0000-' || LPAD(i::TEXT, 12, '0'))::UUID, v_user_id, 'Bench Booth ' || i)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Creating 200 products...';
  FOR i IN 1..200 LOOP
    INSERT INTO market_products (id, seller_id, market_date, name, category, price_usd, unit, inventory, is_active)
    VALUES (
      ('cccccccc-bbb0-0000-0000-' || LPAD(i::TEXT, 12, '0'))::UUID,
      ('aaaaaaaa-bbb0-0000-0000-' || LPAD(((i - 1) % 50 + 1)::TEXT, 12, '0'))::UUID,
      CURRENT_DATE,
      'Product ' || i,
      CASE (i % 4) WHEN 0 THEN 'produce' WHEN 1 THEN 'flowers' WHEN 2 THEN 'eggs' ELSE 'honey' END,
      5.00 + (i % 20)::NUMERIC,
      'unit',
      1000,
      true
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

-- Mark all existing seed orders as settled
INSERT INTO market_settlements (id, market_date, status) VALUES
  ('00000000-0000-0000-0000-ffffffffffff', '2020-01-01', 'cleared')
ON CONFLICT (id) DO NOTHING;
UPDATE market_orders SET settlement_id = '00000000-0000-0000-0000-ffffffffffff'
WHERE settlement_id IS NULL;

-- ============================================================================
-- 2. Generate 100,000 completed orders
-- ============================================================================
DO $$
DECLARE
  v_batch_size INTEGER := 10000;
  v_total INTEGER := 100000;
  v_start_time TIMESTAMPTZ;
  v_batch_num INTEGER;
BEGIN
  SET LOCAL client_min_messages = warning;
  v_start_time := clock_timestamp();

  RAISE NOTICE '=== Generating % orders in batches of % ===', v_total, v_batch_size;

  FOR v_batch_num IN 0..(v_total / v_batch_size - 1) LOOP
    INSERT INTO market_orders (
      buyer_id, seller_id, booth_id, product_id, product_name,
      quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd,
      platform_fee_pct, platform_fee_usd, total_usd,
      fulfillment_type, status, created_at
    )
    SELECT
      -- Random buyer (users 101-500)
      ('aaaaaaaa-bbb0-0000-0000-' || LPAD((101 + (gs % 400))::TEXT, 12, '0'))::UUID,
      -- Random seller (users 1-50)
      ('aaaaaaaa-bbb0-0000-0000-' || LPAD((1 + (gs % 50))::TEXT, 12, '0'))::UUID,
      -- Seller's booth
      ('bbbbbbbb-bbb0-0000-0000-' || LPAD((1 + (gs % 50))::TEXT, 12, '0'))::UUID,
      -- Random product
      ('cccccccc-bbb0-0000-0000-' || LPAD((1 + (gs % 200))::TEXT, 12, '0'))::UUID,
      'Product ' || (1 + (gs % 200)),
      -- Random quantity 1-5
      1 + (gs % 5),
      -- Price: $5-$24
      5.00 + (gs % 20)::NUMERIC,
      -- Subtotal (just qty × price, all >= $5)
      (1 + (gs % 5)) * (5.00 + (gs % 20)::NUMERIC),
      -- Tax
      0, 0,
      -- Platform fee 10%
      10,
      ((1 + (gs % 5)) * (5.00 + (gs % 20)::NUMERIC)) * 0.10,
      -- Total = subtotal (no tax for simplicity)
      (1 + (gs % 5)) * (5.00 + (gs % 20)::NUMERIC),
      CASE WHEN gs % 2 = 0 THEN 'pickup' ELSE 'delivery' END,
      'completed',
      now() - interval '1 day'  -- yesterday
    FROM generate_series(v_batch_num * v_batch_size + 1, (v_batch_num + 1) * v_batch_size) gs;

    RAISE NOTICE 'Batch %: inserted % orders (elapsed: %)',
      v_batch_num + 1,
      (v_batch_num + 1) * v_batch_size,
      clock_timestamp() - v_start_time;
  END LOOP;

  RAISE NOTICE '=== Total insert time: % ===', clock_timestamp() - v_start_time;
END $$;

-- Verify count
SELECT COUNT(*) AS unsettled_orders FROM market_orders WHERE settlement_id IS NULL;

-- Create holds for buyers (simplified: one per buyer)
DO $$
DECLARE
  v_buyer RECORD;
BEGIN
  SET LOCAL client_min_messages = warning;
  RAISE NOTICE '=== Creating holds for buyers ===';
  FOR v_buyer IN
    SELECT DISTINCT buyer_id, SUM(total_usd) AS total_purchases
    FROM market_orders WHERE settlement_id IS NULL AND status = 'completed'
    GROUP BY buyer_id
  LOOP
    INSERT INTO market_holds (buyer_id, stripe_payment_intent_id, stripe_client_secret, hold_amount_cents, spent_amount_cents, status)
    VALUES (v_buyer.buyer_id, 'pi_bench_' || v_buyer.buyer_id, 'sec_bench_' || v_buyer.buyer_id,
      (v_buyer.total_purchases * 120)::INTEGER,  -- 120% of purchases as hold
      (v_buyer.total_purchases * 100)::INTEGER, 'active')
    ON CONFLICT DO NOTHING;
  END LOOP;
  RAISE NOTICE '=== Holds created ===';
END $$;

-- ============================================================================
-- 3. BENCHMARK: Run settlement
-- ============================================================================
DO $$
DECLARE
  v_start TIMESTAMPTZ;
  v_result JSONB;
  v_duration INTERVAL;
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE '=== BENCHMARK: Settling 100,000 orders ===';
  RAISE NOTICE '============================================';
  v_start := clock_timestamp();

  SELECT run_market_settlement(CURRENT_DATE) INTO v_result;

  v_duration := clock_timestamp() - v_start;
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '=== SETTLEMENT COMPLETE ===';
  RAISE NOTICE '=== Duration: % ===', v_duration;
  RAISE NOTICE '=== Result: % ===', v_result;
  RAISE NOTICE '==========================================';

  -- Extrapolations
  RAISE NOTICE '';
  RAISE NOTICE '--- Extrapolations ---';
  RAISE NOTICE '100K orders:  %', v_duration;
  RAISE NOTICE '500K orders:  ~%', v_duration * 5;
  RAISE NOTICE '1M orders:    ~%', v_duration * 10;
END $$;

-- ============================================================================
-- 4. Verify results
-- ============================================================================
SELECT 'Settlement' AS entity,
  COUNT(*) AS count,
  SUM(total_orders) AS total_orders,
  SUM(total_fees_usd) AS total_fees
FROM market_settlements WHERE market_date = CURRENT_DATE;

SELECT 'User Settlements' AS entity,
  COUNT(*) AS user_count,
  SUM(gross_sales_usd) AS total_sales,
  SUM(total_purchases_usd) AS total_purchases,
  SUM(platform_fees_usd) AS total_fees,
  ROUND(SUM(net_payout_usd + platform_fees_usd), 2) AS zero_sum_check
FROM user_settlements us
JOIN market_settlements ms ON ms.id = us.settlement_id
WHERE ms.market_date = CURRENT_DATE;

-- Final stats
SELECT
  (SELECT COUNT(*) FROM market_orders WHERE settlement_id IS NOT NULL AND settlement_id != '00000000-0000-0000-0000-ffffffffffff') AS orders_settled,
  (SELECT COUNT(*) FROM market_orders WHERE settlement_id IS NULL) AS orders_unsettled,
  (SELECT COUNT(*) FROM market_ledger) AS total_ledger_entries,
  (SELECT COUNT(*) FROM settlement_captures) AS total_captures;

ROLLBACK;
