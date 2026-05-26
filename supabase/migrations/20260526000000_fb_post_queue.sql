-- Facebook Page Auto-Posting: Queue table, trigger, and opt-in controls
-- Posts product listings to seller's FB Page and CasaGrown's FB Page

-- 1. Add opt-in columns to seller_fb_connections
ALTER TABLE public.seller_fb_connections
  ADD COLUMN IF NOT EXISTS auto_post_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS casagrown_post_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS granted_scopes TEXT;

COMMENT ON COLUMN public.seller_fb_connections.auto_post_enabled IS 'Auto-post new/updated listings to seller''s own Facebook Page';
COMMENT ON COLUMN public.seller_fb_connections.casagrown_post_enabled IS 'Allow listings to be featured on CasaGrown''s Facebook Page (with moderation)';
COMMENT ON COLUMN public.seller_fb_connections.granted_scopes IS 'Comma-separated list of OAuth scopes granted during last authorization';

-- 2. Post queue table
CREATE TABLE IF NOT EXISTS public.fb_post_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who & what
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booth_id UUID NOT NULL REFERENCES public.market_booths(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.market_products(id) ON DELETE CASCADE,

  -- Destination
  target TEXT NOT NULL CHECK (target IN ('seller_page', 'casagrown_page')),

  -- Content (pre-rendered)
  post_message TEXT NOT NULL,
  post_link TEXT NOT NULL,
  post_photo_url TEXT,

  -- State
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'posted', 'rejected', 'failed')),
  trigger_type TEXT NOT NULL
    CHECK (trigger_type IN ('new_listing', 'price_drop', 'back_in_stock', 'photo_update', 'manual')),

  -- Results
  fb_post_id TEXT,
  error_message TEXT,

  -- Moderation (for casagrown_page target)
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at TIMESTAMPTZ
);

CREATE INDEX idx_fb_post_queue_status ON public.fb_post_queue(status, created_at);
CREATE INDEX idx_fb_post_queue_seller ON public.fb_post_queue(seller_id, created_at);
CREATE INDEX idx_fb_post_queue_product ON public.fb_post_queue(product_id);

ALTER TABLE public.fb_post_queue ENABLE ROW LEVEL SECURITY;

-- Service role full access (edge functions)
CREATE POLICY "Service role full access on fb_post_queue"
  ON public.fb_post_queue TO service_role
  USING (true) WITH CHECK (true);

-- Admins can manage all posts (moderation)
CREATE POLICY "Admins can manage fb_post_queue"
  ON public.fb_post_queue
  USING (has_staff_role(auth.uid(), 'admin'::staff_role));

-- Sellers can view their own posts
CREATE POLICY "Sellers can view own fb posts"
  ON public.fb_post_queue FOR SELECT
  TO authenticated
  USING (seller_id = auth.uid());

GRANT SELECT ON public.fb_post_queue TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fb_post_queue TO service_role;

-- 3. Rate-limit check function
CREATE OR REPLACE FUNCTION public.fb_post_count_today(
  p_seller_id UUID,
  p_target TEXT
) RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*)::int
  FROM fb_post_queue
  WHERE seller_id = p_seller_id
    AND target = p_target
    AND status IN ('approved', 'posted')
    AND created_at >= (now() AT TIME ZONE 'UTC')::date;
$$;

-- 4. Trigger function: queue FB posts on product changes
CREATE OR REPLACE FUNCTION public.trg_queue_fb_page_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trigger_type TEXT;
  v_conn RECORD;
  v_booth RECORD;
  v_message TEXT;
  v_link TEXT;
  v_photo_url TEXT;
  v_fulfillment TEXT;
  v_site_url TEXT := coalesce(current_setting('app.settings.site_url', true), 'https://casagrown.com');
  v_seller_today INT;
  v_cg_today INT;
