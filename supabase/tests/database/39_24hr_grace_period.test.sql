-- ==========================================================================
-- Test: 24-hour grace period for auto-completion / auto-cancellation
-- Uses existing seed data for users, booths; only creates test products/orders
-- ==========================================================================
BEGIN;
SELECT plan(20);

-- ──────────────────────────────────────
-- Setup: grab existing seed seller/buyer/booth, create products with specific windows
-- ──────────────────────────────────────
DO $$
DECLARE
  v_seller_id UUID := 'a1111111-1111-1111-1111-111111111111';
  v_booth_id  UUID;
BEGIN
  -- Get existing booth for this seller
  SELECT id INTO v_booth_id FROM market_booths WHERE owner_id = v_seller_id LIMIT 1;

  -- Product with TODAY's windows (not yet expired during test)
  INSERT INTO market_products (
    id, seller_id, name, category, price_usd, inventory, is_active, market_date,
    product_delivery_windows, product_pickup_windows, window_dates
  ) VALUES (
    'dd390001-0000-0000-0000-000000000001',
    v_seller_id, 'Today Tomatoes', 'produce', 5.00, 100, true, CURRENT_DATE,
    jsonb_build_object(
      to_char(CURRENT_DATE, 'YYYY-MM-DD'),
      '[{"id":"8-12","start":"08:00","end":"12:00"},{"id":"22-24","start":"22:00","end":"23:59"}]'::jsonb
    ),
    jsonb_build_object(
      to_char(CURRENT_DATE, 'YYYY-MM-DD'),
      '[{"id":"9-23","start":"09:00","end":"23:00"}]'::jsonb
    ),
    jsonb_build_array(to_char(CURRENT_DATE, 'YYYY-MM-DD'))
  );

  -- Product with YESTERDAY's windows (expired, but within 24hr grace)
  INSERT INTO market_products (
    id, seller_id, name, category, price_usd, inventory, is_active, market_date,
    product_delivery_windows, product_pickup_windows, window_dates
  ) VALUES (
    'dd390001-0000-0000-0000-000000000002',
    v_seller_id, 'Yesterday Tomatoes', 'produce', 5.00, 100, true, CURRENT_DATE - 1,
    jsonb_build_object(
      to_char(CURRENT_DATE - 1, 'YYYY-MM-DD'),
      '[{"id":"14-23","start":"14:00","end":"23:00"}]'::jsonb
    ),
    jsonb_build_object(
      to_char(CURRENT_DATE - 1, 'YYYY-MM-DD'),
      '[{"id":"14-22","start":"14:00","end":"22:00"}]'::jsonb
    ),
    jsonb_build_array(to_char(CURRENT_DATE - 1, 'YYYY-MM-DD'))
  );

  -- Product with windows from 2 DAYS AGO (24hr grace fully expired)
  INSERT INTO market_products (
    id, seller_id, name, category, price_usd, inventory, is_active, market_date,
    product_delivery_windows, product_pickup_windows, window_dates
  ) VALUES (
    'dd390001-0000-0000-0000-000000000003',
    v_seller_id, 'Old Tomatoes', 'produce', 5.00, 100, true, CURRENT_DATE - 2,
    jsonb_build_object(
      to_char(CURRENT_DATE - 2, 'YYYY-MM-DD'),
      '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb
    ),
    jsonb_build_object(
      to_char(CURRENT_DATE - 2, 'YYYY-MM-DD'),
      '[{"id":"9-11","start":"09:00","end":"11:00"}]'::jsonb
    ),
    jsonb_build_array(to_char(CURRENT_DATE - 2, 'YYYY-MM-DD'))
  );
END $$;


-- ──────────────────────────────────────
-- T1: _get_latest_window_end helper exists
-- ──────────────────────────────────────
SELECT has_function(
  'public', '_get_latest_window_end',
  '_get_latest_window_end function exists'
);

-- T2: Delivery window end = today 23:59
SELECT ok(
  _get_latest_window_end('dd390001-0000-0000-0000-000000000001', 'delivery')
    = (CURRENT_DATE || ' 23:59:00')::TIMESTAMPTZ,
  'Delivery window end is today 23:59'
);

-- T3: Pickup window end = today 23:00
SELECT ok(
  _get_latest_window_end('dd390001-0000-0000-0000-000000000001', 'pickup')
    = (CURRENT_DATE || ' 23:00:00')::TIMESTAMPTZ,
  'Pickup window end is today 23:00'
);

-- T4: Yesterday product returns yesterday 23:00
SELECT ok(
  _get_latest_window_end('dd390001-0000-0000-0000-000000000002', 'delivery')
    = ((CURRENT_DATE - 1) || ' 23:00:00')::TIMESTAMPTZ,
  'Yesterday product has yesterday window end'
);


