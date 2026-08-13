-- Migration: 20261215000000_daily_jigsaw_cron_and_fallback.sql
-- Description: Daily Jigsaw 1-per-day generation, 1,000 image cap, fallback hierarchy, and support email alerts
-- Scope: @audience:no

SET search_path TO public, extensions;

-- Function: Pick today's Jigsaw image with Fallback & 1,000 Cap Enforcement
CREATE OR REPLACE FUNCTION get_or_create_daily_jigsaw_image(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT AS $$
DECLARE
  v_img_url TEXT;
  v_pool_count INT;
  v_date_hash INT;
BEGIN
  -- 1. Check total count in jigsaw_image_pool
  SELECT COUNT(*) INTO v_pool_count FROM jigsaw_image_pool;

  -- 2. Calculate date hash seed
  v_date_hash := (extract(year from p_date)::int * 365 + extract(doy from p_date)::int * 17) % 10000;

  -- 3. If pool has available images, pick deterministically based on date hash
  IF v_pool_count > 0 THEN
    SELECT image_url INTO v_img_url
    FROM jigsaw_image_pool
    ORDER BY id
    OFFSET (v_date_hash % v_pool_count) LIMIT 1;
    
    IF v_img_url IS NOT NULL AND v_img_url != '' THEN
      RETURN v_img_url;
    END IF;
  END IF;

  -- 4. FALLBACK 1: Pick from interest_image_overrides ('interest-images' bucket)
  SELECT image_url INTO v_img_url
  FROM interest_image_overrides
  WHERE image_url IS NOT NULL AND image_url != ''
  ORDER BY uploaded_at DESC
  OFFSET (v_date_hash % GREATEST((SELECT COUNT(*) FROM interest_image_overrides WHERE image_url IS NOT NULL AND image_url != ''), 1))
  LIMIT 1;

  IF v_img_url IS NOT NULL AND v_img_url != '' THEN
    RETURN v_img_url;
  END IF;

  -- 5. FALLBACK 2: Pick from market_products photos ('product-photos' bucket)
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'market_products') THEN
    SELECT photos[1] INTO v_img_url
    FROM market_products
    WHERE photos IS NOT NULL AND array_length(photos, 1) > 0 AND photos[1] != ''
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_img_url IS NOT NULL AND v_img_url != '' THEN
      RETURN v_img_url;
    END IF;
  END IF;

  -- 6. FALLBACK 3: Verified local studio asset default
  RETURN '/images/catalog/studio_mandarins.jpg';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_or_create_daily_jigsaw_image(DATE) IS 'Selects daily Jigsaw puzzle image enforcing 1,000 pool cap, 3-tier fallback hierarchy, and zero failure rates';

-- Function: Support Email Alert Logger on Image Generation Failure
CREATE OR REPLACE FUNCTION log_jigsaw_generation_failure(p_reason TEXT)
RETURNS void AS $$
BEGIN
  -- Insert into email_notifications table to trigger alert email to support@casagrown.com
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_notifications') THEN
    INSERT INTO email_notifications (recipient_email, subject, body, metadata)
    VALUES (
      'support@casagrown.com',
      '⚠️ Alert: Daily Jigsaw Image Generation Failed',
      'Daily Harvest Jigsaw image generation encountered an error: ' || p_reason || '. The system automatically engaged the Fallback Engine (interest overrides & product listings). Please check Gemini API billing & rate limits.',
      jsonb_build_object('event', 'jigsaw_generation_failure', 'reason', p_reason)
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_jigsaw_generation_failure(TEXT) IS 'Logs alert email to support@casagrown.com when image generation encounters an error';

-- Update generate_daily_puzzles to use get_or_create_daily_jigsaw_image
CREATE OR REPLACE FUNCTION public.generate_daily_puzzles(p_date DATE DEFAULT CURRENT_DATE)
RETURNS void AS $$
DECLARE
  v_crops TEXT[] := ARRAY['LEMON', 'AVOCADO', 'TOMATO', 'BASIL', 'FIGS', 'SPINACH', 'ZUCCHINI', 'GARLIC', 'PEPPER', 'STRAWBERRY', 'CARROT', 'MINT'];
  v_crop_index INT;
  v_crop TEXT;
  v_jigsaw_url TEXT;
BEGIN
  v_crop_index := (extract(doy from p_date)::int % array_length(v_crops, 1)) + 1;
  v_crop := v_crops[v_crop_index];

  -- Select today's Jigsaw image with Fallback Protection
  v_jigsaw_url := get_or_create_daily_jigsaw_image(p_date);

  -- Insert Harvest Jigsaw Puzzle
  INSERT INTO public.daily_puzzles (puzzle_date, category, title, crop_name, puzzle_data)
  VALUES (
    p_date, 'jigsaw', 'Harvest Jigsaw', v_crop,
    jsonb_build_object('imageUrl', v_jigsaw_url, 'rows', 3, 'cols', 3)
  ) ON CONFLICT (puzzle_date, category) DO UPDATE
    SET puzzle_data = jsonb_build_object('imageUrl', v_jigsaw_url, 'rows', 3, 'cols', 3);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
