-- Buyer Notifications Enhancement
-- When a new product is listed, also notify buyers who expressed interest
-- in similar produce (via produce_interests from onboarding)
-- AND match searchers from grower_search_notifications (buyers who searched).
--
-- This adds a buyer_product_notifications queue table for digest + push delivery.

-- Queue table for buyer-side "product available" notifications
CREATE TABLE IF NOT EXISTS buyer_product_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES market_products(id) ON DELETE CASCADE,
  match_source text NOT NULL DEFAULT 'interest',
  -- 'interest' = matched from produce_interests (onboarding)
  -- 'search'   = matched from a recent search in buzz
  -- 'watch'    = matched from product_watches
  keyword     text,
  notified_at timestamptz,
  created_at  timestamptz DEFAULT now(),
  -- Prevent duplicate notifications for same buyer+product
  UNIQUE(buyer_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_buyer_product_notif_pending
  ON buyer_product_notifications (buyer_id) WHERE notified_at IS NULL;

-- Enhanced trigger: when a product goes active, queue buyer notifications
-- for produce_interests AND recent searches (last 7 days)
CREATE OR REPLACE FUNCTION queue_buyer_product_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_product_keywords text;
  v_seller_h3 text;
  v_seller_h3_neighbors text[];
  v_interest record;
  v_search record;
BEGIN
  -- Only fire when product becomes active
  IF NEW.is_active = false OR NEW.is_draft = true THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active = true AND OLD.is_draft = false THEN
    RETURN NEW; -- Already active, not new
  END IF;

  -- Build searchable text
  v_product_keywords := lower(
    COALESCE(NEW.name, '') || ' ' ||
    COALESCE(NEW.description, '') || ' ' ||
    COALESCE(NEW.category, '')
  );

  -- Get seller's H3 zone for proximity matching
  SELECT home_community_h3_index, nearby_community_h3_indices
  INTO v_seller_h3, v_seller_h3_neighbors
  FROM profiles WHERE id = NEW.seller_id;

  -- ═══════════════════════════════════════════
  -- Pass 1: Match produce_interests (onboarding)
  -- Buyers who said they're interested in this type of produce
  -- ═══════════════════════════════════════════
  FOR v_interest IN
    SELECT DISTINCT pi.user_id, pi.produce_name
    FROM produce_interests pi
    JOIN profiles p ON p.id = pi.user_id
    WHERE pi.user_id != NEW.seller_id
      AND v_product_keywords LIKE '%' || lower(pi.produce_name) || '%'
      -- Same or nearby H3 zone
      AND (
        p.home_community_h3_index = v_seller_h3
        OR p.home_community_h3_index = ANY(v_seller_h3_neighbors)
        OR v_seller_h3 = ANY(p.nearby_community_h3_indices)
      )
  LOOP
    INSERT INTO buyer_product_notifications (buyer_id, product_id, match_source, keyword)
    VALUES (v_interest.user_id, NEW.id, 'interest', v_interest.produce_name)
    ON CONFLICT (buyer_id, product_id) DO NOTHING;
  END LOOP;

  -- ═══════════════════════════════════════════
  -- Pass 2: Match recent searches in buzz
  -- Buyers who searched for matching keywords in last 7 days
  -- ═══════════════════════════════════════════
  FOR v_search IN
    SELECT DISTINCT gsn.searcher_id, gsn.keyword
    FROM grower_search_notifications gsn
    WHERE gsn.searcher_id != NEW.seller_id
      AND gsn.created_at > now() - interval '7 days'
      AND v_product_keywords LIKE '%' || lower(gsn.keyword) || '%'
      -- Same or nearby H3 zone
      AND (
        gsn.community_h3 = v_seller_h3
        OR gsn.community_h3 = ANY(v_seller_h3_neighbors)
      )
  LOOP
    INSERT INTO buyer_product_notifications (buyer_id, product_id, match_source, keyword)
    VALUES (v_search.searcher_id, NEW.id, 'search', v_search.keyword)
    ON CONFLICT (buyer_id, product_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Create trigger on market_products
DROP TRIGGER IF EXISTS trg_queue_buyer_product_notifications ON market_products;
CREATE TRIGGER trg_queue_buyer_product_notifications
  AFTER INSERT OR UPDATE ON market_products
  FOR EACH ROW
  EXECUTE FUNCTION queue_buyer_product_notifications();

-- RLS: buyers can see their own notifications
ALTER TABLE buyer_product_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers see own product notifications"
  ON buyer_product_notifications FOR SELECT
  TO authenticated
  USING (buyer_id = auth.uid());

CREATE POLICY "Service role full access on buyer_product_notifications"
  ON buyer_product_notifications
  USING (auth.role() = 'service_role');
