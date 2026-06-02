-- ============================================================================
-- Migration: Listing-Lifecycle Social Post Tracking
--
-- Adds per-listing post ID columns so we can:
--   1. Create social posts when a listing is published
--   2. Auto-expire posts when the fulfillment window ends
--   3. Delete posts when the listing is deleted or deactivated
--
-- Channels tracked:
--   Pro:   facebook_post_id
--   Elite: instagram_post_id, google_post_id, wa_catalog_item_id
-- ============================================================================

-- 1. Add post tracking columns to market_products
ALTER TABLE public.market_products
  ADD COLUMN IF NOT EXISTS facebook_post_id   TEXT,
  ADD COLUMN IF NOT EXISTS instagram_post_id  TEXT,
  ADD COLUMN IF NOT EXISTS google_post_id     TEXT,
  ADD COLUMN IF NOT EXISTS wa_catalog_item_id TEXT,
  ADD COLUMN IF NOT EXISTS posts_published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posts_expired_at   TIMESTAMPTZ;

COMMENT ON COLUMN public.market_products.facebook_post_id IS 'Facebook page post ID — set when listing is auto-posted';
COMMENT ON COLUMN public.market_products.instagram_post_id IS 'Instagram post ID — Elite only';
COMMENT ON COLUMN public.market_products.google_post_id IS 'Google Business Profile local post name — Elite only';
COMMENT ON COLUMN public.market_products.wa_catalog_item_id IS 'WhatsApp catalog item ID — Elite only';
COMMENT ON COLUMN public.market_products.posts_published_at IS 'When social posts were created for this listing';
COMMENT ON COLUMN public.market_products.posts_expired_at IS 'When social posts were expired/deleted for this listing';

-- 2. Rename fb_auto_post_log to social_post_log for multi-channel support
-- (Keep the old table as-is for backwards compat, add a view alias)
-- Actually, just add target values: 'instagram', 'google_local', 'whatsapp_catalog'
-- These are already used in generate-fb-posts/index.ts — no schema change needed.

-- 3. Create a function to queue social post creation/deletion via pg_net
--    This is called by triggers on market_products.
CREATE OR REPLACE FUNCTION public.fn_listing_social_post_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edge_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Get the edge function URL from app settings
  v_edge_url := current_setting('app.settings.edge_function_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  -- Skip if edge function URL not configured (local dev without pg_net)
  IF v_edge_url IS NULL OR v_edge_url = '' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── INSERT: New listing published → queue post creation ──
  IF TG_OP = 'INSERT' AND NEW.is_active = true AND NEW.inventory > 0 THEN
    PERFORM net.http_post(
      url := v_edge_url || '/sync-listing-posts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'action', 'publish',
        'product_id', NEW.id,
        'seller_id', NEW.seller_id,
        'booth_id', NEW.booth_id
      )
    );
  END IF;

  -- ── UPDATE: Listing deactivated or inventory zeroed → queue post deletion ──
  IF TG_OP = 'UPDATE' THEN
    -- Was active, now deactivated or out of stock
    IF (OLD.is_active = true AND (NEW.is_active = false OR NEW.inventory <= 0))
       OR (OLD.is_deleted = false AND NEW.is_deleted = true) THEN
      PERFORM net.http_post(
        url := v_edge_url || '/sync-listing-posts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'action', 'expire',
          'product_id', NEW.id,
          'seller_id', NEW.seller_id,
          'facebook_post_id', OLD.facebook_post_id,
          'instagram_post_id', OLD.instagram_post_id,
          'google_post_id', OLD.google_post_id,
          'wa_catalog_item_id', OLD.wa_catalog_item_id
        )
      );
    END IF;

    -- Was inactive, now reactivated with stock → queue new post
    IF (OLD.is_active = false OR OLD.inventory <= 0)
       AND NEW.is_active = true AND NEW.inventory > 0
       AND NEW.facebook_post_id IS NULL THEN
      PERFORM net.http_post(
        url := v_edge_url || '/sync-listing-posts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'action', 'publish',
          'product_id', NEW.id,
          'seller_id', NEW.seller_id,
          'booth_id', NEW.booth_id
        )
      );
    END IF;

    -- Price or details changed → queue post update
    IF NEW.is_active = true AND NEW.inventory > 0
       AND NEW.facebook_post_id IS NOT NULL
       AND (OLD.price_usd IS DISTINCT FROM NEW.price_usd
            OR OLD.name IS DISTINCT FROM NEW.name
            OR OLD.description IS DISTINCT FROM NEW.description
            OR OLD.photos IS DISTINCT FROM NEW.photos) THEN
      PERFORM net.http_post(
        url := v_edge_url || '/sync-listing-posts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'action', 'update',
          'product_id', NEW.id,
          'seller_id', NEW.seller_id,
          'facebook_post_id', NEW.facebook_post_id,
          'instagram_post_id', NEW.instagram_post_id,
          'google_post_id', NEW.google_post_id
        )
      );
    END IF;
  END IF;

  -- ── DELETE: Listing removed → queue post deletion ──
  IF TG_OP = 'DELETE' AND OLD.facebook_post_id IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_edge_url || '/sync-listing-posts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'action', 'delete',
        'product_id', OLD.id,
        'seller_id', OLD.seller_id,
        'facebook_post_id', OLD.facebook_post_id,
        'instagram_post_id', OLD.instagram_post_id,
        'google_post_id', OLD.google_post_id,
        'wa_catalog_item_id', OLD.wa_catalog_item_id
      )
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4. Attach the trigger to market_products
DROP TRIGGER IF EXISTS trg_listing_social_post_sync ON public.market_products;
CREATE TRIGGER trg_listing_social_post_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.market_products
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_listing_social_post_sync();

