-- ============================================================
-- Test 67: Promotion Expiry & Re-enrollment
-- Validates:
--   1. sweep_expired_subscription_discounts() cron function
--   2. Auto-cleanup of stale enrollments in crm_enroll_in_promotion
--   3. Re-enrollment via ON CONFLICT DO UPDATE when expired/revoked
--   4. crm_switch_promotion still works after expiry
-- ============================================================

BEGIN;
SELECT plan(22);

-- ════════════════════════════════════════════════════════════════
-- Setup: Create test users, promotions, subscription discounts
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_promo_a_id UUID := gen_random_uuid();
  v_promo_b_id UUID := gen_random_uuid();
  v_lp_id UUID := gen_random_uuid();
  v_disc_a_id UUID := gen_random_uuid();
  v_disc_b_id UUID := gen_random_uuid();
BEGIN
  PERFORM set_config('test.user_id', v_user_id::text, true);
  PERFORM set_config('test.promo_a_id', v_promo_a_id::text, true);
  PERFORM set_config('test.promo_b_id', v_promo_b_id::text, true);
  PERFORM set_config('test.disc_a_id', v_disc_a_id::text, true);
  PERFORM set_config('test.disc_b_id', v_disc_b_id::text, true);

  -- Create test user
  INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data)
  VALUES (v_user_id, 'test_expiry_user@test.local', crypt('pw', gen_salt('bf')), '{"full_name":"Expiry Tester"}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, email, full_name)
  VALUES (v_user_id, 'test_expiry_user@test.local', 'Expiry Tester')
  ON CONFLICT (id) DO NOTHING;

  -- Create landing page
  INSERT INTO crm_landing_pages (id, slug, title, is_active)
  VALUES (v_lp_id, 'test-expiry-lp', 'Test Expiry LP', true);

  -- Create Promotion A (with subscription discount)
  INSERT INTO crm_promotions (id, name, description_html, enrollment_deadline, max_enrollees, landing_page_id, current_enrollees)
  VALUES (v_promo_a_id, 'Promo A Expiry', '<p>A</p>', now() + interval '90 days', 100, v_lp_id, 0);

  INSERT INTO crm_promo_subscription_discounts (id, promotion_id, plan, discount_pct, duration_months, platform_fee_reduction_pct)
  VALUES (v_disc_a_id, v_promo_a_id, 'pro', 50, 3, 2);

  -- Create Promotion B
  INSERT INTO crm_promotions (id, name, description_html, enrollment_deadline, max_enrollees, current_enrollees)
  VALUES (v_promo_b_id, 'Promo B Expiry', '<p>B</p>', now() + interval '90 days', 100, 0);

  INSERT INTO crm_promo_subscription_discounts (id, promotion_id, plan, discount_pct, duration_months, platform_fee_reduction_pct)
  VALUES (v_disc_b_id, v_promo_b_id, 'pro', 30, 6, 1);
END $$;


-- ═══════════════════════════════════════════════════════════════
-- Test 1-2: sweep function exists
-- ═══════════════════════════════════════════════════════════════

SELECT has_function('sweep_expired_subscription_discounts', 'sweep_expired_subscription_discounts function should exist');

SELECT function_returns('sweep_expired_subscription_discounts', 'integer', 'sweep function should return integer');


-- ═══════════════════════════════════════════════════════════════
-- Test 3-5: sweep marks expired discounts, leaves active ones
-- ═══════════════════════════════════════════════════════════════

-- Setup: Enroll user in Promo A with an EXPIRED discount
DO $$
DECLARE
  v_user_id UUID := current_setting('test.user_id')::UUID;
  v_promo_a_id UUID := current_setting('test.promo_a_id')::UUID;
  v_disc_a_id UUID := current_setting('test.disc_a_id')::UUID;
BEGIN
  -- Enroll user
  INSERT INTO crm_promo_enrollments (promotion_id, user_id)
  VALUES (v_promo_a_id, v_user_id);

  UPDATE crm_promotions SET current_enrollees = 1 WHERE id = v_promo_a_id;

  -- Create user_subscription_discount with PAST expires_at (simulating expiry)
  INSERT INTO user_subscription_discounts (user_id, promotion_id, discount_id, discount_pct, duration_months, applied_at, expires_at, status, platform_fee_reduction_pct)
  VALUES (v_user_id, v_promo_a_id, v_disc_a_id, 50, 3, now() - interval '4 months', now() - interval '1 month', 'active', 2);
END $$;

-- Test 3: Before sweep, status should still be 'active' (the bug)
SELECT is(
  (SELECT status FROM user_subscription_discounts
   WHERE user_id = current_setting('test.user_id')::UUID AND discount_id = current_setting('test.disc_a_id')::UUID),
  'active',
  'Before sweep: expired discount should still have status=active (the bug state)'
);

-- Run the sweep
SELECT sweep_expired_subscription_discounts();

-- Test 4: After sweep, status should be 'expired'
SELECT is(
  (SELECT status FROM user_subscription_discounts
   WHERE user_id = current_setting('test.user_id')::UUID AND discount_id = current_setting('test.disc_a_id')::UUID),
  'expired',
  'After sweep: expired discount should have status=expired'
);

-- Test 5: Stale enrollment should be removed (all benefits expired)
SELECT ok(
  NOT EXISTS(SELECT 1 FROM crm_promo_enrollments
   WHERE user_id = current_setting('test.user_id')::UUID AND promotion_id = current_setting('test.promo_a_id')::UUID),
  'After sweep: stale enrollment should be removed'
);


-- ═══════════════════════════════════════════════════════════════
-- Test 6-7: sweep leaves active/perpetual discounts alone
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user_id UUID := current_setting('test.user_id')::UUID;
  v_promo_b_id UUID := current_setting('test.promo_b_id')::UUID;
  v_disc_b_id UUID := current_setting('test.disc_b_id')::UUID;
  v_perpetual_id UUID := gen_random_uuid();
BEGIN
  PERFORM set_config('test.perpetual_disc_id', v_perpetual_id::text, true);

  -- Create an active (future) discount
  INSERT INTO crm_promo_enrollments (promotion_id, user_id)
  VALUES (v_promo_b_id, v_user_id);
  UPDATE crm_promotions SET current_enrollees = 1 WHERE id = v_promo_b_id;

  INSERT INTO user_subscription_discounts (user_id, promotion_id, discount_id, discount_pct, duration_months, applied_at, expires_at, status, platform_fee_reduction_pct)
  VALUES (v_user_id, v_promo_b_id, v_disc_b_id, 30, 6, now(), now() + interval '5 months', 'active', 1);
END $$;

SELECT sweep_expired_subscription_discounts();

-- Test 6: Active discount with future expires_at should remain active
SELECT is(
  (SELECT status FROM user_subscription_discounts
   WHERE user_id = current_setting('test.user_id')::UUID AND discount_id = current_setting('test.disc_b_id')::UUID),
  'active',
  'Sweep should NOT touch discounts with future expires_at'
);

-- Test 7: Enrollment should still exist (has active benefits)
SELECT ok(
  EXISTS(SELECT 1 FROM crm_promo_enrollments
   WHERE user_id = current_setting('test.user_id')::UUID AND promotion_id = current_setting('test.promo_b_id')::UUID),
  'Enrollment with active benefits should NOT be removed by sweep'
);


-- ═══════════════════════════════════════════════════════════════
-- Test 8-10: crm_enroll_in_promotion blocks when active benefits
-- ═══════════════════════════════════════════════════════════════

-- Test 8: User enrolled in B (active). Try enrolling in A directly — should fail.
DO $$
DECLARE
  v_user_id UUID := current_setting('test.user_id')::UUID;
  v_promo_a_id UUID := current_setting('test.promo_a_id')::UUID;
  v_result JSONB;
  v_raised BOOLEAN := false;
BEGIN
  -- Simulate authenticated user
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_id)::text, true);

  BEGIN
    SELECT crm_enroll_in_promotion(v_promo_a_id) INTO v_result;
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    PERFORM set_config('test.block_error', SQLERRM, true);
  END;

  IF NOT v_raised THEN
    RAISE EXCEPTION 'Expected enrollment to be blocked but it succeeded!';
  END IF;
