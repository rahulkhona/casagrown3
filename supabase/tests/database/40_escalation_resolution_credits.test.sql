-- ============================================================
-- Test 40: Escalation Resolution & User Credits
-- Tests: admin resolution, credit grants, FIFO consumption,
--        credit caps, notification generation, fulfillment verification
-- ============================================================

BEGIN;
SELECT plan(25);

-- ──────────────────────────────────────────────────────────
-- SETUP: Create users, products, orders, disputes
-- ──────────────────────────────────────────────────────────

-- Create auth users
INSERT INTO auth.users (id, email, role) VALUES
  ('aa400001-0000-0000-0000-000000000001'::uuid, 'admin@test.com', 'authenticated'),
  ('aa400001-0000-0000-0000-000000000002'::uuid, 'buyer1@test.com', 'authenticated'),
  ('aa400001-0000-0000-0000-000000000003'::uuid, 'seller1@test.com', 'authenticated'),
  ('aa400001-0000-0000-0000-000000000004'::uuid, 'buyer2@test.com', 'authenticated');

-- Update profiles (auto-created by auth trigger)
UPDATE profiles SET full_name = 'Admin User', email = 'admin@test.com', zip_code = '90210'
  WHERE id = 'aa400001-0000-0000-0000-000000000001'::uuid;
UPDATE profiles SET full_name = 'Test Buyer', email = 'buyer1@test.com', zip_code = '90210'
  WHERE id = 'aa400001-0000-0000-0000-000000000002'::uuid;
UPDATE profiles SET full_name = 'Test Seller', email = 'seller1@test.com', zip_code = '90210'
  WHERE id = 'aa400001-0000-0000-0000-000000000003'::uuid;
UPDATE profiles SET full_name = 'Other Buyer', email = 'buyer2@test.com', zip_code = '90210'
  WHERE id = 'aa400001-0000-0000-0000-000000000004'::uuid;

-- Make admin a staff member
INSERT INTO staff_members (user_id, email, roles) VALUES
  ('aa400001-0000-0000-0000-000000000001'::uuid, 'admin@test.com', '{admin}');

-- Update auto-created booth for seller
UPDATE market_booths
SET name = 'Test Booth', offers_delivery = true, offers_pickup = true, is_open = true
WHERE owner_id = 'aa400001-0000-0000-0000-000000000003'::uuid;

-- Create product with windows
INSERT INTO market_products (id, seller_id, name, price_usd, inventory, is_active,
  product_delivery_windows, product_pickup_windows, category, market_date)
VALUES ('aa400001-a100-0000-0000-000000000001'::uuid,
        'aa400001-0000-0000-0000-000000000003'::uuid,
        'Organic Tomatoes', 12.50, 10, true,
        '{"monday": [{"start": "09:00", "end": "17:00"}]}'::jsonb,
        '{"monday": [{"start": "09:00", "end": "17:00"}]}'::jsonb,
        'produce', CURRENT_DATE);

-- Create order 1 — will be disputed and escalated (full refund)
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id,
  product_name, quantity, unit_price_usd, subtotal_usd, total_usd,
  fulfillment_type, status, platform_fee_pct, platform_fee_usd,
  tax_rate_pct, tax_amount_usd)
VALUES ('aa400001-0a00-0000-0000-000000000001'::uuid,
        'aa400001-0000-0000-0000-000000000002'::uuid,
        'aa400001-0000-0000-0000-000000000003'::uuid,
        (SELECT id FROM market_booths WHERE owner_id = 'aa400001-0000-0000-0000-000000000003'::uuid),
        'aa400001-a100-0000-0000-000000000001'::uuid,
        'Organic Tomatoes', 2, 12.50, 25.00, 25.00,
        'delivery', 'escalated', 10, 2.50, 0, 0);

-- Create order 2 — will be disputed (credit to buyer)
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id,
  product_name, quantity, unit_price_usd, subtotal_usd, total_usd,
  fulfillment_type, status, platform_fee_pct, platform_fee_usd,
  tax_rate_pct, tax_amount_usd)
VALUES ('aa400001-0a00-0000-0000-000000000002'::uuid,
        'aa400001-0000-0000-0000-000000000002'::uuid,
        'aa400001-0000-0000-0000-000000000003'::uuid,
        (SELECT id FROM market_booths WHERE owner_id = 'aa400001-0000-0000-0000-000000000003'::uuid),
        'aa400001-a100-0000-0000-000000000001'::uuid,
        'Organic Tomatoes', 1, 12.50, 12.50, 12.50,
        'pickup', 'escalated', 10, 1.25, 0, 0);

