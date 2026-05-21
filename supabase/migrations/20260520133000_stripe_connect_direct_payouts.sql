-- Migration: Stripe Standard Connect Direct Payout Schema Upgrades
-- Created: 2026-05-20

-- 1. Modify the profiles table to track Stripe Connect details
ALTER TABLE "public"."profiles" 
  ADD COLUMN IF NOT EXISTS "stripe_connect_id" text UNIQUE,
  ADD COLUMN IF NOT EXISTS "stripe_onboarding_completed" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "stripe_connect_active" boolean DEFAULT false NOT NULL;

-- Create index for rapid lookup during webhook processing
CREATE INDEX IF NOT EXISTS profiles_stripe_connect_id_idx ON "public"."profiles"("stripe_connect_id");

-- 2. Modify the user_settlements table to track Stripe Connect states and references
ALTER TABLE "public"."user_settlements" 
  DROP CONSTRAINT IF EXISTS "user_settlements_status_check";

ALTER TABLE "public"."user_settlements" 
  ADD COLUMN IF NOT EXISTS "stripe_transfer_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_transfer_error" text;

-- Add updated constraint with Stripe Connect transfer states
ALTER TABLE "public"."user_settlements" 
  ADD CONSTRAINT "user_settlements_status_check" 
  CHECK (status IN (
    'pending', 
    'available', 
    'paid_out', 
    'stripe_transfer_pending', 
    'stripe_transfer_failed'
  ));

-- 3. Create database RPC: set_stripe_connect_active
CREATE OR REPLACE FUNCTION "public"."set_stripe_connect_active"(p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_onboarding_completed boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify onboarding is completed before allowing direct payouts to be activated
  IF p_active THEN
    SELECT stripe_onboarding_completed INTO v_onboarding_completed
    FROM profiles
    WHERE id = v_user_id;

    IF v_onboarding_completed IS NOT TRUE THEN
      RAISE EXCEPTION 'Onboarding not completed';
    END IF;
  END IF;

  UPDATE profiles
  SET stripe_connect_active = p_active
  WHERE id = v_user_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION "public"."set_stripe_connect_active"(boolean) TO "authenticated";

-- 4. Create database RPC: get_profile_stripe_connect_info
CREATE OR REPLACE FUNCTION "public"."get_profile_stripe_connect_info"()
RETURNS TABLE (
  stripe_connect_id text,
  stripe_onboarding_completed boolean,
  stripe_connect_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.stripe_connect_id,
    p.stripe_onboarding_completed,
    p.stripe_connect_active
  FROM profiles p
  WHERE p.id = auth.uid();
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION "public"."get_profile_stripe_connect_info"() TO "authenticated";
