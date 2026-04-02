-- ===========================================================================
-- pgTAP test: Dispute Refund Flow & Rating Re-rating
-- Tests seller refund offers, buyer acceptance/rejection, and re-rating
-- ===========================================================================
BEGIN;
SELECT plan(20);

-- ── Setup ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, instance_id, aud, role, created_at, updated_at)
VALUES
  ('ff000000-0000-0000-0000-000000000b01', 'disputebuyer@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
  ('ff000000-0000-0000-0000-000000000b02', 'disputeseller@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name)
VALUES
  ('ff000000-0000-0000-0000-000000000b01', 'disputebuyer@test.local', 'Dispute Buyer'),
  ('ff000000-0000-0000-0000-000000000b02', 'disputeseller@test.local', 'Dispute Seller')
ON CONFLICT (id) DO NOTHING;

INSERT INTO market_products (id, seller_id, name, description, price_usd, unit, category, inventory, market_date)
VALUES ('ff000000-0000-0000-0000-0000000000f1', 'ff000000-0000-0000-0000-000000000b02',
       'Test Apples', 'Fresh', 10.00, 'bag', 'produce', 10, CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

-- Create two orders for testing (one for refund, one for rating)
INSERT INTO market_orders (
  id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_amount_usd, platform_fee_usd, total_usd,
  fulfillment_type, status
)
SELECT
  'ff000000-0000-0000-0000-000000000e01',
  'ff000000-0000-0000-0000-000000000b01', 'ff000000-0000-0000-0000-000000000b02',
  b.id, 'ff000000-0000-0000-0000-0000000000f1',
  'Test Apples', 3, 10.00, 30.00, 2.55, 3.00, 35.55, 'delivery', 'delivered'
FROM market_booths b WHERE b.owner_id = 'ff000000-0000-0000-0000-000000000b02'
ON CONFLICT (id) DO NOTHING;

-- Second order for rating test
INSERT INTO market_orders (
  id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_amount_usd, platform_fee_usd, total_usd,
  fulfillment_type, status
)
SELECT
  'ff000000-0000-0000-0000-000000000e02',
  'ff000000-0000-0000-0000-000000000b01', 'ff000000-0000-0000-0000-000000000b02',
  b.id, 'ff000000-0000-0000-0000-0000000000f1',
  'Test Apples', 1, 10.00, 10.00, 0.85, 1.00, 11.85, 'pickup', 'completed'
FROM market_booths b WHERE b.owner_id = 'ff000000-0000-0000-0000-000000000b02'
ON CONFLICT (id) DO NOTHING;

-- Clear notifications before test
DELETE FROM market_notifications WHERE user_id IN (
  'ff000000-0000-0000-0000-000000000b01', 'ff000000-0000-0000-0000-000000000b02'
);

-- ═══════════════════════════════════════════════════════════════════════
-- DISPUTE REFUND FLOW
-- ═══════════════════════════════════════════════════════════════════════

-- (1) File a dispute (as buyer)
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000b01","role":"authenticated"}';

SELECT ok(
  (buyer_dispute_order(
    'ff000000-0000-0000-0000-000000000e01',
    'Received fewer apples than ordered',
    '[]'::JSONB,
    'quantity_mismatch',
    2
  )->>'success')::boolean,
  '(1) buyer_dispute_order succeeds'
);

-- (2) Order status changes to disputed
SELECT ok(
  (SELECT status FROM market_orders WHERE id = 'ff000000-0000-0000-0000-000000000e01') = 'disputed',
  '(2) Order status is disputed after buyer_dispute_order'
);

-- (3) Dispute record created
SELECT ok(
  EXISTS(SELECT 1 FROM order_disputes WHERE order_id = 'ff000000-0000-0000-0000-000000000e01'),
  '(3) Dispute record created in order_disputes'
);

-- (4) Notification for BOTH parties goes to market_notifications (from trigger)
SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b02'
      AND content LIKE '%dispute%'),
  '(4) Seller receives dispute notification in market_notifications'
);

SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b01'
      AND content LIKE '%dispute%'),
  '(5) Buyer receives dispute notification in market_notifications'
);

-- (6) Seller responds with partial refund
SET LOCAL request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000b02","role":"authenticated"}';

SELECT ok(
  (seller_respond_dispute(
    (SELECT id FROM order_disputes WHERE order_id = 'ff000000-0000-0000-0000-000000000e01' LIMIT 1),
    'partial',
    10.00,
    false
  )->>'success')::boolean,
  '(6) seller_respond_dispute with partial refund succeeds'
);

