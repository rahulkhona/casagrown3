-- ============================================================
-- 38_disputes_and_order_log.test.sql
-- pgTAP tests for stripe_disputes table, order_status_log
-- triggers, and dispute admin RPCs
-- ============================================================
BEGIN;

SELECT plan(35);

-- ══════════════════════════════════════════════════════════════
-- 1. stripe_disputes — table structure
-- ══════════════════════════════════════════════════════════════
SELECT has_table('stripe_disputes', 'stripe_disputes table exists');

SELECT has_column('stripe_disputes', 'id', 'has id column');
SELECT has_column('stripe_disputes', 'stripe_dispute_id', 'has stripe_dispute_id column');
SELECT has_column('stripe_disputes', 'stripe_charge_id', 'has stripe_charge_id column');
SELECT has_column('stripe_disputes', 'stripe_payment_intent_id', 'has stripe_payment_intent_id column');
SELECT has_column('stripe_disputes', 'buyer_id', 'has buyer_id column');
SELECT has_column('stripe_disputes', 'amount_usd', 'has amount_usd column');
SELECT has_column('stripe_disputes', 'fee_usd', 'has fee_usd column');
SELECT has_column('stripe_disputes', 'reason', 'has reason column');
SELECT has_column('stripe_disputes', 'status', 'has status column');
SELECT has_column('stripe_disputes', 'evidence_due_by', 'has evidence_due_by column');
SELECT has_column('stripe_disputes', 'evidence_submitted_at', 'has evidence_submitted_at column');
SELECT has_column('stripe_disputes', 'evidence_json', 'has evidence_json column');
SELECT has_column('stripe_disputes', 'market_date', 'has market_date column');

-- ══════════════════════════════════════════════════════════════
-- 2. stripe_disputes — CHECK constraint on status
-- ══════════════════════════════════════════════════════════════
SELECT lives_ok(
  $$ INSERT INTO stripe_disputes (stripe_dispute_id, amount_usd, status, reason)
     VALUES ('dp_test_valid_1', 25.00, 'needs_response', 'fraudulent') $$,
  'Can insert dispute with needs_response status'
);

SELECT lives_ok(
  $$ INSERT INTO stripe_disputes (stripe_dispute_id, amount_usd, status, reason)
     VALUES ('dp_test_valid_2', 50.00, 'won', 'product_not_received') $$,
  'Can insert dispute with won status'
);

SELECT throws_ok(
  $$ INSERT INTO stripe_disputes (stripe_dispute_id, amount_usd, status)
     VALUES ('dp_test_invalid', 10.00, 'invalid_status') $$,
  '23514',  -- CHECK constraint violation
  NULL,
  'Rejects invalid dispute status'
);

-- unique constraint on stripe_dispute_id
SELECT throws_ok(
  $$ INSERT INTO stripe_disputes (stripe_dispute_id, amount_usd, status)
     VALUES ('dp_test_valid_1', 99.00, 'needs_response') $$,
  '23505',  -- UNIQUE violation
  NULL,
  'Rejects duplicate stripe_dispute_id'
);

-- ══════════════════════════════════════════════════════════════
-- 3. order_status_log — table structure
-- ══════════════════════════════════════════════════════════════
SELECT has_table('order_status_log', 'order_status_log table exists');

SELECT has_column('order_status_log', 'id', 'order_status_log has id');
SELECT has_column('order_status_log', 'order_id', 'order_status_log has order_id');
SELECT has_column('order_status_log', 'old_status', 'order_status_log has old_status');
SELECT has_column('order_status_log', 'new_status', 'order_status_log has new_status');
SELECT has_column('order_status_log', 'changed_by', 'order_status_log has changed_by');
SELECT has_column('order_status_log', 'changed_at', 'order_status_log has changed_at');
SELECT has_column('order_status_log', 'metadata', 'order_status_log has metadata');

-- ══════════════════════════════════════════════════════════════
-- 4. order_status_log — INSERT trigger fires on order creation
-- ══════════════════════════════════════════════════════════════

