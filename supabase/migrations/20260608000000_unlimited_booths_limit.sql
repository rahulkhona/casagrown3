-- Migration: Support unlimited booth limit by checking if max_booths is negative
-- ============================================================================

SET search_path TO public, extensions;

CREATE OR REPLACE FUNCTION public.check_booth_creation_limit(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan TEXT;
  v_max_booths INTEGER;
  v_current_booths INTEGER;
BEGIN
  SELECT COALESCE(plan, 'lite') INTO v_plan
  FROM seller_subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trialing');

  IF v_plan = 'free' THEN
    v_plan := 'lite';
  END IF;

  SELECT max_booths INTO v_max_booths
  FROM subscription_tiers
  WHERE tier_name = v_plan;

  IF v_max_booths IS NULL THEN
    v_max_booths := 1;
  END IF;

  -- A negative value (e.g. -1) for max_booths means unlimited booths
  IF v_max_booths < 0 THEN
    RETURN TRUE;
  END IF;

  -- Count existing active booths for this owner (not archived)
  SELECT COUNT(*) INTO v_current_booths
  FROM market_booths
  WHERE owner_id = p_user_id
    AND status != 'archived';

  RETURN v_current_booths < v_max_booths;
END;
$$;
