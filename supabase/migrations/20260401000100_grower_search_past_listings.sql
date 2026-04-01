-- Grower search: also match against past product listings
-- When someone searches in Buzz, notify sellers who PREVIOUSLY listed
-- matching products but don't currently have them active.
-- Adds match_source to track whether the match came from garden info or past listing.

-- Add match_source column to grower_search_notifications
ALTER TABLE grower_search_notifications
  ADD COLUMN IF NOT EXISTS match_source text DEFAULT 'garden';
  -- 'garden' = matched from grower_produces (backyard produce)
  -- 'past_listing' = matched from a previous market_products listing

-- Add past_product_id for deep-linking pre-fill
ALTER TABLE grower_search_notifications
  ADD COLUMN IF NOT EXISTS past_product_id uuid REFERENCES market_products(id);

-- Replace the queue function to include past product matching
CREATE OR REPLACE FUNCTION queue_grower_search_match(
  p_keywords text,
  p_community_h3 text,
  p_searcher_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  word text;
  matched_grower record;
BEGIN
  -- Split keywords into individual words
  FOR word IN SELECT unnest(string_to_array(lower(trim(p_keywords)), ' '))
  LOOP
    IF length(word) < 2 THEN CONTINUE; END IF;

    -- ═══════════════════════════════════════════
    -- Pass 1: Match from grower_produces (garden info)
    -- ═══════════════════════════════════════════
    FOR matched_grower IN
      SELECT DISTINCT gp.user_id
      FROM grower_produces gp
      JOIN profiles p ON p.id = gp.user_id
      WHERE lower(gp.produce_name) ILIKE '%' || word || '%'
        AND gp.notify_on_search = true
        AND gp.user_id != p_searcher_id
        AND (p.home_community_h3_index = p_community_h3
             OR p_community_h3 = ANY(p.nearby_community_h3_indices))
        -- Skip if grower has an active product matching this keyword
        AND NOT EXISTS (
          SELECT 1 FROM market_products mp
          WHERE mp.seller_id = gp.user_id
            AND mp.is_active = true
            AND mp.is_draft = false
            AND (lower(mp.name) ILIKE '%' || word || '%'
                 OR lower(mp.description) ILIKE '%' || word || '%')
        )
        -- Skip if already queued for this keyword in last 24h
        AND NOT EXISTS (
          SELECT 1 FROM grower_search_notifications gsn
          WHERE gsn.grower_id = gp.user_id
            AND lower(gsn.keyword) = word
            AND gsn.created_at > now() - interval '24 hours'
        )
    LOOP
      INSERT INTO grower_search_notifications (grower_id, keyword, searcher_id, community_h3, match_source)
      VALUES (matched_grower.user_id, word, p_searcher_id, p_community_h3, 'garden')
      ON CONFLICT DO NOTHING;
    END LOOP;

    -- ═══════════════════════════════════════════
    -- Pass 2: Match from past product listings
    -- Sellers who previously listed a matching product
    -- but don't currently have it active
    -- ═══════════════════════════════════════════
    FOR matched_grower IN
      SELECT DISTINCT ON (mp.seller_id)
        mp.seller_id AS user_id,
        mp.id AS product_id
      FROM market_products mp
      JOIN profiles p ON p.id = mp.seller_id
      WHERE (lower(mp.name) ILIKE '%' || word || '%'
             OR lower(mp.description) ILIKE '%' || word || '%')
        AND mp.seller_id != p_searcher_id
        -- Only in same/nearby H3 zone
        AND (p.home_community_h3_index = p_community_h3
             OR p_community_h3 = ANY(p.nearby_community_h3_indices))
        -- Only match sellers who DO NOT currently have an active listing for this
        AND NOT EXISTS (
          SELECT 1 FROM market_products mp2
          WHERE mp2.seller_id = mp.seller_id
            AND mp2.is_active = true
            AND mp2.is_draft = false
            AND (lower(mp2.name) ILIKE '%' || word || '%'
                 OR lower(mp2.description) ILIKE '%' || word || '%')
        )
        -- Skip if already in garden match pass
        AND NOT EXISTS (
          SELECT 1 FROM grower_search_notifications gsn
          WHERE gsn.grower_id = mp.seller_id
            AND lower(gsn.keyword) = word
            AND gsn.created_at > now() - interval '24 hours'
        )
      ORDER BY mp.seller_id, mp.created_at DESC  -- pick most recent listing
    LOOP
      INSERT INTO grower_search_notifications (
        grower_id, keyword, searcher_id, community_h3, match_source, past_product_id
      )
      VALUES (
        matched_grower.user_id, word, p_searcher_id, p_community_h3,
        'past_listing', matched_grower.product_id
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;
