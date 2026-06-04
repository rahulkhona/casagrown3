-- ============================================================================
-- Migration: Fix Listing Post Sync Trigger URL Resolution
--
-- Redefines fn_listing_social_post_sync and fn_expire_stale_listing_posts
-- to use the robust get_edge_fn_base_url() and get_service_role_key()
-- helpers rather than relying on current_setting('app.settings.edge_function_url')
-- which is NULL on Supabase Cloud.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_listing_social_post_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_edge_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Resolve edge function base URL and service key using the shared helpers
  v_edge_url := get_edge_fn_base_url();
  v_service_key := get_service_role_key();

  -- Skip if edge function URL or service key not configured
  IF v_edge_url IS NULL OR v_edge_url = '' OR v_service_key IS NULL OR v_service_key = '' THEN
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

    -- Inventory changed → queue comments/GBP description update
    IF NEW.is_active = true AND NEW.inventory > 0
       AND (NEW.facebook_post_id IS NOT NULL OR NEW.instagram_post_id IS NOT NULL OR NEW.google_post_id IS NOT NULL)
       AND (OLD.inventory IS DISTINCT FROM NEW.inventory) THEN
      PERFORM net.http_post(
        url := v_edge_url || '/sync-listing-posts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'action', 'update_inventory',
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


CREATE OR REPLACE FUNCTION public.fn_expire_stale_listing_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_edge_url TEXT;
  v_service_key TEXT;
  v_listing RECORD;
BEGIN
  -- Resolve edge function base URL and service key using the shared helpers
  v_edge_url := get_edge_fn_base_url();
  v_service_key := get_service_role_key();

  IF v_edge_url IS NULL OR v_edge_url = '' OR v_service_key IS NULL OR v_service_key = '' THEN
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
