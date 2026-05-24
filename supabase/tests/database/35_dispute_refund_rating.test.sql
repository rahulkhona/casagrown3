-- ===========================================================================
-- pgTAP test: Dispute Refund Flow & Rating
-- Tests seller refund offers, buyer acceptance/rejection, and re-rating
-- ===========================================================================
BEGIN;
SELECT plan(12);

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

-- Ensure seller has a booth
INSERT INTO market_booths (id, owner_id, name, description)
VALUES ('ff000000-0000-0000-0000-0000000000b2', 'ff000000-0000-0000-0000-000000000b02',
       'Dispute Test Booth', 'Test booth for dispute seller')
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

-- (4) Dispute has correct type
SELECT ok(
  (SELECT dispute_type FROM order_disputes WHERE order_id = 'ff000000-0000-0000-0000-000000000e01') = 'quantity_mismatch',
  '(4) Dispute type is quantity_mismatch'
);

-- (5) Seller responds with partial refund
SET LOCAL request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000b02","role":"authenticated"}';

SELECT ok(
  (seller_respond_dispute(
    (SELECT id FROM order_disputes WHERE order_id = 'ff000000-0000-0000-0000-000000000e01' LIMIT 1),
    'partial',
    10.00,
    false
  )->>'success')::boolean,
  '(5) seller_respond_dispute with partial refund succeeds'
);

-- (6) Dispute has correct refund_type and amount
SELECT ok(
  (SELECT refund_type FROM order_disputes WHERE order_id = 'ff000000-0000-0000-0000-000000000e01') = 'partial',
  '(6) Dispute refund_type is partial'
);

SELECT ok(
  (SELECT refund_amount_usd FROM order_disputes WHERE order_id = 'ff000000-0000-0000-0000-000000000e01') = 10.00,
  '(7) Dispute refund_amount_usd is 10.00'
);

-- (8) Buyer accepts refund
SET LOCAL request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000b01","role":"authenticated"}';

SELECT ok(
  (buyer_accept_refund(
    (SELECT id FROM order_disputes WHERE order_id = 'ff000000-0000-0000-0000-000000000e01' LIMIT 1)
  )->>'success')::boolean,
  '(8) buyer_accept_refund succeeds'
);

-- (9) Dispute status is buyer_accepted
SELECT ok(
  (SELECT status FROM order_disputes WHERE order_id = 'ff000000-0000-0000-0000-000000000e01') = 'buyer_accepted',
  '(9) Dispute status is buyer_accepted after accept'
);

-- (10) Order status changed to resolved
SELECT ok(
  (SELECT status FROM market_orders WHERE id = 'ff000000-0000-0000-0000-000000000e01') = 'resolved',
  '(10) Order status is resolved after buyer_accept_refund'
);

-- ═══════════════════════════════════════════════════════════════════════
-- RATING & RE-RATING (ratings stored on market_orders.buyer_rating)
-- ═══════════════════════════════════════════════════════════════════════

-- (11) First rating succeeds
SET LOCAL request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000b01","role":"authenticated"}';

SELECT ok(
  (rate_market_order(
    'ff000000-0000-0000-0000-000000000e02'::uuid,
    5::smallint,
    'Great seller!'
  )->>'success')::boolean,
  '(11) rate_market_order succeeds on first rating'
);

-- (12) Re-rating succeeds with update
SELECT ok(
  (rate_market_order(
    'ff000000-0000-0000-0000-000000000e02'::uuid,
    4::smallint,
    'Updated review'
  )->>'success')::boolean,
  '(12) rate_market_order succeeds on re-rating'
);

SELECT * FROM finish();
ROLLBACK;