END $$;

SELECT ok(
  current_setting('test.block_error', true) LIKE '%active benefits%',
  'crm_enroll_in_promotion should block when user has active benefits'
);


-- ═══════════════════════════════════════════════════════════════
-- Test 9-12: Auto-cleanup of expired enrollment + re-enrollment
-- ═══════════════════════════════════════════════════════════════

-- Expire Promo B's discount
DO $$
DECLARE
  v_user_id UUID := current_setting('test.user_id')::UUID;
  v_disc_b_id UUID := current_setting('test.disc_b_id')::UUID;
BEGIN
  UPDATE user_subscription_discounts
  SET expires_at = now() - interval '1 day'
  WHERE user_id = v_user_id AND discount_id = v_disc_b_id;
END $$;

-- Test 9: Enrollment still exists (hasn't been swept yet)
SELECT ok(
  EXISTS(SELECT 1 FROM crm_promo_enrollments
   WHERE user_id = current_setting('test.user_id')::UUID),
  'Before auto-cleanup: stale enrollment should still exist'
);

-- Test 10: Now enroll in Promo A — should auto-cleanup expired B enrollment
DO $$
DECLARE
  v_user_id UUID := current_setting('test.user_id')::UUID;
  v_promo_a_id UUID := current_setting('test.promo_a_id')::UUID;
  v_result JSONB;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_id)::text, true);

  SELECT crm_enroll_in_promotion(v_promo_a_id) INTO v_result;
  PERFORM set_config('test.auto_cleanup_result', v_result::text, true);