-- Create order 3 — will be disputed (no action)
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id,
  product_name, quantity, unit_price_usd, subtotal_usd, total_usd,
  fulfillment_type, status, platform_fee_pct, platform_fee_usd,
  tax_rate_pct, tax_amount_usd)
VALUES ('aa400001-0a00-0000-0000-000000000003'::uuid,
        'aa400001-0000-0000-0000-000000000002'::uuid,
        'aa400001-0000-0000-0000-000000000003'::uuid,
        (SELECT id FROM market_booths WHERE owner_id = 'aa400001-0000-0000-0000-000000000003'::uuid),
        'aa400001-a100-0000-0000-000000000001'::uuid,
        'Organic Tomatoes', 1, 12.50, 12.50, 12.50,
        'delivery', 'disputed', 10, 1.25, 0, 0);

-- Create order 4 — future order for credit consumption test
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id,
  product_name, quantity, unit_price_usd, subtotal_usd, total_usd,
  fulfillment_type, status, platform_fee_pct, platform_fee_usd,
  tax_rate_pct, tax_amount_usd)
VALUES ('aa400001-0a00-0000-0000-000000000004'::uuid,
        'aa400001-0000-0000-0000-000000000002'::uuid,
        'aa400001-0000-0000-0000-000000000003'::uuid,
        (SELECT id FROM market_booths WHERE owner_id = 'aa400001-0000-0000-0000-000000000003'::uuid),
        'aa400001-a100-0000-0000-000000000001'::uuid,
        'Organic Tomatoes', 4, 12.50, 50.00, 50.00,
        'delivery', 'pending', 10, 5.00, 0, 0);

-- Create disputes for orders 1, 2, 3
INSERT INTO order_disputes (id, order_id, initiated_by, reason, status)
VALUES
  ('aa400001-d000-0000-0000-000000000001'::uuid,
   'aa400001-0a00-0000-0000-000000000001'::uuid,
   'aa400001-0000-0000-0000-000000000002'::uuid,
   'Product was damaged', 'open'),
  ('aa400001-d000-0000-0000-000000000002'::uuid,
   'aa400001-0a00-0000-0000-000000000002'::uuid,
   'aa400001-0000-0000-0000-000000000002'::uuid,
   'Never received', 'open'),
  ('aa400001-d000-0000-0000-000000000003'::uuid,
   'aa400001-0a00-0000-0000-000000000003'::uuid,
   'aa400001-0000-0000-0000-000000000002'::uuid,
   'Wrong color packaging', 'open');


-- ──────────────────────────────────────────────────────────
-- TEST 1–3: Tables and types exist
-- ──────────────────────────────────────────────────────────

SELECT has_table('user_credits', 'user_credits table exists');
SELECT has_table('credit_usage_log', 'credit_usage_log table exists');
SELECT has_column('market_orders', 'credit_applied_usd',
  'market_orders has credit_applied_usd column');


-- ──────────────────────────────────────────────────────────
-- TEST 4: Non-staff cannot resolve escalation
-- ──────────────────────────────────────────────────────────

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aa400001-0000-0000-0000-000000000002';
SELECT results_eq(
  $$SELECT (admin_resolve_escalation(
    'aa400001-0a00-0000-0000-000000000001'::uuid,
    'refund_full'::escalation_resolution_type,
    'Test reason'
  ))->>'error'$$,
  ARRAY['Staff access required'],
  'Non-staff user cannot resolve escalation'
);
RESET role; RESET request.jwt.claim.sub;


-- ──────────────────────────────────────────────────────────
-- TEST 5–7: Full refund resolution
-- ──────────────────────────────────────────────────────────

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aa400001-0000-0000-0000-000000000001';

SELECT results_eq(
  $$SELECT (admin_resolve_escalation(
    'aa400001-0a00-0000-0000-000000000001'::uuid,
    'refund_full'::escalation_resolution_type,
    'Product was clearly damaged in photos'
  ))->>'success'$$,
  ARRAY['true'],
  'Admin can resolve with full refund'
);
RESET role; RESET request.jwt.claim.sub;

SELECT results_eq(
  $$SELECT status::text FROM market_orders WHERE id = 'aa400001-0a00-0000-0000-000000000001'$$,
  ARRAY['resolved'],
  'Order status is resolved after full refund'
);

SELECT results_eq(
  $$SELECT status::text FROM order_disputes WHERE id = 'aa400001-d000-0000-0000-000000000001'$$,
  ARRAY['staff_resolved'],
  'Dispute status is staff_resolved after full refund'
);


-- ──────────────────────────────────────────────────────────
-- TEST 8–10: Credit to buyer resolution
-- ──────────────────────────────────────────────────────────

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aa400001-0000-0000-0000-000000000001';

