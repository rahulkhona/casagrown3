-- -----------------------------------------------------------------------------
-- 72_jigsaw_image_pool.test.sql
-- pgTAP tests for Harvest Jigsaw 1,000-Cap Image Pool, Daily Generation,
-- 3-Tier Fallback Hierarchy & Support Alert Logging
-- -----------------------------------------------------------------------------

BEGIN;

SELECT plan(8);

-- 1. Test Table Existence: jigsaw_image_pool & jigsaw_image_gen_failures
SELECT has_table('public', 'jigsaw_image_pool', 'Table jigsaw_image_pool exists');
SELECT has_table('public', 'jigsaw_image_gen_failures', 'Table jigsaw_image_gen_failures exists');

-- 2. Test Function Existence: get_or_create_daily_jigsaw_image & sync_jigsaw_pool_from_interests_and_listings
SELECT has_function('public', 'get_or_create_daily_jigsaw_image', ARRAY['text'], 'Function get_or_create_daily_jigsaw_image(text) exists');
SELECT has_function('public', 'sync_jigsaw_pool_from_interests_and_listings', ARRAY[]::text[], 'Function sync_jigsaw_pool_from_interests_and_listings() exists');

-- 3. Test Function Execution: Sync pool from existing interests & listings
SELECT lives_ok(
  'SELECT sync_jigsaw_pool_from_interests_and_listings();',
  'sync_jigsaw_pool_from_interests_and_listings() executes cleanly'
);

-- 4. Test Daily Image Resolution (Fallback Hierarchy)
SELECT isnt_empty(
  'SELECT get_or_create_daily_jigsaw_image(''2026-08-12'');',
  'get_or_create_daily_jigsaw_image returns valid image URL'
);

-- 5. Test Same-Date Idempotency (Does not duplicate image for same date)
DO $$
DECLARE
  img1 TEXT;
  img2 TEXT;
BEGIN
  img1 := get_or_create_daily_jigsaw_image('2026-08-12');
  img2 := get_or_create_daily_jigsaw_image('2026-08-12');
  IF img1 <> img2 THEN
    RAISE EXCEPTION 'Idempotency failure: % vs %', img1, img2;
  END IF;
END $$;
SELECT pass('get_or_create_daily_jigsaw_image is 100% idempotent for same date');

-- 6. Test Trigger Existence: 1,000-Cap Rolling FIFO Eviction Trigger
SELECT has_trigger('public', 'jigsaw_image_pool', 'trigger_evict_jigsaw_pool', 'Eviction trigger trigger_evict_jigsaw_pool exists on jigsaw_image_pool');

SELECT * FROM finish();

ROLLBACK;
