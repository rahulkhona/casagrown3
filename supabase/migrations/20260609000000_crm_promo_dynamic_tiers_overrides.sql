-- Migration: Add dynamic tier overrides (discount, fee reduction, Stripe fee handling) to CRM Promotion discounts
-- =========================================================================================================

SET search_path TO public, extensions;

-- 1. Add override columns to crm_promo_subscription_discounts
ALTER TABLE public.crm_promo_subscription_discounts ADD COLUMN IF NOT EXISTS platform_fee_reduction_pct INTEGER NOT NULL DEFAULT 0 CHECK (platform_fee_reduction_pct BETWEEN 0 AND 100);
ALTER TABLE public.crm_promo_subscription_discounts ADD COLUMN IF NOT EXISTS stripe_fee_handling_override TEXT DEFAULT 'keep_tier' CHECK (stripe_fee_handling_override IN ('pass_through', 'absorb', 'keep_tier'));

-- 2. Add override columns to user_subscription_discounts
ALTER TABLE public.user_subscription_discounts ADD COLUMN IF NOT EXISTS platform_fee_reduction_pct INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.user_subscription_discounts ADD COLUMN IF NOT EXISTS stripe_fee_handling_override TEXT DEFAULT 'keep_tier';

-- 3. Create helper function to dynamically fetch active Stripe fee handling
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

  IF v_plan = 'free' THEN
    v_plan := 'lite';
  END IF;

  -- 1. Check active promotion discount override
  SELECT usd.stripe_fee_handling_override INTO v_override
  FROM user_subscription_discounts usd
  JOIN crm_promo_subscription_discounts cpsd ON usd.discount_id = cpsd.id
  WHERE usd.user_id = p_seller_id
    AND cpsd.plan = v_plan
    AND usd.status = 'active'
    AND (usd.expires_at IS NULL OR usd.expires_at > now())
  ORDER BY usd.applied_at DESC
  LIMIT 1;

  IF v_override IS NOT NULL AND v_override != 'keep_tier' THEN
    RETURN v_override;
  END IF;

  -- 2. Check seller subscription-level manual setting (absorb_stripe_fees boolean)
  -- If absorb_stripe_fees is TRUE, we treat it as 'absorb'
  SELECT absorb_stripe_fees INTO v_absorb_fees
  FROM seller_subscriptions
  WHERE user_id = p_seller_id
    AND plan = v_plan
    AND status IN ('active', 'trialing')
  LIMIT 1;

  IF COALESCE(v_absorb_fees, false) THEN
    RETURN 'absorb';
  END IF;

  -- 3. Fallback to centralized subscription_tiers setting
  SELECT stripe_fee_handling INTO v_handling
  FROM subscription_tiers
  WHERE tier_name = v_plan;

  IF v_handling IS NOT NULL THEN
    RETURN v_handling;
  END IF;

  -- 4. Central global platform settings fallback for pro
  IF v_plan = 'pro' THEN
    SELECT pro_stripe_fee_handling INTO v_handling FROM platform_settings LIMIT 1;
    IF v_handling IS NOT NULL THEN
      RETURN v_handling;
    END IF;
  END IF;

  RETURN 'pass_through';
END;
$$;

-- 4. Refactor get_seller_fee_rate to support platform_fee_reduction_pct
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

  -- Apply transaction fee reduction from active promotion discount if applicable
  SELECT COALESCE(usd.platform_fee_reduction_pct, 0) INTO v_reduction
  FROM user_subscription_discounts usd
  JOIN crm_promo_subscription_discounts cpsd ON usd.discount_id = cpsd.id
  WHERE usd.user_id = p_seller_id
    AND cpsd.plan = v_plan
    AND usd.status = 'active'
    AND (usd.expires_at IS NULL OR usd.expires_at > now())
  ORDER BY usd.applied_at DESC
  LIMIT 1;

  IF v_reduction IS NOT NULL THEN
    v_fee_rate := GREATEST(0.00, v_fee_rate - v_reduction);
  END IF;

  RETURN v_fee_rate;
END;
$$;

-- 5. Refactor stamp_stripe_fee_on_order to use public.get_seller_stripe_fee_handling
CREATE OR REPLACE FUNCTION public.stamp_stripe_fee_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stripe_fee_handling TEXT;
  v_estimated_fee NUMERIC(10,2);
BEGIN
  -- Only process when order transitions to 'completed' or 'delivered'
  IF NEW.status NOT IN ('completed', 'delivered') THEN
    RETURN NEW;
  END IF;
  
  -- Skip if already stamped
  IF NEW.stripe_fee_passed_through THEN
    RETURN NEW;
  END IF;

  -- Get Stripe fee handling dynamically (checking plan, promotion, subscription levels)
  v_stripe_fee_handling := public.get_seller_stripe_fee_handling(NEW.seller_id);

  -- If handling is 'pass_through', compute fee and stamp it
  IF v_stripe_fee_handling = 'pass_through' THEN
    -- Estimate Stripe fee: 2.9% + $0.30 per charge
    v_estimated_fee := ROUND(NEW.total_usd * 0.029 + 0.30, 2);
    
    NEW.stripe_processing_fee_usd := v_estimated_fee;
    NEW.stripe_fee_passed_through := TRUE;
  ELSE
    NEW.stripe_processing_fee_usd := 0;
    NEW.stripe_fee_passed_through := FALSE;
  END IF;

  RETURN NEW;
END;
$$;

