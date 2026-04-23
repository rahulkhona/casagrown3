-- ============================================================
-- Test 48: Credit Details RPC & Notification Triggers
-- Tests: get_user_credit_details RPC, credit granted trigger,
--        process_credit_expiry_reminders function
-- ============================================================
BEGIN;

SELECT plan(14);

-- ──────────────────────────────────────────────────────────
-- SETUP: Create test users with credits
-- ──────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email) VALUES
  ('cd480001-0000-0000-0000-000000000001', 'buyer_48@test.com'),
  ('cd480001-0000-0000-0000-000000000002', 'seller_48@test.com');

UPDATE profiles SET full_name = 'Buyer 48', email = 'buyer_48@test.com'
  WHERE id = 'cd480001-0000-0000-0000-000000000001';
UPDATE profiles SET full_name = 'Seller 48', email = 'seller_48@test.com'
  WHERE id = 'cd480001-0000-0000-0000-000000000002';

-- Active purchase credit ($10, $3 flat cap, expires in 30 days)
INSERT INTO user_credits (id, user_id, amount_usd, remaining_usd, credit_type, cap_type, cap_value, source, reason, expires_at)
VALUES ('cd480001-c000-0000-0000-000000000001', 'cd480001-0000-0000-0000-000000000001',
  10.00, 10.00, 'purchase', 'flat_amount', 3.00, 'escalation_resolution', 'Late delivery compensation',
  now() + INTERVAL '30 days');

-- Active platform_fee credit ($25, 50% cap, no expiry)
INSERT INTO user_credits (id, user_id, amount_usd, remaining_usd, credit_type, cap_type, cap_value, source, reason)
VALUES ('cd480001-c000-0000-0000-000000000002', 'cd480001-0000-0000-0000-000000000002',
  25.00, 25.00, 'platform_fee', 'percentage', 50, 'escalation_resolution', 'Fee reduction');

-- Fully used credit
INSERT INTO user_credits (id, user_id, amount_usd, remaining_usd, credit_type, cap_type, cap_value, source, reason)
VALUES ('cd480001-c000-0000-0000-000000000003', 'cd480001-0000-0000-0000-000000000001',
  5.00, 0.00, 'purchase', 'flat_amount', 5.00, 'promotion', 'Welcome bonus');

-- Expired credit (remaining > 0 but past expiry)
INSERT INTO user_credits (id, user_id, amount_usd, remaining_usd, credit_type, cap_type, cap_value, source, reason, expires_at)
VALUES ('cd480001-c000-0000-0000-000000000004', 'cd480001-0000-0000-0000-000000000001',
  8.00, 8.00, 'purchase', 'percentage', 100, 'promotion', 'Promo expired',
  now() - INTERVAL '1 day');

-- ──────────────────────────────────────────────────────────
-- TEST 1: get_user_credit_details returns all credits for user
-- ──────────────────────────────────────────────────────────

SELECT results_eq(
  $$SELECT COUNT(*)::int FROM get_user_credit_details('cd480001-0000-0000-0000-000000000001'::uuid)$$,
  ARRAY[3],
  'get_user_credit_details returns 3 credits for buyer (active + used + expired)'
);

-- ──────────────────────────────────────────────────────────
-- TEST 2: Credit details include correct fields
-- ──────────────────────────────────────────────────────────

SELECT results_eq(
  $$SELECT credit_type::text FROM get_user_credit_details('cd480001-0000-0000-0000-000000000001'::uuid) WHERE credit_id = 'cd480001-c000-0000-0000-000000000001'$$,
  ARRAY['purchase'::text],
  'Credit detail includes correct credit_type'
);

-- ──────────────────────────────────────────────────────────
-- TEST 3: Active credit has is_expired = false
-- ──────────────────────────────────────────────────────────

SELECT results_eq(
  $$SELECT is_expired FROM get_user_credit_details('cd480001-0000-0000-0000-000000000001'::uuid) WHERE credit_id = 'cd480001-c000-0000-0000-000000000001'$$,
  ARRAY[false],
  'Active credit has is_expired = false'
);

-- ──────────────────────────────────────────────────────────
-- TEST 4: Expired credit has is_expired = true
-- ──────────────────────────────────────────────────────────

SELECT results_eq(
  $$SELECT is_expired FROM get_user_credit_details('cd480001-0000-0000-0000-000000000001'::uuid) WHERE credit_id = 'cd480001-c000-0000-0000-000000000004'$$,
  ARRAY[true],
  'Expired credit has is_expired = true'
);

-- ──────────────────────────────────────────────────────────
-- TEST 5: Fully used credit has is_fully_used = true
-- ──────────────────────────────────────────────────────────