BEGIN
  -- Determine trigger type
  IF TG_OP = 'INSERT' THEN
    -- Only fire for active, non-draft products
    IF NOT NEW.is_active OR NEW.is_draft THEN RETURN NEW; END IF;
    v_trigger_type := 'new_listing';

  ELSIF TG_OP = 'UPDATE' THEN
    -- New listing: was inactive/draft, now active
    IF NEW.is_active AND NOT NEW.is_draft AND (NOT OLD.is_active OR OLD.is_draft) THEN
      v_trigger_type := 'new_listing';

    -- Price drop
    ELSIF NEW.price_usd < OLD.price_usd AND NEW.is_active THEN
      v_trigger_type := 'price_drop';

    -- Back in stock
    ELSIF OLD.inventory = 0 AND NEW.inventory > 0 AND NEW.is_active THEN
      v_trigger_type := 'back_in_stock';

    -- Photo update (only if photos actually changed)
    ELSIF NEW.photos IS DISTINCT FROM OLD.photos AND NEW.is_active AND array_length(NEW.photos, 1) > 0 THEN
      v_trigger_type := 'photo_update';

    ELSE
      -- No relevant change
      RETURN NEW;
    END IF;
  END IF;

  -- Get seller's FB connection
  SELECT * INTO v_conn
  FROM seller_fb_connections
  WHERE user_id = NEW.seller_id
    AND status = 'connected'
    AND fb_page_id IS NOT NULL;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Get booth info
  SELECT * INTO v_booth
  FROM market_booths
  WHERE id = NEW.booth_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Build fulfillment text
  v_fulfillment := '';
  IF v_booth.offers_delivery AND v_booth.offers_pickup THEN
    v_fulfillment := '🚗 Delivery · 📍 Pickup';
  ELSIF v_booth.offers_delivery THEN
    v_fulfillment := '🚗 Delivery';
  ELSIF v_booth.offers_pickup THEN
    v_fulfillment := '📍 Pickup';
  END IF;

  -- Build product link (booth-specific URL)
  v_link := v_site_url || '/market/booth/' || NEW.booth_id || '/product/' || NEW.id;

  -- Build post message based on trigger type
  CASE v_trigger_type
    WHEN 'new_listing' THEN
      v_message := '🌱 Just listed: **' || NEW.name || '** — $' || ROUND(NEW.price_usd, 2) || '/' || NEW.unit;
    WHEN 'price_drop' THEN
      v_message := '🔥 Price drop! **' || NEW.name || '** now $' || ROUND(NEW.price_usd, 2) || '/' || NEW.unit ||
        ' (was $' || ROUND(OLD.price_usd, 2) || ')';
    WHEN 'back_in_stock' THEN
      v_message := '📦 Back in stock: **' || NEW.name || '** — $' || ROUND(NEW.price_usd, 2) || '/' || NEW.unit;
    WHEN 'photo_update' THEN
      v_message := '📸 Updated: **' || NEW.name || '** — $' || ROUND(NEW.price_usd, 2) || '/' || NEW.unit;
  END CASE;

  -- Add description (truncated)
  IF NEW.description IS NOT NULL AND length(NEW.description) > 0 THEN
    v_message := v_message || E'\n' || left(NEW.description, 200);
    IF length(NEW.description) > 200 THEN
      v_message := v_message || '...';
    END IF;
  END IF;

  -- Add fulfillment + inventory
  IF NEW.inventory > 0 THEN
    v_message := v_message || E'\n' || NEW.inventory || ' available';
  END IF;
  IF v_fulfillment != '' THEN
    v_message := v_message || ' · ' || v_fulfillment;
  END IF;

  v_message := v_message || E'\n\nOrder now →';

  -- Get first photo URL
  v_photo_url := NULL;
  IF NEW.photos IS NOT NULL AND array_length(NEW.photos, 1) > 0 THEN
    v_photo_url := NEW.photos[1];
  END IF;

  -- Queue for seller's page (if opted in)
  IF v_conn.auto_post_enabled THEN
    v_seller_today := fb_post_count_today(NEW.seller_id, 'seller_page');
    IF v_seller_today < 3 THEN
      INSERT INTO fb_post_queue (
        seller_id, booth_id, product_id, target,
        post_message, post_link, post_photo_url,
        status, trigger_type
      ) VALUES (
        NEW.seller_id, NEW.booth_id, NEW.id, 'seller_page',
        v_message, v_link, v_photo_url,
        'approved', v_trigger_type
      );
    END IF;
  END IF;

  -- Queue for CasaGrown's page (if opted in, pending moderation)
  IF v_conn.casagrown_post_enabled THEN
    v_cg_today := fb_post_count_today(NEW.seller_id, 'casagrown_page');
    IF v_cg_today < 2 THEN  -- max 2 per seller per day on CasaGrown page
      INSERT INTO fb_post_queue (
        seller_id, booth_id, product_id, target,
        post_message, post_link, post_photo_url,
        status, trigger_type
      ) VALUES (
        NEW.seller_id, NEW.booth_id, NEW.id, 'casagrown_page',
        v_message, v_link, v_photo_url,
        'pending', v_trigger_type  -- requires admin approval
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Create trigger on market_products
DROP TRIGGER IF EXISTS trg_queue_fb_page_post ON public.market_products;
CREATE TRIGGER trg_queue_fb_page_post
  AFTER INSERT OR UPDATE ON public.market_products
  FOR EACH ROW
  EXECUTE FUNCTION trg_queue_fb_page_post();
