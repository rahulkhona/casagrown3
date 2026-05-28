-- Update get_client_bootstrap to dynamically check pro_testers table
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
  v_email       text;
  v_is_pro      boolean := false;
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
         tos_accepted_at, profile_completed_at, referral_code, is_pro
  INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

  -- Resolve user email from auth.users to check pro_testers allowlist
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;

  v_is_pro := COALESCE(v_profile.is_pro, false) OR (
    v_email IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.pro_testers WHERE lower(email) = lower(v_email)
    )
  );

  -- 4. DM unread count
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

  -- 5. Actionable order count
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

  -- 6. Community unread count
  v_unread_comm := COALESCE(public.get_my_community_unread_count(), 0);

  -- 7. Side effect: stamp last_active_at
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
      'profile_completed_at', v_profile.profile_completed_at,
      'referral_code', v_profile.referral_code,
      'is_pro', v_is_pro
    ),
    'badges', jsonb_build_object(
      'dm_unread', v_unread_dm,
      'community_unread', v_unread_comm,
      'actionable_orders', v_actionable
    )
  );
END;
$$;


-- Update get_seller_fee_rate to dynamically check pro_testers table
CREATE OR REPLACE FUNCTION public.get_seller_fee_rate(p_seller_id UUID)
RETURNS NUMERIC(5,2)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_pro BOOLEAN;
  v_free_rate NUMERIC(5,2);
  v_pro_rate NUMERIC(5,2);
  v_email TEXT;
BEGIN
  -- Resolve email to check pro_testers
  SELECT email INTO v_email FROM auth.users WHERE id = p_seller_id;

  -- Check if seller has an active Pro subscription OR is a pro tester
  SELECT (
    EXISTS(
      SELECT 1 FROM seller_subscriptions
      WHERE user_id = p_seller_id
        AND plan = 'pro'
        AND status IN ('active', 'trialing')
    ) OR (
      v_email IS NOT NULL AND EXISTS(
        SELECT 1 FROM pro_testers WHERE lower(email) = lower(v_email)
      )
    )
  ) INTO v_is_pro;

  -- Get fee rates from platform_fees (latest USA entry)
  SELECT
    COALESCE(free_fee_pct, fees * 100, 10),
    COALESCE(pro_fee_pct, 5)
  INTO v_free_rate, v_pro_rate
  FROM platform_fees
  WHERE country_code = 'USA'
  ORDER BY creation_date DESC
  LIMIT 1;

  -- Safe fallback if platform_fees is empty
  IF v_free_rate IS NULL THEN v_free_rate := 10; END IF;
  IF v_pro_rate IS NULL THEN v_pro_rate := 5; END IF;

  RETURN CASE WHEN v_is_pro THEN v_pro_rate ELSE v_free_rate END;
END;
$$;
