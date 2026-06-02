-- ==========================================================================
-- Test: Listing Post Tracking — social post columns, trigger, and functions
-- Verifies the 20260601200000_listing_post_tracking migration applied correctly.
-- ==========================================================================
BEGIN;
SELECT plan(11);

-- ── 1. Verify new columns exist on market_products ──────────────────────
SELECT has_column('public', 'market_products', 'facebook_post_id',
  'market_products has facebook_post_id column');

SELECT has_column('public', 'market_products', 'instagram_post_id',
  'market_products has instagram_post_id column');

SELECT has_column('public', 'market_products', 'google_post_id',
  'market_products has google_post_id column');

SELECT has_column('public', 'market_products', 'wa_catalog_item_id',
  'market_products has wa_catalog_item_id column');

SELECT has_column('public', 'market_products', 'posts_published_at',
  'market_products has posts_published_at column');

SELECT has_column('public', 'market_products', 'posts_expired_at',
  'market_products has posts_expired_at column');

-- ── 2. Verify trigger exists on market_products ─────────────────────────
SELECT has_trigger('public', 'market_products', 'trg_listing_social_post_sync',
  'trg_listing_social_post_sync trigger exists on market_products');

-- ── 3. Verify functions exist ───────────────────────────────────────────
SELECT has_function('public', 'fn_listing_social_post_sync',
  'fn_listing_social_post_sync() function exists');

SELECT has_function('public', 'fn_expire_stale_listing_posts',
  'fn_expire_stale_listing_posts() function exists');

-- ── 4. Functional test: post tracking columns can be updated ────────────

-- Setup: create a test user
INSERT INTO auth.users (id, email, aud, role, created_at, updated_at)
VALUES ('f7777777-7777-7777-7777-777777777777', 'post-track-test@test.com',
        'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, full_name, state_code, email)
VALUES ('f7777777-7777-7777-7777-777777777777', 'Post Track Tester', 'CA',
        'post-track-test@test.com')
ON CONFLICT (id) DO NOTHING;

-- Ensure category exists
INSERT INTO sales_categories (name, display_order)
VALUES ('produce', 1)
ON CONFLICT (name) DO NOTHING;

-- Insert a test product (edge function URL is not set so trigger is a no-op)
INSERT INTO market_products (id, seller_id, name, price_usd, unit, inventory,
                             is_active, market_date, category)
VALUES ('f7a00001-0001-4e00-a001-000000000001',
        'f7777777-7777-7777-7777-777777777777',
        'POSTTRACK Test Tomatoes', 4.00, 'lb', 10, true,
        CURRENT_DATE + 7, 'produce');

-- Update the post tracking column
UPDATE market_products
SET facebook_post_id = 'fb_post_123456'
WHERE id = 'f7a00001-0001-4e00-a001-000000000001';

-- T10: Verify the update persisted
SELECT is(
  (SELECT facebook_post_id FROM market_products
   WHERE id = 'f7a00001-0001-4e00-a001-000000000001'),
  'fb_post_123456',
  'facebook_post_id can be set and read back'
);

-- T11: Verify multiple post IDs can be set independently
UPDATE market_products
SET instagram_post_id = 'ig_post_789',
    google_post_id = 'goog_post_abc',
    posts_published_at = now()
WHERE id = 'f7a00001-0001-4e00-a001-000000000001';

SELECT ok(
  (SELECT instagram_post_id = 'ig_post_789'
      AND google_post_id = 'goog_post_abc'
      AND posts_published_at IS NOT NULL
   FROM market_products
   WHERE id = 'f7a00001-0001-4e00-a001-000000000001'),
  'Multiple post tracking columns can be set and verified together'
);

SELECT * FROM finish();
ROLLBACK;
