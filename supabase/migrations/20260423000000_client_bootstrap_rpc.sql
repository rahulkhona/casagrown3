-- ============================================================================
-- Client Bootstrap RPC
-- Consolidates 10 post-hydration client queries into a single database call.
-- Returns: profile data, market config, badge counts, and stamps last_active.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_client_bootstrap(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile     RECORD;
  v_config      JSONB;
  v_unread_dm   int := 0;
  v_unread_comm bigint := 0;
  v_actionable  int := 0;
BEGIN
  -- 1. Market config (always needed, even for guests)
  v_config := public.get_market_config();

  -- 2. If no user, return config-only payload (guest mode)
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'market_config', v_config,
      'profile', NULL,
      'badges', NULL
    );
  END IF;

  -- 3. Profile: all columns needed by useAuth + Navbar in one shot
  SELECT full_name, avatar_url, is_banned, ban_reason,
         tos_accepted_at, profile_completed_at, referral_code
  INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

  -- 4. DM unread count (same logic as BottomNav useUnreadMessageCount)
  SELECT COALESCE(SUM(
    CASE
      WHEN participant_a = p_user_id THEN unread_count_a
      WHEN participant_b = p_user_id THEN unread_count_b
      ELSE 0
    END
  ), 0)::int
  INTO v_unread_dm
  FROM public.market_conversations
  WHERE participant_a = p_user_id OR participant_b = p_user_id;

  -- 5. Actionable order count (same logic as BottomNav useActionableOrderCount)
  SELECT COUNT(*)::int INTO v_actionable
  FROM public.market_orders
  WHERE (
    (seller_id = p_user_id AND status = 'pending')
    OR (buyer_id = p_user_id AND status = 'delivered')
    OR (
      (buyer_id = p_user_id OR seller_id = p_user_id)
      AND status IN ('disputed', 'escalated')
    )
  );

  -- 6. Community unread count (reuses existing auth-aware RPC)
  v_unread_comm := COALESCE(public.get_my_community_unread_count(), 0);

  -- 7. Side effect: stamp last_active_at (replaces the fire-and-forget UPDATE in useAuth)
  UPDATE public.profiles
  SET last_active_at = NOW()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'market_config', v_config,
    'profile', jsonb_build_object(
      'full_name', v_profile.full_name,
      'avatar_url', v_profile.avatar_url,
      'is_banned', COALESCE(v_profile.is_banned, false),
      'ban_reason', v_profile.ban_reason,
      'tos_accepted_at', v_profile.tos_accepted_at,
      'profile_completed_at', v_profile.profile_completed_at
    ),
    'badges', jsonb_build_object(
      'dm_unread', v_unread_dm,
      'community_unread', v_unread_comm,
      'actionable_orders', v_actionable
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_client_bootstrap IS
  'Single RPC for client-side hydration. Returns profile, market config, and badge counts. Stamps last_active_at as a side effect.';
