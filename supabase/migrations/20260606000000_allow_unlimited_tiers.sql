-- Migration: Allow unlimited subscription tiers by dropping static check constraints
-- =================================================================================

SET search_path TO public, extensions;

-- 1. Drop the check constraint on subscription_tiers that restricts tier names
ALTER TABLE public.subscription_tiers DROP CONSTRAINT IF EXISTS subscription_tiers_tier_name_check;

-- 2. Drop the check constraint on seller_subscriptions that restricts subscription plans
ALTER TABLE public.seller_subscriptions DROP CONSTRAINT IF EXISTS seller_subscriptions_plan_check;

-- 3. Drop the check constraint on crm_promo_subscription_discounts that restricts promotion discount plans
ALTER TABLE public.crm_promo_subscription_discounts DROP CONSTRAINT IF EXISTS crm_promo_subscription_discounts_plan_check;

-- Successfully dropped static check constraints to allow unlimited tiers.