END $$;

SELECT ok(
  (current_setting('test.auto_cleanup_result', true)::jsonb ->> 'success')::boolean,
  'crm_enroll_in_promotion should succeed after auto-cleanup of expired enrollment'
);

-- Test 11: Old enrollment for Promo B should be gone
SELECT ok(
  NOT EXISTS(SELECT 1 FROM crm_promo_enrollments
   WHERE user_id = current_setting('test.user_id')::UUID AND promotion_id = current_setting('test.promo_b_id')::UUID),
  'Old Promo B enrollment should be cleaned up by auto-cleanup'
);

-- Test 12: New enrollment for Promo A should exist
SELECT ok(
  EXISTS(SELECT 1 FROM crm_promo_enrollments
   WHERE user_id = current_setting('test.user_id')::UUID AND promotion_id = current_setting('test.promo_a_id')::UUID),
  'New Promo A enrollment should exist after auto-cleanup'
);

-- Test 13: Promo A discount row should be status=active with new expires_at
SELECT is(
  (SELECT status FROM user_subscription_discounts
   WHERE user_id = current_setting('test.user_id')::UUID AND discount_id = current_setting('test.disc_a_id')::UUID),
  'active',
  'Re-enrolled Promo A discount should have status=active (ON CONFLICT DO UPDATE)'
);


-- ═══════════════════════════════════════════════════════════════
-- Test 14-16: Re-enrollment in SAME promotion after expiry
-- ═══════════════════════════════════════════════════════════════

-- Expire Promo A's discount again
DO $$
DECLARE
  v_user_id UUID := current_setting('test.user_id')::UUID;
  v_disc_a_id UUID := current_setting('test.disc_a_id')::UUID;
BEGIN
  UPDATE user_subscription_discounts
  SET expires_at = now() - interval '1 day', status = 'expired'
  WHERE user_id = v_user_id AND discount_id = v_disc_a_id;

  -- Remove enrollment to simulate sweep having run
  DELETE FROM crm_promo_enrollments WHERE user_id = v_user_id;
  UPDATE crm_promotions SET current_enrollees = GREATEST(current_enrollees - 1, 0)
  WHERE id = current_setting('test.promo_a_id')::UUID;
END $$;

-- Test 14: No enrollment exists
SELECT ok(
  NOT EXISTS(SELECT 1 FROM crm_promo_enrollments WHERE user_id = current_setting('test.user_id')::UUID),
  'After expiry cleanup: no enrollment should exist'
);

-- Test 15: Re-enroll in SAME Promo A
DO $$
DECLARE
  v_user_id UUID := current_setting('test.user_id')::UUID;
  v_promo_a_id UUID := current_setting('test.promo_a_id')::UUID;
  v_result JSONB;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_id)::text, true);

  SELECT crm_enroll_in_promotion(v_promo_a_id) INTO v_result;
  PERFORM set_config('test.reenroll_result', v_result::text, true);