-- ──────────────────────────────────────
-- T5: seller_mark_ready_pickup BLOCKS after window expiry
-- ──────────────────────────────────────
DO $$
DECLARE v_booth UUID;
BEGIN
  SELECT id INTO v_booth FROM market_booths WHERE owner_id = 'a1111111-1111-1111-1111-111111111111' LIMIT 1;
  INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, total_usd, fulfillment_type, status)
  VALUES ('ee390001-0000-0000-0000-000000000001',
    'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111',
    v_booth, 'dd390001-0000-0000-0000-000000000002',
    'Yesterday Tomatoes', 2, 5.00, 10.00, 10.00, 'pickup', 'pending');
END $$;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claim.sub = 'a1111111-1111-1111-1111-111111111111';

SELECT ok(
  (seller_mark_ready_pickup('ee390001-0000-0000-0000-000000000001') ->> 'error')
    = 'Pickup window has expired. You can no longer mark this order as ready.',
  'seller_mark_ready_pickup blocks after window expires'
);

RESET role;
RESET request.jwt.claim.sub;


-- ──────────────────────────────────────
-- T6-T8: seller_mark_ready_pickup SUCCEEDS before window expiry
-- ──────────────────────────────────────
DO $$
DECLARE v_booth UUID;
BEGIN
  SELECT id INTO v_booth FROM market_booths WHERE owner_id = 'a1111111-1111-1111-1111-111111111111' LIMIT 1;
  INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, total_usd, fulfillment_type, status)
  VALUES ('ee390001-0000-0000-0000-000000000002',
    'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111',
    v_booth, 'dd390001-0000-0000-0000-000000000001',
    'Today Tomatoes', 2, 5.00, 10.00, 10.00, 'pickup', 'pending');
END $$;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claim.sub = 'a1111111-1111-1111-1111-111111111111';

SELECT ok(
  (seller_mark_ready_pickup('ee390001-0000-0000-0000-000000000002') ->> 'success') = 'true',
  'seller_mark_ready_pickup succeeds before window expires'
);

RESET role;
RESET request.jwt.claim.sub;

-- T7: auto_complete_at = pickup_window_end + 24hr
SELECT ok(
  (SELECT auto_complete_at = (CURRENT_DATE || ' 23:00:00')::TIMESTAMPTZ + interval '24 hours'
   FROM market_orders WHERE id = 'ee390001-0000-0000-0000-000000000002'),
  'Pickup auto_complete_at = window_end + 24hr'
);

-- T8: status is delivered
SELECT ok(
  (SELECT status = 'delivered' FROM market_orders WHERE id = 'ee390001-0000-0000-0000-000000000002'),
  'Pickup order status is delivered after mark ready'
);


-- ──────────────────────────────────────
-- T9-T10: On-time delivery → 4hr auto_complete_at
-- ──────────────────────────────────────
DO $$
DECLARE v_booth UUID;
BEGIN
  SELECT id INTO v_booth FROM market_booths WHERE owner_id = 'a1111111-1111-1111-1111-111111111111' LIMIT 1;
  INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, total_usd, fulfillment_type, status)
  VALUES ('ee390001-0000-0000-0000-000000000003',
    'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111',
    v_booth, 'dd390001-0000-0000-0000-000000000001',
    'Today Tomatoes', 1, 5.00, 5.00, 5.00, 'delivery', 'pending');
END $$;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claim.sub = 'a1111111-1111-1111-1111-111111111111';

SELECT ok(
  (seller_mark_delivered('ee390001-0000-0000-0000-000000000003') ->> 'is_late') = 'false',
  'On-time delivery detected as not late'
);

RESET role;
RESET request.jwt.claim.sub;

-- T10: Has 4hr auto_complete_at
SELECT ok(
  (SELECT auto_complete_at IS NOT NULL
    AND auto_complete_at <= now() + interval '4 hours 1 minute'
   FROM market_orders WHERE id = 'ee390001-0000-0000-0000-000000000003'),
  'On-time delivery has 4hr auto_complete_at'
);


-- ──────────────────────────────────────
-- T11-T12: Late delivery → NULL auto_complete_at (buyer must confirm)
-- ──────────────────────────────────────
DO $$
DECLARE v_booth UUID;
BEGIN
  SELECT id INTO v_booth FROM market_booths WHERE owner_id = 'a1111111-1111-1111-1111-111111111111' LIMIT 1;
  INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, total_usd, fulfillment_type, status)
  VALUES ('ee390001-0000-0000-0000-000000000004',
    'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111',
    v_booth, 'dd390001-0000-0000-0000-000000000002',
    'Yesterday Tomatoes', 1, 5.00, 5.00, 5.00, 'delivery', 'pending');
END $$;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claim.sub = 'a1111111-1111-1111-1111-111111111111';

SELECT ok(
  (seller_mark_delivered('ee390001-0000-0000-0000-000000000004') ->> 'is_late') = 'true',
  'Late delivery detected as late'
);

RESET role;
RESET request.jwt.claim.sub;

-- T12: NULL auto_complete_at
SELECT ok(
  (SELECT auto_complete_at IS NULL FROM market_orders WHERE id = 'ee390001-0000-0000-0000-000000000004'),
  'Late delivery has NULL auto_complete_at — buyer must confirm'
);