SELECT results_eq(
  $$SELECT is_fully_used FROM get_user_credit_details('cd480001-0000-0000-0000-000000000001'::uuid) WHERE credit_id = 'cd480001-c000-0000-0000-000000000003'$$,
  ARRAY[true],
  'Fully used credit has is_fully_used = true'
);

-- ──────────────────────────────────────────────────────────
-- TEST 6: Credit detail includes cap info
-- ──────────────────────────────────────────────────────────

SELECT results_eq(
  $$SELECT cap_value::numeric FROM get_user_credit_details('cd480001-0000-0000-0000-000000000001'::uuid) WHERE credit_id = 'cd480001-c000-0000-0000-000000000001'$$,
  ARRAY[3.00::numeric],
  'Credit detail includes cap_value = 3.00'
);

-- ──────────────────────────────────────────────────────────
-- TEST 7: Credit detail includes reason
-- ──────────────────────────────────────────────────────────

SELECT results_eq(
  $$SELECT reason FROM get_user_credit_details('cd480001-0000-0000-0000-000000000001'::uuid) WHERE credit_id = 'cd480001-c000-0000-0000-000000000001'$$,
  ARRAY['Late delivery compensation'::text],
  'Credit detail includes reason text'
);

-- ──────────────────────────────────────────────────────────
-- TEST 8: get_user_credit_details for seller shows only their credits
-- ──────────────────────────────────────────────────────────

SELECT results_eq(
  $$SELECT COUNT(*)::int FROM get_user_credit_details('cd480001-0000-0000-0000-000000000002'::uuid)$$,
  ARRAY[1],
  'Seller has only 1 credit (platform_fee)'
);

-- ──────────────────────────────────────────────────────────
-- TEST 9: Credit granted trigger creates notification
-- ──────────────────────────────────────────────────────────

-- The inserts above should have fired the trigger
SELECT isnt(
  (SELECT COUNT(*)::int FROM market_notifications
    WHERE user_id = 'cd480001-0000-0000-0000-000000000001'
      AND content LIKE '%You received $10%'),
  0,
  'Credit granted trigger created in-app notification for $10 credit'
);

-- ──────────────────────────────────────────────────────────
-- TEST 10: Credit notification includes credit type
-- ──────────────────────────────────────────────────────────

SELECT isnt(
  (SELECT COUNT(*)::int FROM market_notifications
    WHERE user_id = 'cd480001-0000-0000-0000-000000000001'
      AND content LIKE '%purchase%credits%'),
  0,
  'Credit notification mentions credit type (purchase)'
);

-- ──────────────────────────────────────────────────────────
-- TEST 11: Credit notification includes cap info
-- ──────────────────────────────────────────────────────────

SELECT isnt(
  (SELECT COUNT(*)::int FROM market_notifications
    WHERE user_id = 'cd480001-0000-0000-0000-000000000001'
      AND content LIKE '%$3%'),
  0,
  'Credit notification includes cap amount'
);

-- ──────────────────────────────────────────────────────────
-- TEST 12: Seller credit notification is created
-- ──────────────────────────────────────────────────────────

SELECT isnt(
  (SELECT COUNT(*)::int FROM market_notifications
    WHERE user_id = 'cd480001-0000-0000-0000-000000000002'
      AND content LIKE '%You received $25%'),
  0,
  'Seller received notification for $25 platform_fee credit'
);

-- ──────────────────────────────────────────────────────────
-- TEST 13: Credit with expiry soon (add one expiring in 2 days)
-- ──────────────────────────────────────────────────────────

INSERT INTO user_credits (id, user_id, amount_usd, remaining_usd, credit_type, cap_type, cap_value, source, reason, expires_at)
VALUES ('cd480001-c000-0000-0000-000000000005', 'cd480001-0000-0000-0000-000000000001',
  15.00, 15.00, 'purchase', 'flat_amount', 5.00, 'promotion', 'Loyalty bonus',
  now() + INTERVAL '2 days');

-- process_credit_expiry_reminders should find this
SELECT results_eq(
  $$SELECT (process_credit_expiry_reminders() >= 1)$$,
  ARRAY[true],
  'process_credit_expiry_reminders processes at least 1 expiring credit'
);

-- ──────────────────────────────────────────────────────────
-- TEST 14: Expiry reminder creates notification
-- ──────────────────────────────────────────────────────────

SELECT isnt(
  (SELECT COUNT(*)::int FROM market_notifications
    WHERE user_id = 'cd480001-0000-0000-0000-000000000001'
      AND content LIKE '%expires%'),
  0,
  'Expiry reminder created notification for expiring credit'
);

ROLLBACK;