-- Create test users for trigger tests
INSERT INTO auth.users (id, email, instance_id, aud, role, created_at, updated_at)
VALUES
  ('ee000000-0000-0000-0000-000000000c01', 'oslbuyer@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
  ('ee000000-0000-0000-0000-000000000c02', 'oslseller@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name)
VALUES
  ('ee000000-0000-0000-0000-000000000c01', 'oslbuyer@test.local', 'OSL Buyer'),
  ('ee000000-0000-0000-0000-000000000c02', 'oslseller@test.local', 'OSL Seller')
ON CONFLICT (id) DO NOTHING;

-- Create a post (required FK for conversations)
INSERT INTO posts (id, author_id, type, content)
VALUES ('ee000000-0000-0000-0000-000000000d00', 'ee000000-0000-0000-0000-000000000c02', 'want_to_sell', 'Test post for order status log')
ON CONFLICT (id) DO NOTHING;

-- Create a conversation (required FK for orders)
INSERT INTO conversations (id, post_id, buyer_id, seller_id)
VALUES ('ee000000-0000-0000-0000-000000000d01', 'ee000000-0000-0000-0000-000000000d00', 'ee000000-0000-0000-0000-000000000c01', 'ee000000-0000-0000-0000-000000000c02')
ON CONFLICT (id) DO NOTHING;

-- Create an offer (required FK for orders)
INSERT INTO offers (id, conversation_id, created_by, quantity, points_per_unit, status)
VALUES ('ee000000-0000-0000-0000-000000000d02', 'ee000000-0000-0000-0000-000000000d01', 'ee000000-0000-0000-0000-000000000c02', 5, 10, 'accepted')
ON CONFLICT (id) DO NOTHING;

-- Insert an order — trigger should log initial status
INSERT INTO orders (id, offer_id, buyer_id, seller_id, conversation_id, category, product, quantity, points_per_unit, status)
VALUES ('ee000000-0000-0000-0000-000000000d03', 'ee000000-0000-0000-0000-000000000d02',
        'ee000000-0000-0000-0000-000000000c01', 'ee000000-0000-0000-0000-000000000c02',
        'ee000000-0000-0000-0000-000000000d01', 'produce', 'Test Tomatoes', 5, 10, 'pending')
ON CONFLICT (id) DO NOTHING;

SELECT ok(
  EXISTS(SELECT 1 FROM order_status_log WHERE order_id = 'ee000000-0000-0000-0000-000000000d03' AND new_status = 'pending' AND old_status IS NULL),
  'INSERT trigger logs initial order creation with old_status=NULL, new_status=pending'
);

-- ══════════════════════════════════════════════════════════════
-- 5. order_status_log — UPDATE trigger fires on status change
-- ══════════════════════════════════════════════════════════════
UPDATE orders SET status = 'accepted' WHERE id = 'ee000000-0000-0000-0000-000000000d03';

SELECT ok(
  EXISTS(SELECT 1 FROM order_status_log WHERE order_id = 'ee000000-0000-0000-0000-000000000d03' AND old_status = 'pending' AND new_status = 'accepted'),
  'UPDATE trigger logs status transition pending→accepted'
);

-- Second transition
UPDATE orders SET status = 'delivered' WHERE id = 'ee000000-0000-0000-0000-000000000d03';

SELECT ok(
  EXISTS(SELECT 1 FROM order_status_log WHERE order_id = 'ee000000-0000-0000-0000-000000000d03' AND old_status = 'accepted' AND new_status = 'delivered'),
  'UPDATE trigger logs status transition accepted→delivered'
);

-- Verify total log count for this order (should be 3: pending, accepted, delivered)
SELECT is(
  (SELECT count(*)::int FROM order_status_log WHERE order_id = 'ee000000-0000-0000-0000-000000000d03'),
  3,
  'Order has 3 status log entries after creation + 2 transitions'
);

-- ══════════════════════════════════════════════════════════════
-- 6. RLS — non-staff user cannot see disputes
-- ══════════════════════════════════════════════════════════════
SET request.jwt.claim.sub = 'ee000000-0000-0000-0000-000000000c01';
SET role = 'authenticated';

SELECT is(
  (SELECT count(*)::int FROM stripe_disputes),
  0,
  'Non-staff user sees 0 disputes (RLS blocks)'
);

RESET role;

-- ══════════════════════════════════════════════════════════════
-- 7. Admin RPCs exist
-- ══════════════════════════════════════════════════════════════
SELECT has_function('get_disputes_admin', 'get_disputes_admin function exists');
SELECT has_function('get_dispute_stats', 'get_dispute_stats function exists');
SELECT has_function('get_dispute_evidence', 'get_dispute_evidence function exists');
SELECT has_function('save_dispute_evidence_draft', 'save_dispute_evidence_draft function exists');

SELECT * FROM finish();

ROLLBACK;