-- (7) Dispute has correct refund_type and amount
SELECT ok(
  (SELECT refund_type FROM order_disputes WHERE order_id = 'ff000000-0000-0000-0000-000000000e01') = 'partial',
  '(7) Dispute refund_type is partial'
);

SELECT ok(
  (SELECT refund_amount_usd FROM order_disputes WHERE order_id = 'ff000000-0000-0000-0000-000000000e01') = 10.00,
  '(8) Dispute refund_amount_usd is 10.00'
);

-- (9) Buyer gets notification about refund offer in market_notifications
SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b01'
      AND (content LIKE '%refund%' OR content LIKE '%respond%')),
  '(9) Buyer notified of seller refund offer in market_notifications'
);

-- (10) Buyer accepts refund
SET LOCAL request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000b01","role":"authenticated"}';

SELECT ok(
  (buyer_accept_refund(
    (SELECT id FROM order_disputes WHERE order_id = 'ff000000-0000-0000-0000-000000000e01' LIMIT 1)
  )->>'success')::boolean,
  '(10) buyer_accept_refund succeeds'
);

-- (11) Dispute status is resolved
SELECT ok(
  (SELECT status FROM order_disputes WHERE order_id = 'ff000000-0000-0000-0000-000000000e01') IN ('buyer_accepted', 'resolved'),
  '(11) Dispute status is buyer_accepted or resolved after accept'
);

-- (12) Seller gets notification about acceptance in market_notifications
SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b02'
      AND (content LIKE '%accept%' OR content LIKE '%refund%' OR content LIKE '%resolved%')),
  '(12) Seller notified of buyer acceptance in market_notifications'
);

-- (13) Order status changed to resolved
SELECT ok(
  (SELECT status FROM market_orders WHERE id = 'ff000000-0000-0000-0000-000000000e01') = 'resolved',
  '(13) Order status is resolved after buyer_accept_refund'
);

-- (14) Verify NO notifications went to old notifications table
SELECT ok(
  NOT EXISTS(SELECT 1 FROM notifications
    WHERE user_id IN ('ff000000-0000-0000-0000-000000000b01', 'ff000000-0000-0000-0000-000000000b02')
      AND created_at >= now() - INTERVAL '1 minute'),
  '(14) No stale notifications in legacy notifications table'
);

-- ═══════════════════════════════════════════════════════════════════════
-- RATING & RE-RATING
-- ═══════════════════════════════════════════════════════════════════════

-- Clear notifications before rating tests
DELETE FROM market_notifications WHERE user_id IN (
  'ff000000-0000-0000-0000-000000000b01', 'ff000000-0000-0000-0000-000000000b02'
);

-- (15) First rating succeeds
SET LOCAL request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000b01","role":"authenticated"}';

SELECT ok(
  (rate_market_order(
    'ff000000-0000-0000-0000-000000000e02',
    5,
    'Great seller!'
  )->>'success')::boolean,
  '(15) rate_market_order succeeds on first rating'
);

-- (16) Rating record created
SELECT ok(
  EXISTS(SELECT 1 FROM market_ratings WHERE order_id = 'ff000000-0000-0000-0000-000000000e02'),
  '(16) Rating record exists after rate_market_order'
);

-- (17) Notification sent to seller
SELECT ok(
  EXISTS(SELECT 1 FROM market_notifications
    WHERE user_id = 'ff000000-0000-0000-0000-000000000b02'
      AND (content LIKE '%rated%' OR content LIKE '%stars%' OR content LIKE '%Rating%')),
  '(17) Seller notified about rating in market_notifications'
);

-- (18) Re-rating succeeds (update, not error)
SELECT ok(
  (rate_market_order(
    'ff000000-0000-0000-0000-000000000e02',
    4,
    'Updated review'
  )->>'success')::boolean,
  '(18) rate_market_order succeeds on re-rating'
);

-- (19) Re-rating returns updated indicator
SELECT ok(
  (rate_market_order(
    'ff000000-0000-0000-0000-000000000e02',
    4,
    'Updated review again'
  )->>'updated')::boolean,
  '(19) Re-rating returns updated: true'
);

-- (20) Count rating notifications — should not create duplicates for re-rating
SELECT ok(
  (SELECT count(*) FROM market_notifications
   WHERE user_id = 'ff000000-0000-0000-0000-000000000b02'
     AND (content LIKE '%rated%' OR content LIKE '%stars%' OR content LIKE '%Rating%')
  ) <= 2,
  '(20) Re-rating does not spam duplicate notifications (max 2 from the 2 re-rates above)'
);

SELECT * FROM finish();
ROLLBACK;
