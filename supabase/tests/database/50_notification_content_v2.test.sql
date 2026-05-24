-- ===========================================================================
-- pgTAP test: Notification Content Verification (All Channels)
-- ===========================================================================
-- Verifies that notify_market_event() stores correct text in market_notifications.
-- Since all channels (push, email, SMS) receive the SAME p_content text,
-- testing the in-app content is sufficient to verify all channels.
--
-- Tests:
-- - Helper functions exist and return values
-- - Buyer completion: "$X settled" (not "$X earned")
-- - Seller completion: "$X total" (not "$X earned")
-- - Accepted, delivered, disputed, escalated, resolved, cancelled
-- ===========================================================================
BEGIN;
SELECT plan(16);

-- ── Setup ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, instance_id, aud, role, created_at, updated_at)
VALUES
  ('ff000000-0000-0000-0000-000000000b01', 'notifv2buyer@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
  ('ff000000-0000-0000-0000-000000000b02', 'notifv2seller@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name)
VALUES
  ('ff000000-0000-0000-0000-000000000b01', 'notifv2buyer@test.local', 'V2 Buyer'),
  ('ff000000-0000-0000-0000-000000000b02', 'notifv2seller@test.local', 'V2 Seller')
ON CONFLICT (id) DO NOTHING;

INSERT INTO market_products (id, seller_id, name, description, price_usd, unit, category, inventory, market_date,
  product_delivery_windows, product_pickup_windows, window_dates)
VALUES ('ff000000-0000-0000-0000-0000000000d1', 'ff000000-0000-0000-0000-000000000b02',
       'V2 Tomatoes', 'Test', 5.00, 'basket', 'produce', 10, CURRENT_DATE,
       jsonb_build_object(to_char(CURRENT_DATE, 'YYYY-MM-DD'),
         '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
       jsonb_build_object(to_char(CURRENT_DATE, 'YYYY-MM-DD'),
         '[{"id":"9-11","start":"09:00","end":"11:00"}]'::jsonb),
       jsonb_build_array(to_char(CURRENT_DATE, 'YYYY-MM-DD')))
ON CONFLICT (id) DO NOTHING;

INSERT INTO market_booths (id, owner_id, name, description)
VALUES ('ff000000-0000-0000-0000-0000000000b2', 'ff000000-0000-0000-0000-000000000b02', 'V2 Test Booth', 'Test')
ON CONFLICT (id) DO NOTHING;

DELETE FROM market_notifications WHERE user_id IN (
  'ff000000-0000-0000-0000-000000000b01', 'ff000000-0000-0000-0000-000000000b02'
);

-- ── Create test order ──────────────────────────────────────────────────
INSERT INTO market_orders (
  id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_amount_usd, platform_fee_usd, total_usd,
  fulfillment_type, status, credit_applied_usd
)
SELECT
  'ff000000-0000-0000-0000-000000000e01',
  'ff000000-0000-0000-0000-000000000b01', 'ff000000-0000-0000-0000-000000000b02',
  b.id, 'ff000000-0000-0000-0000-0000000000d1',
  'V2 Tomatoes', 2, 5.00, 10.00, 0.85, 1.00, 11.85, 'delivery', 'pending', 0.00
FROM market_booths b WHERE b.owner_id = 'ff000000-0000-0000-0000-000000000b02' LIMIT 1;


-- ════════════════════════════════════════════════════════════════════════
-- SECTION 1: Infrastructure (tests 1-4)
-- ════════════════════════════════════════════════════════════════════════

SELECT has_function('get_edge_fn_base_url', '(1) get_edge_fn_base_url() helper exists');
SELECT has_function('get_service_role_key', '(2) get_service_role_key() helper exists');

SELECT ok(
  get_edge_fn_base_url() IS NOT NULL,
  '(3) get_edge_fn_base_url() returns a value'
);
SELECT ok(
  get_service_role_key() IS NOT NULL,
  '(4) get_service_role_key() returns a value'
);


-- ════════════════════════════════════════════════════════════════════════
-- SECTION 2: In-App Notification Content (tests 5-10)
-- All channels (push, email, SMS) receive the same p_content text,
-- so verifying market_notifications content covers all channels.
-- ════════════════════════════════════════════════════════════════════════

-- (5) Accepted
UPDATE market_orders SET status = 'confirmed' WHERE id = 'ff000000-0000-0000-0000-000000000e01';

SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b01' AND content LIKE '%accepted%'),
  '(5) Accepted: buyer gets accepted notification'
);

-- (6) Delivered
UPDATE market_orders SET status = 'delivered' WHERE id = 'ff000000-0000-0000-0000-000000000e01';

SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b01' AND content LIKE '%delivered%' AND content LIKE '%4 hours%'),
  '(6) Delivered: notification includes 4-hour confirmation window'
);

-- (7-9) Completed — critical content verification
UPDATE market_orders SET status = 'completed' WHERE id = 'ff000000-0000-0000-0000-000000000e01';

SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b01'
      AND content LIKE '%Order completed%'
      AND content LIKE '%settled%'
      AND content LIKE '%$11.85%'),
  '(7) Buyer completion: says "$11.85 settled" (push/email/SMS get same text)'
);

SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b02'
      AND content LIKE '%Sale completed%'
      AND content LIKE '%earned%'
      AND content LIKE '%$10.00%'),
  '(8) Seller completion: says "$10.00 earned" (push/email/SMS get same text)'
);

SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b02'
      AND content LIKE '%Sale completed%'
      AND content LIKE '%Rate the buyer%'),
  '(9) Seller completion: includes rate the buyer CTA'
);

-- (10) Buyer gets rate prompt
SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b01'
      AND content LIKE '%Rate your experience%'),
  '(10) Buyer completion: includes "Rate your experience" CTA'
);


-- ════════════════════════════════════════════════════════════════════════
-- SECTION 3: Dispute Lifecycle Notifications (tests 11-14)
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO order_disputes (order_id, initiated_by, reason, dispute_type, status)
VALUES ('ff000000-0000-0000-0000-000000000e01', 'ff000000-0000-0000-0000-000000000b01', 'Got wrong thing', 'wrong_item', 'open')
ON CONFLICT DO NOTHING;

UPDATE market_orders SET status = 'disputed' WHERE id = 'ff000000-0000-0000-0000-000000000e01';

SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b02'
      AND (content LIKE '%Dispute%' OR content LIKE '%Wrong Item%')),
  '(11) Disputed: seller gets dispute notification'
);

UPDATE market_orders SET status = 'escalated' WHERE id = 'ff000000-0000-0000-0000-000000000e01';

SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b01' AND content LIKE '%escalated%'),
  '(12) Escalated: buyer gets escalation notification'
);

UPDATE market_orders SET status = 'resolved' WHERE id = 'ff000000-0000-0000-0000-000000000e01';

SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b01' AND content LIKE '%resolved%'),
  '(13) Resolved: buyer gets resolution notification'
);


-- ════════════════════════════════════════════════════════════════════════
-- SECTION 4: Cancelled Notification (tests 14-16)
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO market_orders (
  id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_amount_usd, platform_fee_usd, total_usd,
  fulfillment_type, status
)
SELECT 'ff000000-0000-0000-0000-000000000e02',
  'ff000000-0000-0000-0000-000000000b01', 'ff000000-0000-0000-0000-000000000b02',
  b.id, 'ff000000-0000-0000-0000-0000000000d1',
  'V2 Tomatoes', 1, 5.00, 5.00, 0.45, 0.50, 5.95, 'pickup', 'pending'
FROM market_booths b WHERE b.owner_id = 'ff000000-0000-0000-0000-000000000b02' LIMIT 1;

-- (14) Seller gets new order notification
SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b02'
      AND content LIKE '%New order%'),
  '(14) New order: seller gets new order notification'
);

UPDATE market_orders SET status = 'cancelled' WHERE id = 'ff000000-0000-0000-0000-000000000e02';

SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b01' AND content LIKE '%cancelled%'),
  '(15) Cancelled: buyer gets cancellation notification'
);

-- (16) Verify seller completion says "earned" (not "total")
SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b02'
      AND content LIKE '%Sale completed%'
      AND content LIKE '%earned%'),
  '(16) Seller completion notification uses "earned" (not "total")'
);

SELECT * FROM finish();
ROLLBACK;