END $$;

SELECT ok(
  (current_setting('test.reenroll_result', true)::jsonb ->> 'success')::boolean,
  'Re-enrollment in same Promo A should succeed after expiry'
);

-- Test 16: Discount row should be reset to active with new expiry
SELECT is(
  (SELECT status FROM user_subscription_discounts
   WHERE user_id = current_setting('test.user_id')::UUID AND discount_id = current_setting('test.disc_a_id')::UUID),
  'active',
  'Re-enrolled discount should be status=active with fresh expiry (ON CONFLICT DO UPDATE)'
);

-- Test 17: expires_at should be in the future
SELECT ok(
  (SELECT expires_at > now() FROM user_subscription_discounts
   WHERE user_id = current_setting('test.user_id')::UUID AND discount_id = current_setting('test.disc_a_id')::UUID),
  'Re-enrolled discount should have future expires_at'
);


-- ═══════════════════════════════════════════════════════════════
-- Test 18-20: crm_switch_promotion still works with expired
-- ═══════════════════════════════════════════════════════════════

-- Test 18: Switch from active A to B
DO $$
DECLARE
  v_user_id UUID := current_setting('test.user_id')::UUID;
  v_promo_b_id UUID := current_setting('test.promo_b_id')::UUID;
  v_result JSONB;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_id)::text, true);

  SELECT crm_switch_promotion(v_promo_b_id) INTO v_result;
  PERFORM set_config('test.switch_result', v_result::text, true);
END $$;

SELECT ok(
  (current_setting('test.switch_result', true)::jsonb ->> 'success')::boolean,
  'crm_switch_promotion should succeed'
);

-- Test 19: Now enrolled in B
SELECT ok(
  EXISTS(SELECT 1 FROM crm_promo_enrollments
   WHERE user_id = current_setting('test.user_id')::UUID AND promotion_id = current_setting('test.promo_b_id')::UUID),
  'After switch: should be enrolled in Promo B'
);

-- Test 20: Old A discount should be revoked
SELECT is(
  (SELECT status FROM user_subscription_discounts
   WHERE user_id = current_setting('test.user_id')::UUID AND discount_id = current_setting('test.disc_a_id')::UUID),
  'revoked',
  'After switch: Promo A discount should be revoked'
);


-- ═══════════════════════════════════════════════════════════════
-- Test 21-22: Enrollment counter accuracy
-- ═══════════════════════════════════════════════════════════════

-- Test 21: Promo B current_enrollees should be 1
SELECT is(
  (SELECT current_enrollees FROM crm_promotions WHERE id = current_setting('test.promo_b_id')::UUID),
  1,
  'Promo B should have current_enrollees = 1'
);

-- Test 22: Promo A current_enrollees should be 0
SELECT is(
  (SELECT current_enrollees FROM crm_promotions WHERE id = current_setting('test.promo_a_id')::UUID),
  0,
  'Promo A should have current_enrollees = 0'
);


-- ════════════════════════════════════════════════════════════════
-- Cleanup
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_user_id UUID := current_setting('test.user_id')::UUID;
  v_promo_a_id UUID := current_setting('test.promo_a_id')::UUID;
  v_promo_b_id UUID := current_setting('test.promo_b_id')::UUID;
BEGIN
  DELETE FROM user_subscription_discounts WHERE user_id = v_user_id;
  DELETE FROM user_incentives WHERE user_id = v_user_id;
  DELETE FROM crm_promo_enrollments WHERE user_id = v_user_id;
  DELETE FROM crm_promo_subscription_discounts WHERE promotion_id IN (v_promo_a_id, v_promo_b_id);
  DELETE FROM crm_promo_buyer_discounts WHERE promotion_id IN (v_promo_a_id, v_promo_b_id);
  DELETE FROM crm_promotions WHERE id IN (v_promo_a_id, v_promo_b_id);
  DELETE FROM crm_landing_pages WHERE slug = 'test-expiry-lp';
  DELETE FROM profiles WHERE id = v_user_id;
  DELETE FROM auth.users WHERE id = v_user_id;
END $$;

SELECT * FROM finish();
ROLLBACK;