SELECT results_eq(
  $$SELECT (admin_resolve_escalation(
    'aa400001-0a00-0000-0000-000000000002'::uuid,
    'credit_buyer'::escalation_resolution_type,
    'Issuing $5 credit as goodwill',
    NULL, 5.00, 'purchase'::credit_type, 20
  ))->>'success'$$,
  ARRAY['true'],
  'Admin can resolve with credit to buyer'
);
RESET role; RESET request.jwt.claim.sub;

SELECT results_eq(
  $$SELECT COUNT(*)::int FROM user_credits
    WHERE user_id = 'aa400001-0000-0000-0000-000000000002'
      AND source = 'escalation_resolution'$$,
  ARRAY[1],
  'Credit record created for buyer'
);

SELECT results_eq(
  $$SELECT remaining_usd::text FROM user_credits
    WHERE user_id = 'aa400001-0000-0000-0000-000000000002'
      AND source = 'escalation_resolution'$$,
  ARRAY['5.00'],
  'Credit has correct remaining amount'
);


-- ──────────────────────────────────────────────────────────
-- TEST 11–12: No action resolution
-- ──────────────────────────────────────────────────────────

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aa400001-0000-0000-0000-000000000001';

SELECT results_eq(
  $$SELECT (admin_resolve_escalation(
    'aa400001-0a00-0000-0000-000000000003'::uuid,
    'no_action'::escalation_resolution_type,
    'Seller provided adequate proof of delivery'
  ))->>'success'$$,
  ARRAY['true'],
  'Admin can resolve with no action'
);
RESET role; RESET request.jwt.claim.sub;

SELECT results_eq(
  $$SELECT staff_decision FROM order_disputes
    WHERE id = 'aa400001-d000-0000-0000-000000000003'$$,
  ARRAY['no_action'],
  'Dispute records no_action staff decision'
);


-- ──────────────────────────────────────────────────────────
-- TEST 13–14: Admin dispute comment
-- ──────────────────────────────────────────────────────────

-- Create a new unresolved dispute for comment testing
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id,
  product_name, quantity, unit_price_usd, subtotal_usd, total_usd,
  fulfillment_type, status, platform_fee_pct, platform_fee_usd,
  tax_rate_pct, tax_amount_usd)
VALUES ('aa400001-0a00-0000-0000-000000000005'::uuid,
        'aa400001-0000-0000-0000-000000000004'::uuid,
        'aa400001-0000-0000-0000-000000000003'::uuid,
        (SELECT id FROM market_booths WHERE owner_id = 'aa400001-0000-0000-0000-000000000003'::uuid),
        'aa400001-a100-0000-0000-000000000001'::uuid,
        'Organic Tomatoes', 1, 12.50, 12.50, 12.50,
        'delivery', 'escalated', 10, 1.25, 0, 0);

INSERT INTO order_disputes (id, order_id, initiated_by, reason, status)
VALUES ('aa400001-d000-0000-0000-000000000005'::uuid,
        'aa400001-0a00-0000-0000-000000000005'::uuid,
        'aa400001-0000-0000-0000-000000000004'::uuid,
        'Quality issue', 'open');

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aa400001-0000-0000-0000-000000000001';

SELECT results_eq(
  $$SELECT (admin_add_dispute_comment(
    'aa400001-d000-0000-0000-000000000005'::uuid,
    'Please provide photos of the damaged product',
    'buyer'
  ))->>'success'$$,
  ARRAY['true'],
  'Admin can add dispute comment requesting buyer info'
);
RESET role; RESET request.jwt.claim.sub;

SELECT results_eq(
  $$SELECT COUNT(*)::int FROM order_dispute_messages
    WHERE dispute_id = 'aa400001-d000-0000-0000-000000000005'$$,
  ARRAY[1],
  'Comment was inserted into dispute messages'
);


-- ──────────────────────────────────────────────────────────
-- TEST 15–16: Credit balance check
-- ──────────────────────────────────────────────────────────

SELECT results_eq(
  $$SELECT (get_user_credit_balance('aa400001-0000-0000-0000-000000000002'::uuid))
    ->>'purchase_credits_usd'$$,
  ARRAY['5.00'],
  'Credit balance shows correct purchase credits'
);

SELECT results_eq(
  $$SELECT (get_user_credit_balance('aa400001-0000-0000-0000-000000000002'::uuid))
    ->>'total_credits_usd'$$,
  ARRAY['5.00'],
  'Total credit balance is correct'
);


-- ──────────────────────────────────────────────────────────
-- TEST 17–19: FIFO credit consumption at checkout
-- ──────────────────────────────────────────────────────────

