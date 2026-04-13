-- Migration: follow_recommendations
-- Description: Adds RPCs for person-centric following recommendations and user search.

CREATE OR REPLACE FUNCTION get_recommended_people_to_follow(p_user_id uuid)
RETURNS TABLE (
  booth_id uuid,
  owner_id uuid,
  owner_name text,
  avatar_url text,
  reason text
) AS $$
DECLARE
  v_home extensions.geometry;
BEGIN
  -- We use home_location directly since we don't necessarily have zip-fallback here
  SELECT home_location INTO v_home FROM profiles WHERE id = p_user_id;

  RETURN QUERY
  WITH prior_dms AS (
    SELECT CASE WHEN participant_a = p_user_id THEN participant_b ELSE participant_a END as peer_id
    FROM market_conversations
    WHERE participant_a = p_user_id OR participant_b = p_user_id
  ),
  prior_txns AS (
    SELECT seller_id AS peer_id FROM market_orders WHERE buyer_id = p_user_id
    UNION
    SELECT buyer_id AS peer_id FROM market_orders WHERE seller_id = p_user_id
  ),
  nearby AS (
    SELECT id AS peer_id
    FROM profiles
    WHERE v_home IS NOT NULL AND extensions.ST_DWithin(home_location, v_home, 804.672) -- 0.5 miles => 804.672 meters
    AND id != p_user_id
  ),
  combined_raw AS (
    SELECT peer_id, 1 as priority, 'Had transaction' AS rsn FROM prior_txns
    UNION ALL
    SELECT peer_id, 2 as priority, 'Had conversation' AS rsn FROM prior_dms
    UNION ALL
    SELECT peer_id, 3 as priority, 'Nearby neighbor' AS rsn FROM nearby
  ),
  combined AS (
    SELECT DISTINCT ON (peer_id) peer_id, rsn as reason
    FROM combined_raw
    ORDER BY peer_id, priority ASC
  )
  SELECT 
    b.id as booth_id,
    p.id as owner_id,
    p.full_name as owner_name,
    p.avatar_url,
    c.reason
  FROM combined c
  JOIN profiles p ON p.id = c.peer_id
  -- We join with market_booths because we functionally "follow" booths.
  -- We do not filter by b.status = 'published' because new users organically sign up 
  -- and do transactions before formally publishing a storefront setup.
  JOIN market_booths b ON b.owner_id = p.id
  WHERE NOT EXISTS (
    SELECT 1 FROM market_followers f WHERE f.follower_id = p_user_id AND f.booth_id = b.id
  )
  AND c.peer_id != p_user_id
  LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION search_people_to_follow(p_query text, p_user_id uuid)
RETURNS TABLE (
  booth_id uuid,
  owner_id uuid,
  owner_name text,
  avatar_url text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id as booth_id,
    p.id as owner_id,
    p.full_name as owner_name,
    p.avatar_url
  FROM profiles p
  JOIN market_booths b ON b.owner_id = p.id
  WHERE (
    p.full_name ILIKE '%' || p_query || '%' OR
    p.email ILIKE '%' || p_query || '%' OR
    b.name ILIKE '%' || p_query || '%'
  )
  AND p.id != p_user_id
  AND NOT EXISTS (
    SELECT 1 FROM market_followers f WHERE f.follower_id = p_user_id AND f.booth_id = b.id
  )
  LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
