BEGIN;

-- Plan the tests
SELECT plan(14);

-- =============================================================================
-- 1. Schema: profiles attribution columns exist
-- =============================================================================

SELECT has_column('profiles', 'signup_source', 'profiles.signup_source column exists');
SELECT has_column('profiles', 'signup_referrer_id', 'profiles.signup_referrer_id column exists');
SELECT has_column('profiles', 'first_touch_source', 'profiles.first_touch_source column exists');
SELECT has_column('profiles', 'first_touch_referrer_id', 'profiles.first_touch_referrer_id column exists');
SELECT has_column('profiles', 'utm_source', 'profiles.utm_source column exists');
SELECT has_column('profiles', 'utm_medium', 'profiles.utm_medium column exists');
SELECT has_column('profiles', 'utm_campaign', 'profiles.utm_campaign column exists');

-- =============================================================================
-- 2. Schema: referral_touches table exists with correct columns
-- =============================================================================

SELECT has_table('public', 'referral_touches', 'referral_touches table exists');
SELECT has_column('referral_touches', 'user_id', 'referral_touches.user_id column exists');
SELECT has_column('referral_touches', 'source', 'referral_touches.source column exists');
SELECT has_column('referral_touches', 'referrer_id', 'referral_touches.referrer_id column exists');
SELECT has_column('referral_touches', 'landing_url', 'referral_touches.landing_url column exists');
SELECT has_column('referral_touches', 'touched_at', 'referral_touches.touched_at column exists');

-- =============================================================================
-- 3. Schema: indexes exist
-- =============================================================================

SELECT has_index('referral_touches', 'idx_referral_touches_user', 'referral_touches has user_id index');

SELECT * FROM finish();
ROLLBACK;