-- 5. Create a scheduled function to expire posts whose fulfillment window has ended
--    This runs every hour to catch listings whose market_date + fulfillment window has passed.
CREATE OR REPLACE FUNCTION public.fn_expire_stale_listing_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edge_url TEXT;
  v_service_key TEXT;
  v_listing RECORD;
BEGIN
  v_edge_url := current_setting('app.settings.edge_function_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  IF v_edge_url IS NULL OR v_edge_url = '' THEN
    RETURN;
  END IF;

  -- Find listings with social posts that are past their market_date
  -- and haven't been expired yet
  FOR v_listing IN
    SELECT p.id, p.seller_id, p.facebook_post_id, p.instagram_post_id,
           p.google_post_id, p.wa_catalog_item_id
    FROM public.market_products p
    WHERE p.posts_expired_at IS NULL
      AND p.posts_published_at IS NOT NULL
      AND (p.facebook_post_id IS NOT NULL
           OR p.instagram_post_id IS NOT NULL
           OR p.google_post_id IS NOT NULL)
      AND (
        -- Market date has passed (product is for a specific day)
        (p.market_date < CURRENT_DATE)
        -- OR product was deactivated / deleted / out of stock
        OR p.is_active = false
        OR p.is_deleted = true
        OR p.inventory <= 0
      )
  LOOP
    PERFORM net.http_post(
      url := v_edge_url || '/sync-listing-posts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'action', 'expire',
        'product_id', v_listing.id,
        'seller_id', v_listing.seller_id,
        'facebook_post_id', v_listing.facebook_post_id,
        'instagram_post_id', v_listing.instagram_post_id,
        'google_post_id', v_listing.google_post_id,
        'wa_catalog_item_id', v_listing.wa_catalog_item_id
      )
    );

    -- Mark as expired so we don't re-process
    UPDATE public.market_products
    SET posts_expired_at = now()
    WHERE id = v_listing.id;
  END LOOP;
END;
$$;

-- 6. Schedule hourly expiration check (requires pg_cron)
-- Note: pg_cron must be enabled in supabase/config.toml
-- SELECT cron.schedule('expire-stale-listing-posts', '0 * * * *', $$SELECT public.fn_expire_stale_listing_posts()$$);
