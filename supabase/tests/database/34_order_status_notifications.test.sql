-- ===========================================================================
-- pgTAP test: Order Status Notifications
-- Tests both INSERT trigger (order placed) and UPDATE trigger (status changes)
-- ===========================================================================
BEGIN;
SELECT plan(20);

-- ── Setup ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, instance_id, aud, role, created_at, updated_at)
VALUES
  ('ff000000-0000-0000-0000-000000000a01', 'notifbuyer@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
  ('ff000000-0000-0000-0000-000000000a02', 'notifseller@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name)
VALUES
  ('ff000000-0000-0000-0000-000000000a01', 'notifbuyer@test.local', 'Notif Buyer'),
  ('ff000000-0000-0000-0000-000000000a02', 'notifseller@test.local', 'Notif Seller')
ON CONFLICT (id) DO NOTHING;

-- Product (no booth_id on market_products)
INSERT INTO market_products (id, seller_id, name, description, price_usd, unit, category, inventory, market_date)
VALUES ('ff000000-0000-0000-0000-0000000000c1', 'ff000000-0000-0000-0000-000000000a02',
       'Test Tomatoes', 'Ripe', 5.00, 'basket', 'produce', 10, CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

-- Ensure seller has a booth
INSERT INTO market_booths (owner_id, name, description)
VALUES ('ff000000-0000-0000-0000-000000000a02', 'Notif Test Booth', 'Test')
ON CONFLICT (owner_id) DO NOTHING;

DELETE FROM market_notifications WHERE user_id IN (
  'ff000000-0000-0000-0000-000000000a01', 'ff000000-0000-0000-0000-000000000a02'
);

-- ── Orders (INSERT fires trg_market_order_placed_notification) ─────────
INSERT INTO market_orders (
  id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_amount_usd, platform_fee_usd, total_usd,
  fulfillment_type, status
)
SELECT
  'ff000000-0000-0000-0000-000000000d01',
  'ff000000-0000-0000-0000-000000000a01', 'ff000000-0000-0000-0000-000000000a02',
  b.id, 'ff000000-0000-0000-0000-0000000000c1',
  'Test Tomatoes', 2, 5.00, 10.00, 0.85, 1.00, 11.85, 'delivery', 'pending'
FROM market_booths b WHERE b.owner_id = 'ff000000-0000-0000-0000-000000000a02';

INSERT INTO market_orders (
  id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_amount_usd, platform_fee_usd, total_usd,
  fulfillment_type, status
)
SELECT
  'ff000000-0000-0000-0000-000000000d02',
  'ff000000-0000-0000-0000-000000000a01', 'ff000000-0000-0000-0000-000000000a02',
  b.id, 'ff000000-0000-0000-0000-0000000000c1',
  'Test Tomatoes', 1, 5.00, 5.00, 0.45, 0.50, 5.95, 'pickup', 'pending'
FROM market_booths b WHERE b.owner_id = 'ff000000-0000-0000-0000-000000000a02';

-- ── (1-2) ORDER PLACED — INSERT trigger fires ─────────────────────────
SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000a02' AND content LIKE '%New order%'),
  'Order placed: seller gets new-order notification on INSERT'
);

SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000a02'
      AND link_url = '/orders/ff000000-0000-0000-0000-000000000d01'),
  'Order placed: notification deep-links to the order'
);

-- ── (3) Delivered — delivery ───────────────────────────────────────────
UPDATE market_orders SET status = 'delivered' WHERE id = 'ff000000-0000-0000-0000-000000000d01';

SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000a01' AND content LIKE '%delivered%'),
  'Delivery order: buyer gets delivered notification'
);

-- ── (4) Delivered — pickup ─────────────────────────────────────────────
UPDATE market_orders SET status = 'delivered' WHERE id = 'ff000000-0000-0000-0000-000000000d02';

SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000a01' AND content LIKE '%ready for pickup%'),
  'Pickup order: buyer gets ready-for-pickup notification'
);

-- ── (5) Completed — buyer ──────────────────────────────────────────────
UPDATE market_orders SET status = 'completed' WHERE id = 'ff000000-0000-0000-0000-000000000d01';

SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000a01' AND content LIKE '%Order completed%'),
  'Completed: buyer gets completion notification'
);

-- ── (6) Completed — seller ─────────────────────────────────────────────
SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000a02' AND content LIKE '%Sale completed%'),
  'Completed: seller gets sale completed notification'
);

-- ── (7) Cancelled ──────────────────────────────────────────────────────
UPDATE market_orders SET status = 'cancelled' WHERE id = 'ff000000-0000-0000-0000-000000000d02';

SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000a01' AND content LIKE '%cancelled%'),
  'Cancelled: buyer gets cancellation notification'
);

-- ── (8-9) Deep links ───────────────────────────────────────────────────
SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000a01'
      AND link_url = '/orders/ff000000-0000-0000-0000-000000000d01'),
  'Notification deep-links to delivery order'
);

SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000a01'
      AND link_url = '/orders/ff000000-0000-0000-0000-000000000d02'),
  'Notification deep-links to pickup order'
);

-- ── (10-13) Infrastructure ─────────────────────────────────────────────
SELECT has_function('notify_market_event');
SELECT has_trigger('market_orders', 'trg_market_order_status_notifications');
SELECT has_trigger('market_orders', 'trg_market_order_placed_notification');
SELECT has_table('market_notifications');

-- ── (14-16) Notification counts ────────────────────────────────────────
SELECT ok(
  (SELECT count(*) FROM market_notifications WHERE user_id = 'ff000000-0000-0000-0000-000000000a01') >= 4,
  'Buyer received at least 4 notifications'
);

SELECT ok(
  (SELECT count(*) FROM market_notifications WHERE user_id = 'ff000000-0000-0000-0000-000000000a02') >= 3,
  'Seller received at least 3 notifications (2 order-placed + 1 sale-completed)'
);

-- Verify the order-placed notifications mention the product
SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000a02'
      AND content LIKE '%Tomatoes%'),
  'Order-placed notification includes product name'
);

-- ── (17) Delivery notification includes "4 hours" ─────────────────────
SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000a01'
      AND content LIKE '%4 hours%'),
  'Delivery notification includes 4-hour confirmation window'
);

-- ── (18-20) Decline flow ──────────────────────────────────────────────
-- Reset pickup order to pending for decline test
UPDATE market_orders SET status = 'pending'
WHERE id = 'ff000000-0000-0000-0000-000000000d02';

DELETE FROM market_notifications WHERE user_id = 'ff000000-0000-0000-0000-000000000a01'
  AND content LIKE '%cancelled%';

-- Decline as seller
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000a02","role":"authenticated"}';

SELECT ok(
  (seller_decline_order('ff000000-0000-0000-0000-000000000d02'::uuid, 'Out of stock')->>'success')::boolean,
  '(18) seller_decline_order succeeds'
);

SELECT ok(
  (SELECT status FROM market_orders WHERE id = 'ff000000-0000-0000-0000-000000000d02') = 'cancelled',
  '(19) Declined order status is cancelled (not declined)'
);

-- (20) No stale rows in legacy notifications table for these users
SELECT ok(
  NOT EXISTS(SELECT 1 FROM notifications
    WHERE user_id IN ('ff000000-0000-0000-0000-000000000a01', 'ff000000-0000-0000-0000-000000000a02')
      AND created_at >= now() - INTERVAL '1 minute'),
  '(20) No stale notifications in legacy table'
);

SELECT * FROM finish();
ROLLBACK;
