-- Migration: 20261214000000_jigsaw_image_pool.sql
-- Description: 1,000-image rolling buffer pool for Harvest Jigsaw daily puzzle generation
-- Scope: @audience:no (Infrastructure / Game Pool)

CREATE TABLE IF NOT EXISTS jigsaw_image_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL UNIQUE,
  crop_name VARCHAR(100) NOT NULL,
  source VARCHAR(50) NOT NULL CHECK (source IN ('user_listing', 'curated_studio', 'ai_generated')),
  listing_id UUID REFERENCES market_products(id) ON DELETE SET NULL,
  used_count INT DEFAULT 0 NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- MANDATORY SCHEMA COMMENTS (Per Workspace Rules)
COMMENT ON TABLE jigsaw_image_pool IS '@audience:no 1,000-image rolling buffer pool for Harvest Jigsaw puzzle daily generation';
COMMENT ON COLUMN jigsaw_image_pool.id IS 'Primary key UUID for jigsaw image pool item';
COMMENT ON COLUMN jigsaw_image_pool.image_url IS 'Public relative or absolute URL path to the harvest photo';
COMMENT ON COLUMN jigsaw_image_pool.crop_name IS 'Name of the produce crop (e.g., Meyer Lemons, Heirloom Tomatoes)';
COMMENT ON COLUMN jigsaw_image_pool.source IS 'Source category: user_listing, curated_studio, or ai_generated';
COMMENT ON COLUMN jigsaw_image_pool.listing_id IS 'Optional reference to real seller product in market_products';
COMMENT ON COLUMN jigsaw_image_pool.used_count IS 'Total times this image has been used as a daily puzzle';
COMMENT ON COLUMN jigsaw_image_pool.last_used_at IS 'Timestamp of the last date this image was active';
COMMENT ON COLUMN jigsaw_image_pool.created_at IS 'Timestamp when this image was added to the pool';

-- RLS POLICIES
ALTER TABLE jigsaw_image_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to jigsaw_image_pool"
  ON jigsaw_image_pool FOR SELECT
  USING (true);

-- 1,000-IMAGE ROLLING EVICTION TRIGGER & FUNCTION
CREATE OR REPLACE FUNCTION evict_oldest_jigsaw_image()
RETURNS TRIGGER AS $$
DECLARE
  current_count INT;
BEGIN
  SELECT COUNT(*) INTO current_count FROM jigsaw_image_pool;
  IF current_count > 1000 THEN
    DELETE FROM jigsaw_image_pool
    WHERE id IN (
      SELECT id FROM jigsaw_image_pool
      ORDER BY last_used_at ASC NULLS FIRST, created_at ASC
      LIMIT (current_count - 1000)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION evict_oldest_jigsaw_image() IS 'Maintains maximum 1,000 active images in jigsaw_image_pool by evicting oldest/most-used images';

CREATE OR REPLACE TRIGGER trigger_evict_jigsaw_pool
  AFTER INSERT ON jigsaw_image_pool
  FOR EACH STATEMENT
  EXECUTE FUNCTION evict_oldest_jigsaw_image();

-- AUTOMATIC SYNC FUNCTION: Ingest from interest_image_overrides ('interest-images') & market_products ('product-photos')
CREATE OR REPLACE FUNCTION sync_jigsaw_pool_from_interests_and_listings()
RETURNS INT AS $$
DECLARE
  inserted_count INT := 0;
BEGIN
  -- 1. Ingest from interest_image_overrides ('interest-images' bucket)
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'interest_image_overrides') THEN
    INSERT INTO jigsaw_image_pool (image_url, crop_name, source)
    SELECT 
      image_url, 
      INITCAP(REPLACE(item_id, '_', ' ')) AS crop_name,
      'curated_studio' AS source
    FROM interest_image_overrides
    WHERE image_url IS NOT NULL AND image_url != ''
    ON CONFLICT (image_url) DO NOTHING;
  END IF;

  -- 2. Ingest from market_products.photos[1] ('product-photos' bucket)
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'market_products') THEN
    INSERT INTO jigsaw_image_pool (image_url, crop_name, source, listing_id)
    SELECT 
      photos[1] AS image_url, 
      name AS crop_name,
      'user_listing' AS source,
      id AS listing_id
    FROM market_products
    WHERE photos IS NOT NULL AND array_length(photos, 1) > 0 AND photos[1] != ''
    ON CONFLICT (image_url) DO NOTHING;
  END IF;

  SELECT COUNT(*) INTO inserted_count FROM jigsaw_image_pool;
  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sync_jigsaw_pool_from_interests_and_listings() IS 'Populates jigsaw_image_pool from interest-images catalog overrides and active seller market_products photos';