-- 6. Update crm_enroll_in_promotion function to apply ALL dynamic tier discounts for the promotion
CREATE OR REPLACE FUNCTION public.crm_enroll_in_promotion(p_promotion_id uuid, p_campaign_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_promo crm_promotions%ROWTYPE;
  v_blueprint crm_recurring_user_incentives_blueprint%ROWTYPE;
  v_sub_discount crm_promo_subscription_discounts%ROWTYPE;
  v_stop_date TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
  v_uid UUID;
  v_email TEXT;
  v_audience_rpc TEXT;
  v_is_in_audience BOOLEAN := false;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = v_uid;

  -- 1. Lock the crm_promotions row (FOR UPDATE)
  SELECT * INTO v_promo FROM crm_promotions WHERE id = p_promotion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promotion not found';
  END IF;

  -- 2. Verify: now() <= enrollment_deadline, current_enrollees < max_enrollees
  IF now() > v_promo.enrollment_deadline THEN
    RAISE EXCEPTION 'Promotion enrollment deadline has passed';
  END IF;
  
  IF v_promo.current_enrollees >= v_promo.max_enrollees THEN
    RAISE EXCEPTION 'Promotion capacity has been reached';
  END IF;

  -- 3. Verify Audience Restrictions
  IF v_promo.audience_id IS NOT NULL THEN
    SELECT audience_rpc_name INTO v_audience_rpc FROM crm_audiences WHERE id = v_promo.audience_id;
    IF v_audience_rpc IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I() WHERE lower(email) = lower($1))', v_audience_rpc)
      INTO v_is_in_audience
      USING v_email;
      
      IF NOT v_is_in_audience THEN
        RAISE EXCEPTION 'You are not eligible for this targeted promotion';
      END IF;
    END IF;
  END IF;

  -- 4. Verify: user_id not already in crm_promo_enrollments
  IF EXISTS (SELECT 1 FROM crm_promo_enrollments WHERE promotion_id = p_promotion_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'User already enrolled in this promotion';
  END IF;
  
  -- 5. Insert into crm_promo_enrollments (with campaign attribution!)
  INSERT INTO crm_promo_enrollments (promotion_id, user_id, campaign_id) VALUES (p_promotion_id, v_uid, p_campaign_id);
  
  -- 6. Increment current_enrollees
  UPDATE crm_promotions SET current_enrollees = current_enrollees + 1 WHERE id = p_promotion_id;

  -- 7. Issue Blueprint Credits (if applicable)
  SELECT * INTO v_blueprint FROM crm_recurring_user_incentives_blueprint WHERE promotion_id = p_promotion_id;
  IF FOUND THEN
    -- Calculate stop_date based on frequency and occurrences
    IF v_blueprint.frequency = 'onetime' THEN
      v_stop_date := NULL;
    ELSIF v_blueprint.frequency = 'monthly' THEN
      v_stop_date := v_blueprint.start_date + (v_blueprint.occurrences || ' months')::interval;
    ELSIF v_blueprint.frequency = 'weekly' THEN
      v_stop_date := v_blueprint.start_date + (v_blueprint.occurrences || ' weeks')::interval;
    ELSIF v_blueprint.frequency = 'quarterly' THEN
      v_stop_date := v_blueprint.start_date + ((v_blueprint.occurrences * 3) || ' months')::interval;
    ELSIF v_blueprint.frequency = 'halfyearly' THEN
      v_stop_date := v_blueprint.start_date + ((v_blueprint.occurrences * 6) || ' months')::interval;
    ELSIF v_blueprint.frequency = 'yearly' THEN
      v_stop_date := v_blueprint.start_date + (v_blueprint.occurrences || ' years')::interval;
    END IF;

    INSERT INTO user_incentives (
      user_id,
      amount_usd,
      credit_type,
      cap_type,
      cap_value,
      expiration_frequency,
      start_date,
      stop_date,
      is_active,
      created_by
    ) VALUES (
      v_uid,
      v_blueprint.amount_usd,
      v_blueprint.credit_type,
      v_blueprint.cap_type,
      v_blueprint.cap_value,
      v_blueprint.frequency,
      v_blueprint.start_date,
      v_stop_date,
      true,
      NULL
    );
  END IF;

  -- 8. Apply Subscription Discounts (for all plans configured in the promotion)
  FOR v_sub_discount IN 
    SELECT * FROM crm_promo_subscription_discounts WHERE promotion_id = p_promotion_id
  LOOP
    -- Calculate expiration
    IF v_sub_discount.duration_months IS NOT NULL THEN
      v_expires_at := now() + (v_sub_discount.duration_months || ' months')::interval;
    ELSE
      v_expires_at := NULL;  -- perpetual
    END IF;

    -- Record the applied discount for this user
    INSERT INTO user_subscription_discounts (
      user_id,
      promotion_id,
      discount_id,
      discount_pct,
      duration_months,
      applied_at,
      expires_at,
      status,
      stripe_coupon_id,
      platform_fee_reduction_pct,
      stripe_fee_handling_override
    ) VALUES (
      v_uid,
      p_promotion_id,
      v_sub_discount.id,
      v_sub_discount.discount_pct,
      v_sub_discount.duration_months,
      now(),
      v_expires_at,
      'active',
      v_sub_discount.stripe_coupon_id,
      v_sub_discount.platform_fee_reduction_pct,
      v_sub_discount.stripe_fee_handling_override
    )
    ON CONFLICT (user_id, discount_id) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$function$;
