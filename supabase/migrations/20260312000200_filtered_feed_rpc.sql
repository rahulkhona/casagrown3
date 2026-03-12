-- Migration: get_filtered_feed RPC
-- Server-side feed filtering for expired posts, blocked content, and ghosted users.
-- Uses expires_at (index-backed) instead of joining post_type_policies at query time.

CREATE OR REPLACE FUNCTION get_filtered_feed(
  p_community_h3 text,
  p_viewer_id uuid
)
RETURNS TABLE (
  id uuid,
  author_id uuid,
  type text,
  reach text,
  content text,
  created_at timestamptz,
  community_h3_index text,
  expires_at timestamptz,
  -- Author info
  author_full_name text,
  author_avatar_url text,
  author_phone_verified boolean,
  -- Community info
  community_name text
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    p.id,
    p.author_id,
    p.type::text,
    p.reach::text,
    p.content,
    p.created_at,
    p.community_h3_index,
    p.expires_at,
    -- Author
    pr.full_name AS author_full_name,
    pr.avatar_url AS author_avatar_url,
    pr.phone_verified AS author_phone_verified,
    -- Community
    c.name AS community_name
  FROM posts p
  JOIN profiles pr ON pr.id = p.author_id
  LEFT JOIN communities c ON c.h3_index = p.community_h3_index
  WHERE
    -- Community filter (same as current: community or global)
    (p.community_h3_index = p_community_h3 OR p.community_h3_index IS NULL)
    -- Status filter
    AND p.status = 'available'
    -- Expiration filter (index-backed via idx_posts_active_feed)
    AND p.expires_at > now()
    -- Ghosted user filter: hide ghosted users' posts UNLESS viewer is the author
    AND (pr.is_ghosted = false OR p.author_id = p_viewer_id)
    -- Blocked category filter: exclude posts whose sell/buy category is restricted
    -- Checks global restrictions (all jurisdiction columns NULL) and any matching jurisdiction
    AND NOT EXISTS (
      SELECT 1 FROM category_restrictions cr
      JOIN want_to_sell_details wts ON wts.post_id = p.id
      WHERE cr.category_name = wts.category
        AND (cr.country_iso_3 IS NULL AND cr.state_id IS NULL AND cr.county_id IS NULL AND cr.city_id IS NULL)
    )
    AND NOT EXISTS (
      SELECT 1 FROM category_restrictions cr
      JOIN want_to_buy_details wtb ON wtb.post_id = p.id
      WHERE cr.category_name = wtb.category
        AND (cr.country_iso_3 IS NULL AND cr.state_id IS NULL AND cr.county_id IS NULL AND cr.city_id IS NULL)
    )
    -- Blocked product filter: exclude posts whose produce_name is blocked globally
    AND NOT EXISTS (
      SELECT 1 FROM blocked_products bp
      JOIN want_to_sell_details wts ON wts.post_id = p.id
      WHERE LOWER(bp.product_name) = LOWER(wts.produce_name)
        AND (bp.country_iso_3 IS NULL AND bp.state_id IS NULL AND bp.county_id IS NULL AND bp.city_id IS NULL)
    )
  ORDER BY p.created_at DESC;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_filtered_feed(text, uuid) TO authenticated;

