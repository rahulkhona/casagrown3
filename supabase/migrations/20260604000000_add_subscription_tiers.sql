-- Centralized Subscription Tiers, Limits, and Dynamic Feature Gates
-- =================================================================

SET search_path TO public, extensions;

-- 1. Create the central subscription tiers configuration table
CREATE TABLE IF NOT EXISTS public.subscription_tiers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name          TEXT UNIQUE NOT NULL CHECK (tier_name IN ('lite', 'pro', 'elite')),
  display_name       TEXT NOT NULL,
  subscription_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  platform_fee_pct   NUMERIC(5,2) NOT NULL CHECK (platform_fee_pct BETWEEN 0.00 AND 100.00),
  
  -- Hard limits
  max_booths         INTEGER NOT NULL DEFAULT 1,
  
  -- Feature Flags JSONB (e.g. {"facebook_sync": true, "custom_branding": false})
  features           JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS and grants
ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can read subscription tiers" ON public.subscription_tiers;
CREATE POLICY "Everyone can read subscription tiers" ON public.subscription_tiers FOR SELECT TO public USING (true);

GRANT SELECT ON public.subscription_tiers TO anon, authenticated;
GRANT ALL ON public.subscription_tiers TO service_role;

-- 2. Seed default values matching our package tier definitions
INSERT INTO public.subscription_tiers (tier_name, display_name, subscription_price, platform_fee_pct, max_booths, features)
VALUES 
  (
    'lite', 
    'Lite Base', 
    0.00, 
    10.00, 
    1, 
    '{"facebook_sync": false, "facebook_posts": false, "growbot_copilot": false, "facebook_chat": false, "facebook_comments": false, "instagram_sync": false, "instagram_posts": false, "instagram_chat": false, "instagram_comments": false, "whatsapp_sync": false, "whatsapp_chat": false, "video_posts": false, "google_places": false, "custom_branding": false, "sms_notifications": true}'::jsonb
  ),
  (
    'pro', 
    'CasaGrown Pro', 
    10.00, 
    5.00, 
    3, 
    '{"facebook_sync": true, "facebook_posts": true, "growbot_copilot": true, "facebook_chat": true, "facebook_comments": true, "instagram_sync": false, "instagram_posts": false, "instagram_chat": false, "instagram_comments": false, "whatsapp_sync": false, "whatsapp_chat": false, "video_posts": false, "google_places": false, "custom_branding": false, "sms_notifications": true}'::jsonb
  ),
  (
    'elite', 
    'CasaGrown Elite', 
    29.00, 
    2.00, 
    100, 
    '{"facebook_sync": true, "facebook_posts": true, "growbot_copilot": true, "facebook_chat": true, "facebook_comments": true, "instagram_sync": true, "instagram_posts": true, "instagram_chat": true, "instagram_comments": true, "whatsapp_sync": true, "whatsapp_chat": true, "video_posts": true, "google_places": true, "custom_branding": true, "sms_notifications": true}'::jsonb
  )
ON CONFLICT (tier_name) DO UPDATE 
SET subscription_price = EXCLUDED.subscription_price,
    platform_fee_pct = EXCLUDED.platform_fee_pct,
    max_booths = EXCLUDED.max_booths,
    features = EXCLUDED.features;

-- 3. Modify seller_subscriptions plan check constraint to support 'elite'
ALTER TABLE public.seller_subscriptions DROP CONSTRAINT IF EXISTS seller_subscriptions_plan_check;
ALTER TABLE public.seller_subscriptions ADD CONSTRAINT seller_subscriptions_plan_check CHECK (plan IN ('free', 'pro', 'elite'));

-- 4. Refactor get_seller_fee_rate to fetch transaction fee dynamically from subscription_tiers
CREATE OR REPLACE FUNCTION public.get_seller_fee_rate(p_seller_id UUID)
RETURNS NUMERIC(5,2)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan TEXT;
  v_fee_rate NUMERIC(5,2);
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

  RETURN v_fee_rate;
END;
$$;

-- 5. Centralized Feature Gate helper check_seller_feature_enabled
CREATE OR REPLACE FUNCTION public.check_seller_feature_enabled(p_seller_id UUID, p_feature_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan TEXT;
  v_enabled BOOLEAN;
BEGIN
  SELECT COALESCE(plan, 'lite') INTO v_plan
  FROM seller_subscriptions
  WHERE user_id = p_seller_id
    AND status IN ('active', 'trialing');

  IF v_plan = 'free' THEN
    v_plan := 'lite';
  END IF;

  -- Extract the boolean flag from the JSONB features column
  SELECT (features->>p_feature_key)::BOOLEAN INTO v_enabled
  FROM subscription_tiers
  WHERE tier_name = v_plan;

  RETURN COALESCE(v_enabled, false);
END;
$$;

-- 6. Booth Creation Limit Enforcement helper
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

  -- Count existing active booths for this owner (not archived)
  SELECT COUNT(*) INTO v_current_booths
  FROM market_booths
  WHERE owner_id = p_user_id
    AND status != 'archived';

  RETURN v_current_booths < v_max_booths;
END;
$$;

-- 7. Alter crm_promo_subscription_discounts schema
ALTER TABLE public.crm_promo_subscription_discounts ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'pro' CHECK (plan IN ('pro', 'elite'));

ALTER TABLE public.crm_promo_subscription_discounts DROP CONSTRAINT IF EXISTS crm_promo_subscription_discounts_promotion_id_key;
ALTER TABLE public.crm_promo_subscription_discounts DROP CONSTRAINT IF EXISTS crm_promo_subscription_discounts_promo_plan_key;

ALTER TABLE public.crm_promo_subscription_discounts ADD CONSTRAINT crm_promo_subscription_discounts_promo_plan_key UNIQUE (promotion_id, plan);

-- 8. Alter user_subscription_discounts unique constraints
ALTER TABLE public.user_subscription_discounts DROP CONSTRAINT IF EXISTS user_subscription_discounts_user_id_promotion_id_key;
ALTER TABLE public.user_subscription_discounts DROP CONSTRAINT IF EXISTS user_subscription_discounts_user_discount_key;

ALTER TABLE public.user_subscription_discounts ADD CONSTRAINT user_subscription_discounts_user_discount_key UNIQUE (user_id, discount_id);
