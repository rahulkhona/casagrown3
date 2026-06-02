-- Migration: Best-Benefit Promotion Resolution (Guarantees the user always gets the highest value active discount/reductions)
-- =====================================================================================================================

SET search_path TO public, extensions;

-- 1. Update get_seller_stripe_fee_handling to prioritize 'absorb' overrides over 'pass_through' and 'keep_tier'
CREATE OR REPLACE FUNCTION public.get_seller_stripe_fee_handling(p_seller_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan TEXT;
  v_override TEXT;
  v_absorb_fees BOOLEAN;
  v_handling TEXT;
BEGIN
  -- Get active subscription plan name (default to 'lite' for legacy/free profiles)
  SELECT COALESCE(plan, 'lite') INTO v_plan
  FROM seller_subscriptions
  WHERE user_id = p_seller_id
    AND status IN ('active', 'trialing')
  LIMIT 1;

  IF v_plan IS NULL THEN
    v_plan := 'lite';
  END IF;

  IF v_plan = 'free' THEN
    v_plan := 'lite';
  END IF;

  -- Check active promotion discount override, prioritizing the best user benefit ('absorb' > 'pass_through' > 'keep_tier')
  SELECT usd.stripe_fee_handling_override INTO v_override
  FROM user_subscription_discounts usd
  JOIN crm_promo_subscription_discounts cpsd ON usd.discount_id = cpsd.id
  WHERE usd.user_id = p_seller_id
    AND cpsd.plan = v_plan
    AND usd.status = 'active'
    AND (usd.expires_at IS NULL OR usd.expires_at > now())
  ORDER BY 
    CASE usd.stripe_fee_handling_override 
      WHEN 'absorb' THEN 1 
      WHEN 'pass_through' THEN 2 
      ELSE 3 
    END ASC, 
    usd.applied_at DESC
  LIMIT 1;

  IF v_override IS NOT NULL AND v_override != 'keep_tier' THEN
    RETURN v_override;
  END IF;

  -- Check seller subscription-level manual setting (absorb_stripe_fees boolean)
  SELECT absorb_stripe_fees INTO v_absorb_fees
  FROM seller_subscriptions
  WHERE user_id = p_seller_id
    AND plan = v_plan
    AND status IN ('active', 'trialing')
  LIMIT 1;

  IF COALESCE(v_absorb_fees, false) THEN
    RETURN 'absorb';
  END IF;

  -- Fallback to centralized subscription_tiers setting
  SELECT stripe_fee_handling INTO v_handling
  FROM subscription_tiers
  WHERE tier_name = v_plan;

  IF v_handling IS NOT NULL THEN
    RETURN v_handling;
  END IF;

  -- Central global platform settings fallback for pro
  IF v_plan = 'pro' THEN
    SELECT pro_stripe_fee_handling INTO v_handling FROM platform_settings LIMIT 1;
    IF v_handling IS NOT NULL THEN
      RETURN v_handling;
    END IF;
  END IF;

  RETURN 'pass_through';
END;
$$;

-- 2. Update get_seller_fee_rate to prioritize the maximum active platform fee reduction percentage
CREATE OR REPLACE FUNCTION public.get_seller_fee_rate(p_seller_id UUID)
RETURNS NUMERIC(5,2)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan TEXT;
  v_fee_rate NUMERIC(5,2);
  v_reduction INTEGER;
  v_country_code VARCHAR(3);
BEGIN
  -- Get active subscription plan name (default to 'lite' for legacy/free profiles)
  SELECT COALESCE(plan, 'lite') INTO v_plan
  FROM seller_subscriptions
  WHERE user_id = p_seller_id
    AND status IN ('active', 'trialing');

  IF v_plan IS NULL THEN
    v_plan := 'lite';
  END IF;

  IF v_plan = 'free' THEN
    v_plan := 'lite';
  END IF;

  -- Pull fee rate from centralized subscription_tiers
  SELECT platform_fee_pct INTO v_fee_rate
  FROM subscription_tiers
  WHERE tier_name = v_plan;

  -- Graceful fallback if tier not found, check platform_fees table as legacy fallback
  IF v_fee_rate IS NULL THEN
    SELECT COALESCE(country_code, 'USA') INTO v_country_code FROM profiles WHERE id = p_seller_id;
    
    SELECT CASE WHEN v_plan = 'lite' THEN COALESCE(free_fee_pct, fees * 100, 10) ELSE COALESCE(pro_fee_pct, 5) END
    INTO v_fee_rate
    FROM platform_fees
    WHERE country_code = v_country_code
    ORDER BY creation_date DESC
    LIMIT 1;
  END IF;

  IF v_fee_rate IS NULL THEN
    v_fee_rate := 10.00;
  END IF;

  -- Apply the maximum active platform fee reduction percentage from eligible active campaigns
  SELECT COALESCE(usd.platform_fee_reduction_pct, 0) INTO v_reduction
  FROM user_subscription_discounts usd
  JOIN crm_promo_subscription_discounts cpsd ON usd.discount_id = cpsd.id
  WHERE usd.user_id = p_seller_id
    AND cpsd.plan = v_plan
    AND usd.status = 'active'
    AND (usd.expires_at IS NULL OR usd.expires_at > now())
  ORDER BY usd.platform_fee_reduction_pct DESC, usd.applied_at DESC
  LIMIT 1;

  IF v_reduction IS NOT NULL THEN
    v_fee_rate := GREATEST(0.00, v_fee_rate - v_reduction);
  END IF;

  RETURN v_fee_rate;
END;
$$;
