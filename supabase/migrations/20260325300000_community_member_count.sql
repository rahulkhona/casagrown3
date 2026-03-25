-- =============================================================================
-- Community member count RPC + pioneer banner support
-- =============================================================================

-- Lightweight RPC to get the number of members in a community
CREATE OR REPLACE FUNCTION public.get_community_member_count(
  target_h3 text
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(COUNT(*)::int, 0)
  FROM public.profiles
  WHERE home_community_h3_index = target_h3
    AND profile_completed_at IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_community_member_count TO authenticated;