-- ──────────────────────────────────────
-- T13: Delivery BLOCKED after 24hr grace fully expired
-- ──────────────────────────────────────
DO $$
DECLARE v_booth UUID;
BEGIN
  SELECT id INTO v_booth FROM market_booths WHERE owner_id = 'a1111111-1111-1111-1111-111111111111' LIMIT 1;
  INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, total_usd, fulfillment_type, status)
  VALUES ('ee390001-0000-0000-0000-000000000005',
    'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111',
    v_booth, 'dd390001-0000-0000-0000-000000000003',
    'Old Tomatoes', 1, 5.00, 5.00, 5.00, 'delivery', 'pending');
END $$;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claim.sub = 'a1111111-1111-1111-1111-111111111111';

SELECT ok(
  (seller_mark_delivered('ee390001-0000-0000-0000-000000000005') ->> 'error')
    LIKE '%grace period%expired%',
  'Delivery blocked after 24hr grace expired'
);

RESET role;
RESET request.jwt.claim.sub;


-- ──────────────────────────────────────
-- T14-T15: PATH 1 — On-time delivered past auto_complete_at → auto-COMPLETE
-- ──────────────────────────────────────
DO $$
DECLARE v_booth UUID;
BEGIN
  SELECT id INTO v_booth FROM market_booths WHERE owner_id = 'a1111111-1111-1111-1111-111111111111' LIMIT 1;
  INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, total_usd, fulfillment_type, status,
    delivered_at, auto_complete_at)
  VALUES ('ee390001-0000-0000-0000-000000000010',
    'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111',
    v_booth, 'dd390001-0000-0000-0000-000000000001',
    'Today Tomatoes', 1, 5.00, 5.00, 5.00, 'delivery', 'delivered',
    now() - interval '5 hours', now() - interval '1 hour');
END $$;

SELECT ok(
  auto_complete_delivered_orders() >= 1,
  'PATH 1: On-time delivered orders auto-completed'
);
SELECT ok(
  (SELECT status = 'completed' FROM market_orders WHERE id = 'ee390001-0000-0000-0000-000000000010'),
  'PATH 1: Status is completed'
);


-- ──────────────────────────────────────
-- T16-T17: PATH 2 — Late delivery, NULL auto_complete_at, 24hr grace expired → CANCEL
-- ──────────────────────────────────────
DO $$
DECLARE v_booth UUID;
BEGIN
  SELECT id INTO v_booth FROM market_booths WHERE owner_id = 'a1111111-1111-1111-1111-111111111111' LIMIT 1;
  INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, total_usd, fulfillment_type, status,
    delivered_at, auto_complete_at)
  VALUES ('ee390001-0000-0000-0000-000000000011',
    'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111',
    v_booth, 'dd390001-0000-0000-0000-000000000003',
    'Old Tomatoes', 1, 5.00, 5.00, 5.00, 'delivery', 'delivered',
    now() - interval '36 hours', NULL);
END $$;

SELECT ok(
  auto_complete_delivered_orders() >= 1,
  'PATH 2: Late delivery past grace auto-cancelled'
);
SELECT ok(
  (SELECT status = 'cancelled' FROM market_orders WHERE id = 'ee390001-0000-0000-0000-000000000011'),
  'PATH 2: Status is cancelled'
);


-- ──────────────────────────────────────
-- T18-T19: PATH 3 — Pending delivery, never delivered, grace expired → CANCEL
-- ──────────────────────────────────────
DO $$
DECLARE v_booth UUID;
BEGIN
  SELECT id INTO v_booth FROM market_booths WHERE owner_id = 'a1111111-1111-1111-1111-111111111111' LIMIT 1;
  INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, total_usd, fulfillment_type, status)
  VALUES ('ee390001-0000-0000-0000-000000000012',
    'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111',
    v_booth, 'dd390001-0000-0000-0000-000000000003',
    'Old Tomatoes', 1, 5.00, 5.00, 5.00, 'delivery', 'pending');
END $$;

SELECT ok(
  auto_complete_delivered_orders() >= 1,
  'PATH 3: Pending delivery past grace auto-cancelled'
);
SELECT ok(
  (SELECT status = 'cancelled' FROM market_orders WHERE id = 'ee390001-0000-0000-0000-000000000012'),
  'PATH 3: Status is cancelled'
);


-- ──────────────────────────────────────
-- T20: PATH 4 — Pending pickup, never marked ready, grace expired → CANCEL
-- ──────────────────────────────────────
DO $$
DECLARE v_booth UUID;
BEGIN
  SELECT id INTO v_booth FROM market_booths WHERE owner_id = 'a1111111-1111-1111-1111-111111111111' LIMIT 1;
  INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, total_usd, fulfillment_type, status)
  VALUES ('ee390001-0000-0000-0000-000000000013',
    'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111',
    v_booth, 'dd390001-0000-0000-0000-000000000003',
    'Old Tomatoes', 1, 5.00, 5.00, 5.00, 'pickup', 'pending');
END $$;

SELECT ok(
  auto_complete_delivered_orders() >= 1,
  'PATH 4: Pending pickup past grace auto-cancelled'
);


SELECT * FROM finish();
ROLLBACK;