SELECT results_eq(
  $$SELECT apply_credits_to_order(
    'aa400001-0a00-0000-0000-000000000004'::uuid,
    'aa400001-0000-0000-0000-000000000002'::uuid
  )::text$$,
  ARRAY['5.00'],
  'Credits applied to order (capped by remaining balance, not % because 20% of $50 = $10 > $5)'
);

SELECT results_eq(
  $$SELECT credit_applied_usd::text FROM market_orders
    WHERE id = 'aa400001-0a00-0000-0000-000000000004'$$,
  ARRAY['5.00'],
  'Order records credit_applied_usd correctly'
);

SELECT results_eq(
  $$SELECT remaining_usd::text FROM user_credits
    WHERE user_id = 'aa400001-0000-0000-0000-000000000002'
      AND source = 'escalation_resolution'$$,
  ARRAY['0.00'],
  'Credit fully consumed after usage'
);


-- ──────────────────────────────────────────────────────────
-- TEST 20: Credit usage log recorded
-- ──────────────────────────────────────────────────────────

SELECT results_eq(
  $$SELECT amount_usd::text FROM credit_usage_log
    WHERE order_id = 'aa400001-0a00-0000-0000-000000000004'$$,
  ARRAY['5.00'],
  'Credit usage log records correct amount'
);


-- ──────────────────────────────────────────────────────────
-- TEST 21–22: Credit % cap enforcement
-- ──────────────────────────────────────────────────────────

-- Give buyer a large credit with 10% cap
INSERT INTO user_credits (user_id, amount_usd, remaining_usd, credit_type,
  max_pct_per_txn, source, reason, granted_by)
VALUES ('aa400001-0000-0000-0000-000000000004'::uuid,
        100.00, 100.00, 'purchase', 10,
        'escalation_resolution', 'Test large credit',
        'aa400001-0000-0000-0000-000000000001'::uuid);

-- Create order for other buyer ($50)
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id,
  product_name, quantity, unit_price_usd, subtotal_usd, total_usd,
  fulfillment_type, status, platform_fee_pct, platform_fee_usd,
  tax_rate_pct, tax_amount_usd)
VALUES ('aa400001-0a00-0000-0000-000000000006'::uuid,
        'aa400001-0000-0000-0000-000000000004'::uuid,
        'aa400001-0000-0000-0000-000000000003'::uuid,
        (SELECT id FROM market_booths WHERE owner_id = 'aa400001-0000-0000-0000-000000000003'::uuid),
        'aa400001-a100-0000-0000-000000000001'::uuid,
        'Organic Tomatoes', 4, 12.50, 50.00, 50.00,
        'delivery', 'pending', 10, 5.00, 0, 0);

SELECT results_eq(
  $$SELECT apply_credits_to_order(
    'aa400001-0a00-0000-0000-000000000006'::uuid,
    'aa400001-0000-0000-0000-000000000004'::uuid
  )::text$$,
  ARRAY['5.00'],
  'Credit capped at 10% of $50 = $5 despite $100 available'
);

SELECT results_eq(
  $$SELECT remaining_usd::text FROM user_credits
    WHERE user_id = 'aa400001-0000-0000-0000-000000000004'$$,
  ARRAY['95.00'],
  'Only $5 consumed from $100 credit due to % cap'
);


-- ──────────────────────────────────────────────────────────
-- TEST 23: Cannot resolve already resolved dispute
-- ──────────────────────────────────────────────────────────

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aa400001-0000-0000-0000-000000000001';

SELECT results_eq(
  $$SELECT (admin_resolve_escalation(
    'aa400001-0a00-0000-0000-000000000001'::uuid,
    'refund_full'::escalation_resolution_type,
    'Try again'
  ))->>'error'$$,
  ARRAY['Order must be in disputed or escalated status'],
  'Cannot resolve already-resolved order'
);
RESET role; RESET request.jwt.claim.sub;


-- ──────────────────────────────────────────────────────────
-- TEST 24: Notifications generated for resolution
-- ──────────────────────────────────────────────────────────

SELECT results_eq(
  $$SELECT COUNT(*)::int FROM market_notifications
    WHERE user_id = 'aa400001-0000-0000-0000-000000000002'
      AND content LIKE '%dispute%'$$,
  ARRAY[6],  -- 3 resolutions notifying buyer + admin comment notifications + credit notification
  'Buyer received dispute notifications'
);


-- ──────────────────────────────────────────────────────────
-- TEST 25: Admin list RPC returns data
-- ──────────────────────────────────────────────────────────

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aa400001-0000-0000-0000-000000000001';

SELECT cmp_ok(
  jsonb_array_length(get_escalated_orders_admin())::int, '>=', 4,
  'Admin list returns all disputes'
);
RESET role; RESET request.jwt.claim.sub;


SELECT * FROM finish();
ROLLBACK;
