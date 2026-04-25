-- Fix: auto_post_market_product_to_buzz should respect product-level fulfillment
-- overrides (product_delivery_windows / product_pickup_windows) instead of
-- always reading from the booth-level defaults.
--
-- Convention: product_delivery_windows = NULL means delivery disabled for this product
--             product_pickup_windows = NULL means pickup disabled for this product
--             If non-null (even empty []), falls back to booth setting

CREATE OR REPLACE FUNCTION public.auto_post_market_product_to_buzz()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_h3_index TEXT;
  v_author_name TEXT;
  v_message TEXT;
  v_media JSONB;
  v_booth RECORD;
  v_fulfillment TEXT;
  v_photo_url TEXT;
  v_offers_delivery BOOLEAN;
  v_offers_pickup BOOLEAN;
BEGIN
  -- Only fire when product becomes active (new active product or draft→active)
  IF NEW.is_active = false THEN RETURN NEW; END IF;
  IF NEW.is_draft = true THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active = true AND OLD.is_draft = false THEN
    -- Already was active, not a new publication
    RETURN NEW;
  END IF;

  -- Get seller's community and name
  SELECT home_community_h3_index, full_name
  INTO v_h3_index, v_author_name
  FROM profiles
  WHERE id = NEW.seller_id;

  IF v_h3_index IS NULL THEN RETURN NEW; END IF;

  -- Get booth info for fulfillment fallback
  SELECT * INTO v_booth FROM market_booths WHERE owner_id = NEW.seller_id LIMIT 1;

  -- ★ Determine fulfillment from PRODUCT first, fall back to BOOTH
  -- NULL = explicitly disabled; non-null (even []) = enabled
  v_offers_delivery := CASE
    WHEN NEW.product_delivery_windows IS NULL THEN false
    ELSE COALESCE(v_booth.offers_delivery, true)
  END;
  v_offers_pickup := CASE
    WHEN NEW.product_pickup_windows IS NULL THEN false
    ELSE COALESCE(v_booth.offers_pickup, true)
  END;

  -- Build fulfillment text
  v_fulfillment := '';
  IF v_offers_delivery AND v_offers_pickup THEN
    v_fulfillment := '🚗 Delivery · 📍 Pickup';
  ELSIF v_offers_delivery THEN
    v_fulfillment := '🚗 Delivery';
  ELSIF v_offers_pickup THEN
    v_fulfillment := '📍 Pickup';
  END IF;

  -- Build message text
  v_message := '🛒 **' || NEW.name || '** — $' || ROUND(NEW.price_usd, 2) || '/' || NEW.unit ||
    CASE WHEN NEW.inventory > 0 THEN ' · ' || NEW.inventory || ' available' ELSE '' END ||
    CASE WHEN v_fulfillment != '' THEN E'\n' || v_fulfillment ELSE '' END ||
    E'\n\nTap to view and purchase →';

  -- Build media array from product photos
  v_media := '[]'::jsonb;
  IF NEW.photos IS NOT NULL AND array_length(NEW.photos, 1) > 0 THEN
    SELECT jsonb_agg(jsonb_build_object(
      'url', photo,
      'storage_path', '',
      'media_type', 'image'
    )) INTO v_media
    FROM unnest(NEW.photos) AS photo;
  END IF;

  -- Insert into community chat — posted as the seller (not system)
  INSERT INTO community_chat_messages (
    community_h3_index, author_id, content,
    media, product_listing_id, is_system
  ) VALUES (
    v_h3_index, NEW.seller_id, v_message,
    COALESCE(v_media, '[]'::jsonb), NEW.id, false
  );

  RETURN NEW;
END;
$$;

-- ============================================================================
-- Data fixup: correct fulfillment text in existing auto-posted messages
-- Rewrites the fulfillment line based on the product's actual settings
-- ============================================================================
UPDATE community_chat_messages ccm
SET content = regexp_replace(
  ccm.content,
  E'\\n(🚗 Delivery · 📍 Pickup|🚗 Delivery|📍 Pickup)',
  E'\n' || CASE
    WHEN mp.product_delivery_windows IS NOT NULL AND mp.product_pickup_windows IS NOT NULL
      THEN '🚗 Delivery · 📍 Pickup'
    WHEN mp.product_delivery_windows IS NOT NULL
      THEN '🚗 Delivery'
    WHEN mp.product_pickup_windows IS NOT NULL
      THEN '📍 Pickup'
    ELSE ''
  END
)
FROM market_products mp
WHERE ccm.product_listing_id = mp.id
  AND ccm.product_listing_id IS NOT NULL
  -- Only fix messages where the fulfillment text doesn't match the product settings
  AND (
    (mp.product_delivery_windows IS NULL AND ccm.content LIKE '%🚗 Delivery%')
    OR (mp.product_pickup_windows IS NULL AND ccm.content LIKE '%📍 Pickup%')
  );
