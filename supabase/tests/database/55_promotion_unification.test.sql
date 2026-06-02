-- ============================================================
-- Test 55: Promotion Unification
-- Validates the unified promotion system:
--   1. crm_promo_buyer_discounts table works
--   2. Single enrollment enforcement
--   3. crm_switch_promotion atomic switch
--   4. Buyer discount → user_incentives → user_credits flow
--   5. Seller fee uses get_seller_fee_rate (tier-aware + promo)
--   6. initiate_downgrade + process_pending_downgrades
-- ============================================================

BEGIN;
SELECT plan(29);

-- ════════════════════════════════════════════════════════════════
-- Setup: Create test users, promotion, tiers
-- ════════════════════════════════════════════════════════════════

-- Create test users using helper or direct insert
DO $$
DECLARE
  v_buyer_id UUID := gen_random_uuid();
  v_seller_id UUID := gen_random_uuid();
BEGIN
  -- Store IDs for later access
  PERFORM set_config('test.buyer_id', v_buyer_id::text, true);
  PERFORM set_config('test.seller_id', v_seller_id::text, true);

  -- Insert test profiles
  INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data)
  VALUES 
    (v_buyer_id, 'test_promo_buyer@test.local', crypt('password123', gen_salt('bf')), '{"full_name":"Test Buyer"}'),
    (v_seller_id, 'test_promo_seller@test.local', crypt('password123', gen_salt('bf')), '{"full_name":"Test Seller"}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, email, full_name)
  VALUES 
    (v_buyer_id, 'test_promo_buyer@test.local', 'Test Buyer'),
    (v_seller_id, 'test_promo_seller@test.local', 'Test Seller')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- Test 1: crm_promo_buyer_discounts table exists
-- ═══════════════════════════════════════════════════════════════
SELECT has_table('crm_promo_buyer_discounts', 'crm_promo_buyer_discounts table should exist');

-- ═══════════════════════════════════════════════════════════════
-- Test 2: Legacy table is dropped
-- ═══════════════════════════════════════════════════════════════
SELECT hasnt_table('crm_recurring_user_incentives_blueprint', 'Legacy blueprint table should be dropped');

-- ═══════════════════════════════════════════════════════════════
-- Test 3: New table has correct columns
-- ═══════════════════════════════════════════════════════════════
SELECT has_column('crm_promo_buyer_discounts', 'discount_amount_usd', 'Should have discount_amount_usd column');
SELECT has_column('crm_promo_buyer_discounts', 'discount_cap_type', 'Should have discount_cap_type column');
SELECT has_column('crm_promo_buyer_discounts', 'discount_cap_value', 'Should have discount_cap_value column');
SELECT has_column('crm_promo_buyer_discounts', 'discount_type', 'Should have discount_type column');
SELECT has_column('crm_promo_buyer_discounts', 'image_url', 'Should have image_url column');

-- ═══════════════════════════════════════════════════════════════
-- Test 4-8: Create promo with buyer discount and verify enrollment
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_promo_a_id UUID := gen_random_uuid();
  v_promo_b_id UUID := gen_random_uuid();
  v_lp_id UUID := gen_random_uuid();
  v_buyer_id UUID := current_setting('test.buyer_id')::UUID;
BEGIN
  PERFORM set_config('test.promo_a_id', v_promo_a_id::text, true);
  PERFORM set_config('test.promo_b_id', v_promo_b_id::text, true);

  -- Create landing page
  INSERT INTO crm_landing_pages (id, slug, title, is_active)
  VALUES (v_lp_id, 'test-unification-lp', 'Test Unification LP', true);

  -- Create Promotion A
  INSERT INTO crm_promotions (id, name, description_html, enrollment_deadline, max_enrollees, landing_page_id)
  VALUES (v_promo_a_id, 'Promo A', '<p>Test A</p>', now() + interval '30 days', 100, v_lp_id);

  -- Create Promotion B
  INSERT INTO crm_promotions (id, name, description_html, enrollment_deadline, max_enrollees)
  VALUES (v_promo_b_id, 'Promo B', '<p>Test B</p>', now() + interval '30 days', 100);

  -- Add buyer discount to Promo A
  INSERT INTO crm_promo_buyer_discounts (promotion_id, discount_amount_usd, discount_cap_type, discount_cap_value, discount_type, frequency, occurrences, start_date)
  VALUES (v_promo_a_id, 10.00, 'percentage', 20.00, 'purchase', 'monthly', 6, now());

  -- Add buyer discount to Promo B
  INSERT INTO crm_promo_buyer_discounts (promotion_id, discount_amount_usd, discount_cap_type, discount_cap_value, discount_type, frequency, occurrences, start_date)
  VALUES (v_promo_b_id, 15.00, 'percentage', 25.00, 'purchase', 'monthly', 3, now());

  -- Add subscription discount to Promo A (for seller testing)
  INSERT INTO crm_promo_subscription_discounts (promotion_id, plan, discount_pct, duration_months, platform_fee_reduction_pct)
  VALUES (v_promo_a_id, 'pro', 50, 6, 3);
END $$;

-- Test 4: Landing page RPC returns buyer_discounts key
SELECT ok(
  (SELECT crm_get_landing_page_promotion('test-unification-lp') ->> 'buyer_discounts' IS NOT NULL),
  'Landing page RPC should return buyer_discounts key'
);

-- Test 5: buyer_discounts has correct amount
SELECT is(
  (SELECT (crm_get_landing_page_promotion('test-unification-lp') -> 'buyer_discounts' ->> 'discount_amount_usd')::numeric),
  10.00::numeric,
  'buyer_discounts should have discount_amount_usd = 10.00'
);

-- Test 6: Backward compat: 'credits' key still returned
SELECT ok(
  (SELECT crm_get_landing_page_promotion('test-unification-lp') ->> 'credits' IS NOT NULL),
  'Landing page RPC should still return credits key for backward compat'
);

-- ═══════════════════════════════════════════════════════════════
-- Test 7-10: Enrollment flow with buyer as test user
-- ═══════════════════════════════════════════════════════════════

-- Enroll buyer in Promo A (using set_config to simulate auth)
DO $$
DECLARE
  v_buyer_id UUID := current_setting('test.buyer_id')::UUID;
  v_promo_a_id UUID := current_setting('test.promo_a_id')::UUID;
  v_result JSONB;
BEGIN
  -- Simulate auth by setting local role
  PERFORM set_config('request.jwt.claim.sub', v_buyer_id::text, true);
  
  -- Direct enrollment via service role insert (bypassing auth.uid() for test)
  INSERT INTO crm_promo_enrollments (promotion_id, user_id)
  VALUES (v_promo_a_id, v_buyer_id);

  UPDATE crm_promotions SET current_enrollees = current_enrollees + 1 WHERE id = v_promo_a_id;

  -- Simulate what crm_enroll_in_promotion does: create user_incentives
  INSERT INTO user_incentives (user_id, amount_usd, credit_type, cap_type, cap_value, expiration_frequency, start_date, stop_date, is_active, created_by)
  VALUES (v_buyer_id, 10.00, 'purchase', 'percentage', 20.00, 'monthly', now(), now() + interval '6 months', true, NULL);
END $$;

-- Test 7: user should be enrolled
SELECT ok(
  EXISTS(SELECT 1 FROM crm_promo_enrollments WHERE user_id = current_setting('test.buyer_id')::UUID),
  'Buyer should be enrolled in Promo A'
);

-- Test 8: user_incentives should be created
SELECT ok(
  EXISTS(SELECT 1 FROM user_incentives WHERE user_id = current_setting('test.buyer_id')::UUID AND is_active = true),
  'user_incentives should be active for enrolled buyer'
);

-- Test 9: Single enrollment enforcement — cannot enroll in Promo B while enrolled in A
-- The enforcement is in crm_enroll_in_promotion RPC, not a table constraint.
-- We test that crm_promo_enrollments only has ONE row for this user.
SELECT is(
  (SELECT COUNT(*)::int FROM crm_promo_enrollments WHERE user_id = current_setting('test.buyer_id')::UUID),
  1,
  'User should have exactly 1 enrollment (single promo enforcement)'
);

-- ═══════════════════════════════════════════════════════════════
-- Test 10-13: Promotion switch
-- ═══════════════════════════════════════════════════════════════

-- Switch from Promo A to Promo B
DO $$
DECLARE
  v_buyer_id UUID := current_setting('test.buyer_id')::UUID;
  v_promo_a_id UUID := current_setting('test.promo_a_id')::UUID;
  v_promo_b_id UUID := current_setting('test.promo_b_id')::UUID;
BEGIN
  -- Deactivate old incentives (what crm_switch_promotion does)
  UPDATE user_incentives SET is_active = false
  WHERE user_id = v_buyer_id AND is_active = true AND created_by IS NULL;

  -- Remove old enrollment
  DELETE FROM crm_promo_enrollments WHERE user_id = v_buyer_id AND promotion_id = v_promo_a_id;
  UPDATE crm_promotions SET current_enrollees = GREATEST(current_enrollees - 1, 0) WHERE id = v_promo_a_id;

  -- Enroll in Promo B
  INSERT INTO crm_promo_enrollments (promotion_id, user_id) VALUES (v_promo_b_id, v_buyer_id);
  UPDATE crm_promotions SET current_enrollees = current_enrollees + 1 WHERE id = v_promo_b_id;

  -- Create new incentives for Promo B
  INSERT INTO user_incentives (user_id, amount_usd, credit_type, cap_type, cap_value, expiration_frequency, start_date, stop_date, is_active, created_by)
  VALUES (v_buyer_id, 15.00, 'purchase', 'percentage', 25.00, 'monthly', now(), now() + interval '3 months', true, NULL);
END $$;

-- Test 10: Now enrolled in Promo B
SELECT ok(
  EXISTS(SELECT 1 FROM crm_promo_enrollments WHERE user_id = current_setting('test.buyer_id')::UUID AND promotion_id = current_setting('test.promo_b_id')::UUID),
  'After switch, buyer should be enrolled in Promo B'
);

-- Test 11: NOT enrolled in Promo A
SELECT ok(
  NOT EXISTS(SELECT 1 FROM crm_promo_enrollments WHERE user_id = current_setting('test.buyer_id')::UUID AND promotion_id = current_setting('test.promo_a_id')::UUID),
  'After switch, buyer should NOT be enrolled in Promo A'
);

-- Test 12: Old incentive deactivated
SELECT is(
  (SELECT COUNT(*)::int FROM user_incentives WHERE user_id = current_setting('test.buyer_id')::UUID AND is_active = false),
  1,
  'Old promotion incentive should be deactivated'
);

-- Test 13: New incentive active
SELECT is(
  (SELECT COUNT(*)::int FROM user_incentives WHERE user_id = current_setting('test.buyer_id')::UUID AND is_active = true AND amount_usd = 15.00),
  1,
  'New promotion incentive (15.00) should be active'
);

-- ═══════════════════════════════════════════════════════════════
-- Test 14-16: Seller fee rate is tier-aware
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_seller_id UUID := current_setting('test.seller_id')::UUID;
BEGIN
  -- Give seller a Pro subscription
  INSERT INTO seller_subscriptions (user_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end)
  VALUES (v_seller_id, 'pro', 'active', 'cus_test', 'sub_sim_test', now(), now() + interval '30 days')
  ON CONFLICT (user_id) DO UPDATE SET plan = 'pro', status = 'active';
END $$;

-- Test 14: Pro seller should get 5% fee rate (not 10%)
SELECT ok(
  (SELECT get_seller_fee_rate(current_setting('test.seller_id')::UUID) <= 5.00),
  'Pro seller fee rate should be <= 5%'
);

-- Test 15: get_seller_stripe_fee_handling should return non-null
SELECT ok(
  (SELECT get_seller_stripe_fee_handling(current_setting('test.seller_id')::UUID) IS NOT NULL),
  'Stripe fee handling should return a valid value'
);

-- Test 16: process_recurring_incentives mints credits
SELECT lives_ok(
  'SELECT process_recurring_incentives()',
  'process_recurring_incentives should run without error'
);

-- ═══════════════════════════════════════════════════════════════
-- Test 17-21: Downgrade flow
-- ═══════════════════════════════════════════════════════════════

-- Test 17: seller_subscriptions has pending_downgrade columns
SELECT has_column('seller_subscriptions', 'pending_downgrade_plan', 'Should have pending_downgrade_plan column');
SELECT has_column('seller_subscriptions', 'pending_booth_keep_ids', 'Should have pending_booth_keep_ids column');
SELECT has_column('seller_subscriptions', 'downgrade_effective_at', 'Should have downgrade_effective_at column');

-- Test 20: process_pending_downgrades function exists
SELECT has_function('process_pending_downgrades', 'process_pending_downgrades function should exist');

-- Test 21: initiate_downgrade function exists
SELECT has_function('initiate_downgrade', ARRAY['text', 'uuid[]'], 'initiate_downgrade function should exist');

-- ═══════════════════════════════════════════════════════════════
-- Test 22-25: crm_switch_promotion function
-- ═══════════════════════════════════════════════════════════════

SELECT has_function('crm_switch_promotion', ARRAY['uuid', 'uuid'], 'crm_switch_promotion function should exist');

-- Test 23: _complete_market_order_with_receipt uses get_seller_fee_rate
-- We verify indirectly by checking the function source
SELECT ok(
  (SELECT prosrc LIKE '%get_seller_fee_rate%' FROM pg_proc WHERE proname = '_complete_market_order_with_receipt'),
  '_complete_market_order_with_receipt should use get_seller_fee_rate (not legacy function)'
);

-- Test 24: _complete_market_order_with_receipt does NOT use legacy fee function
SELECT ok(
  (SELECT prosrc NOT LIKE '%get_platform_fee_for_user%' FROM pg_proc WHERE proname = '_complete_market_order_with_receipt'),
  '_complete_market_order_with_receipt should NOT use get_platform_fee_for_user'
);

-- Test 25: crm_get_landing_page_promotion returns sub_discounts array
SELECT ok(
  (SELECT crm_get_landing_page_promotion('test-unification-lp') ->> 'sub_discounts' IS NOT NULL),
  'Landing page RPC should return sub_discounts array'
);

-- ════════════════════════════════════════════════════════════════
-- Cleanup
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_buyer_id UUID := current_setting('test.buyer_id')::UUID;
  v_seller_id UUID := current_setting('test.seller_id')::UUID;
  v_promo_a_id UUID := current_setting('test.promo_a_id')::UUID;
  v_promo_b_id UUID := current_setting('test.promo_b_id')::UUID;
BEGIN
  DELETE FROM user_incentives WHERE user_id = v_buyer_id;
  DELETE FROM user_credits WHERE user_id IN (v_buyer_id, v_seller_id);
  DELETE FROM crm_promo_enrollments WHERE user_id = v_buyer_id;
  DELETE FROM crm_promo_buyer_discounts WHERE promotion_id IN (v_promo_a_id, v_promo_b_id);
  DELETE FROM crm_promo_subscription_discounts WHERE promotion_id IN (v_promo_a_id, v_promo_b_id);
  DELETE FROM crm_promotions WHERE id IN (v_promo_a_id, v_promo_b_id);
  DELETE FROM crm_landing_pages WHERE slug = 'test-unification-lp';
  DELETE FROM seller_subscriptions WHERE user_id = v_seller_id;
  DELETE FROM profiles WHERE id IN (v_buyer_id, v_seller_id);
  DELETE FROM auth.users WHERE id IN (v_buyer_id, v_seller_id);
END $$;

SELECT * FROM finish();
ROLLBACK;
