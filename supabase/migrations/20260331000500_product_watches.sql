-- ============================================================================
-- Migration: Product Watches + Notification Trigger
--
-- 1. product_watches table for "notify me when this becomes available" from Buzz Find
-- 2. Trigger on market_products to notify watchers when matching products go live
-- 3. RLS policies
-- ============================================================================

-- 1. Create product_watches table
CREATE TABLE IF NOT EXISTS public.product_watches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keywords TEXT NOT NULL,
  fulfillment_type TEXT NOT NULL DEFAULT 'all',
  radius_miles INTEGER NOT NULL DEFAULT 10,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  state_code TEXT,
  community_h3_index TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.product_watches IS 'Buzz Find "notify me" watches — auto-expire after 7 days';

CREATE INDEX idx_pw_user ON product_watches(user_id);
CREATE INDEX idx_pw_active ON product_watches(expires_at);

-- 2. RLS policies
ALTER TABLE public.product_watches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own watches"
  ON public.product_watches FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watches"
  ON public.product_watches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own watches"
  ON public.product_watches FOR DELETE
  USING (auth.uid() = user_id);

-- 3. Trigger: notify watchers when a matching product goes live
CREATE OR REPLACE FUNCTION public.notify_product_watchers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_watch RECORD;
  v_seller_state TEXT;
  v_product_keywords TEXT;
BEGIN
  -- Only fire when product becomes active (new active product or draft→active)
  IF NEW.is_active = false THEN RETURN NEW; END IF;
  IF NEW.is_draft = true THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active = true AND OLD.is_draft = false THEN
    RETURN NEW; -- Already active, not a new publication
  END IF;

  -- Build searchable text from product name + description + category
  v_product_keywords := lower(
    COALESCE(NEW.name, '') || ' ' ||
    COALESCE(NEW.description, '') || ' ' ||
    COALESCE(NEW.category, '')
  );

  -- Get seller's state for state-boundary check
  SELECT s.code INTO v_seller_state
  FROM profiles p
  JOIN zip_codes zc ON zc.zip_code = p.zip_code
  JOIN cities ci ON ci.id = zc.city_id
  JOIN states s ON s.id = ci.state_id
  WHERE p.id = NEW.seller_id
  LIMIT 1;

  -- Find active watches with matching keywords
  FOR v_watch IN
    SELECT pw.*
    FROM product_watches pw
    WHERE pw.expires_at > now()
      AND pw.user_id != NEW.seller_id  -- Don't notify the seller themselves
  LOOP
    -- Check keyword match (any watch keyword word appears in product text)
    DECLARE
      v_keyword_words TEXT[];
      v_word TEXT;
      v_matched BOOLEAN := false;
    BEGIN
      v_keyword_words := string_to_array(lower(v_watch.keywords), ' ');
      FOREACH v_word IN ARRAY v_keyword_words LOOP
        IF length(v_word) >= 3 AND v_product_keywords LIKE '%' || v_word || '%' THEN
          v_matched := true;
          EXIT;
        END IF;
      END LOOP;

      IF NOT v_matched THEN CONTINUE; END IF;
    END;

    -- State boundary check
    IF v_watch.state_code IS NOT NULL AND v_seller_state IS NOT NULL
       AND v_watch.state_code != v_seller_state THEN
      CONTINUE; -- Skip cross-state matches
    END IF;

    -- Send notification via existing market notification system
    PERFORM notify_market_event(
      v_watch.user_id,
      '🔍 A product matching "' || v_watch.keywords || '" is now available: ' || NEW.name || ' — $' || ROUND(NEW.price_usd, 2) || '/' || NEW.unit,
      '/market'
    );

    -- Delete the fulfilled watch (one-time notification)
    DELETE FROM product_watches WHERE id = v_watch.id;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_notify_product_watchers ON market_products;
CREATE TRIGGER trg_notify_product_watchers
  AFTER INSERT OR UPDATE ON market_products
  FOR EACH ROW
  EXECUTE FUNCTION notify_product_watchers();

-- 4. Cleanup cron for expired watches (daily at 4am)
SELECT cron.schedule(
  'cleanup-expired-product-watches',
  '0 4 * * *',
  $$DELETE FROM product_watches WHERE expires_at < now()$$
);
