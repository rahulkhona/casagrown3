-- ============================================================
-- Test 56: Billing Downgrade Flow
-- Validates:
--   1. Pending downgrade columns exist on seller_subscriptions
--   2. process_pending_downgrades archives correct booths
--   3. Plan is updated after processing
-- ============================================================

BEGIN;
SELECT plan(14);

-- ════════════════════════════════════════════════════════════════
-- Setup
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_seller_id UUID := gen_random_uuid();
  v_booth1_id UUID := gen_random_uuid();
  v_booth2_id UUID := gen_random_uuid();
  v_booth3_id UUID := gen_random_uuid();
BEGIN
  PERFORM set_config('test.seller_id', v_seller_id::text, true);
  PERFORM set_config('test.booth1_id', v_booth1_id::text, true);
  PERFORM set_config('test.booth2_id', v_booth2_id::text, true);
  PERFORM set_config('test.booth3_id', v_booth3_id::text, true);

  -- Create user
  INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data)
  VALUES (v_seller_id, 'downgrade_test@test.local', crypt('password123', gen_salt('bf')), '{"full_name":"Downgrade Tester"}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, email, full_name, is_pro)
  VALUES (v_seller_id, 'downgrade_test@test.local', 'Downgrade Tester', true)
  ON CONFLICT (id) DO UPDATE SET is_pro = true;

  -- Delete the auto-created draft booth (profile trigger creates one)
  DELETE FROM market_booths WHERE owner_id = v_seller_id;

  -- Give Pro subscription (3 booths max)
  INSERT INTO seller_subscriptions (user_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end)
  VALUES (v_seller_id, 'pro', 'active', 'cus_dg_test', 'sub_sim_dg_test', now(), now() + interval '30 days')
  ON CONFLICT (user_id) DO UPDATE SET plan = 'pro', status = 'active', current_period_end = now() + interval '30 days';

  -- Create 3 published booths (market_booths uses `name` and `status` = draft/published)
  INSERT INTO market_booths (id, owner_id, name, status)
  VALUES 
    (v_booth1_id, v_seller_id, 'Main Stand', 'published'),
    (v_booth2_id, v_seller_id, 'Saturday Market', 'published'),
    (v_booth3_id, v_seller_id, 'Sunday Special', 'published')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- Test 1-3: Schema checks
-- ═══════════════════════════════════════════════════════════════

SELECT has_column('seller_subscriptions', 'pending_downgrade_plan', 'Should have pending_downgrade_plan');
SELECT has_column('seller_subscriptions', 'pending_booth_keep_ids', 'Should have pending_booth_keep_ids');
SELECT has_column('seller_subscriptions', 'downgrade_effective_at', 'Should have downgrade_effective_at');

-- ═══════════════════════════════════════════════════════════════
-- Test 4: Verify seller has 3 published booths
-- ═══════════════════════════════════════════════════════════════

SELECT is(
  (SELECT COUNT(*)::int FROM market_booths WHERE owner_id = current_setting('test.seller_id')::UUID AND status = 'published'),
  3,
  'Seller should have 3 published booths before downgrade'
);

-- ═══════════════════════════════════════════════════════════════
-- Test 5: check_booth_creation_limit blocks at tier limit
-- ═══════════════════════════════════════════════════════════════

SELECT ok(
  NOT (SELECT check_booth_creation_limit(current_setting('test.seller_id')::UUID)),
  'Pro seller at 3 booths should NOT be allowed to create more'
);

-- ═══════════════════════════════════════════════════════════════
-- Test 6: Set pending downgrade (service role direct update)
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_seller_id UUID := current_setting('test.seller_id')::UUID;
  v_booth1_id UUID := current_setting('test.booth1_id')::UUID;
BEGIN
  UPDATE seller_subscriptions SET
    pending_downgrade_plan = 'lite',
    pending_booth_keep_ids = ARRAY[v_booth1_id],
    downgrade_effective_at = now() - interval '1 hour'  -- Already effective
  WHERE user_id = v_seller_id;
END $$;

SELECT is(
  (SELECT pending_downgrade_plan FROM seller_subscriptions WHERE user_id = current_setting('test.seller_id')::UUID),
  'lite',
  'Pending downgrade should be set to lite'
);

-- Test 7: Verify keep IDs are stored correctly
SELECT is(
  (SELECT array_length(pending_booth_keep_ids, 1) FROM seller_subscriptions WHERE user_id = current_setting('test.seller_id')::UUID),
  1,
  'pending_booth_keep_ids should contain exactly 1 UUID'
);

-- Test 8: Verify the kept booth ID matches
SELECT ok(
  (SELECT pending_booth_keep_ids[1] = current_setting('test.booth1_id')::UUID FROM seller_subscriptions WHERE user_id = current_setting('test.seller_id')::UUID),
  'pending_booth_keep_ids[1] should be booth1'
);

-- ═══════════════════════════════════════════════════════════════
-- Test 7: process_pending_downgrades executes
-- ═══════════════════════════════════════════════════════════════

SELECT is(
  (SELECT process_pending_downgrades()),
  1,
  'process_pending_downgrades should process 1 downgrade'
);

-- ═══════════════════════════════════════════════════════════════
-- Test 8-9: After processing, booths 2 and 3 should be marked for archival
-- ═══════════════════════════════════════════════════════════════

SELECT is(
  (SELECT COUNT(*)::int FROM market_booths WHERE owner_id = current_setting('test.seller_id')::UUID AND marked_for_archival = true),
  2,
  '2 booths should be marked for archival after downgrade'
);

-- Test 9: Booth 1 should NOT be marked for archival
SELECT ok(
  NOT (SELECT COALESCE(marked_for_archival, false) FROM market_booths WHERE id = current_setting('test.booth1_id')::UUID),
  'Kept booth should not be marked for archival'
);

-- Test 10: Plan should be updated to lite
SELECT is(
  (SELECT plan FROM seller_subscriptions WHERE user_id = current_setting('test.seller_id')::UUID),
  'lite',
  'Plan should be updated to lite'
);

-- Test 11: Pending columns should be cleared
SELECT ok(
  (SELECT pending_downgrade_plan IS NULL FROM seller_subscriptions WHERE user_id = current_setting('test.seller_id')::UUID),
  'pending_downgrade_plan should be cleared'
);

-- Test 12: is_pro should be false after downgrade to lite
SELECT ok(
  NOT (SELECT is_pro FROM profiles WHERE id = current_setting('test.seller_id')::UUID),
  'is_pro should be false after downgrade to lite'
);

-- ════════════════════════════════════════════════════════════════
-- Cleanup
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_seller_id UUID := current_setting('test.seller_id')::UUID;
BEGIN
  DELETE FROM market_booths WHERE owner_id = v_seller_id;
  DELETE FROM seller_subscriptions WHERE user_id = v_seller_id;
  DELETE FROM profiles WHERE id = v_seller_id;
  DELETE FROM auth.users WHERE id = v_seller_id;
END $$;

SELECT * FROM finish();
ROLLBACK;
