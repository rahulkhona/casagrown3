-- ============================================================================
-- Migration: Profile System Overhaul
-- Adds address fields, verification columns, and phone-change trigger.
-- Updates handle_new_user() to use campaign_rewards instead of incentive_rules.
-- ============================================================================

-- 1. Add address and verification columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS street_address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state_code TEXT,
  ADD COLUMN IF NOT EXISTS zip_plus4 TEXT,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone_verification_code TEXT,
  ADD COLUMN IF NOT EXISTS phone_verification_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ;

-- 2. Trigger: auto-clear phone verification when phone_number changes
CREATE OR REPLACE FUNCTION clear_phone_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.phone_number IS DISTINCT FROM NEW.phone_number THEN
    NEW.phone_verified := false;
    NEW.phone_verified_at := NULL;
    NEW.phone_verification_code := NULL;
    NEW.phone_verification_expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_clear_phone_verification
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION clear_phone_verification();

-- 3. RPC to verify phone — validates OTP code and sets verified flag
CREATE OR REPLACE FUNCTION verify_phone(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected TEXT;
  v_expires TIMESTAMPTZ;
BEGIN
  SELECT phone_verification_code, phone_verification_expires_at
    INTO v_expected, v_expires
    FROM profiles
    WHERE id = auth.uid();

  IF v_expected IS NULL OR v_expected != p_code THEN
    RETURN false;
  END IF;

  IF v_expires < now() THEN
    RETURN false;  -- expired
  END IF;

  UPDATE profiles
    SET phone_verified = true,
        phone_verified_at = now(),
        phone_verification_code = NULL,
        phone_verification_expires_at = NULL
    WHERE id = auth.uid();

  RETURN true;
END;
$$;

-- 4. Update handle_new_user to set email_verified and use campaign_rewards
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  signup_reward_points INTEGER;
  v_provider TEXT;
  v_email_verified BOOLEAN;
BEGIN
  -- Determine auth provider and email verification status
  v_provider := new.raw_app_meta_data->>'provider';
  -- OTP (email) logins prove email ownership; social logins need verification
  v_email_verified := CASE
    WHEN v_provider = 'email' THEN true
    ELSE false
  END;

  -- 1. Create Profile
  INSERT INTO public.profiles (id, email, full_name, avatar_url, email_verified)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    v_email_verified
  );

  -- 2. Create baseline point_ledger entry (0 points)
  INSERT INTO public.point_ledger (
    user_id, type, amount, balance_after, metadata
  )
  VALUES (
    new.id,
    'reward',
    0,
    0,  -- overridden by trg_compute_balance_after
    jsonb_build_object('reason', 'Account Created')
  );

  -- 3. Check for active campaign signup reward
  -- Find the latest active campaign that rewards 'signup' behavior
  SELECT cr.points INTO signup_reward_points
  FROM campaign_rewards cr
  JOIN incentive_campaigns ic ON ic.id = cr.campaign_id
  WHERE cr.behavior = 'signup'
    AND ic.is_active = true
    AND ic.starts_at <= now()
    AND ic.ends_at > now()
  ORDER BY ic.starts_at DESC
  LIMIT 1;

  -- 4. Award signup points if campaign exists
  IF signup_reward_points IS NOT NULL AND signup_reward_points > 0 THEN
    INSERT INTO public.point_ledger (
      user_id, type, amount, balance_after, metadata
    )
    VALUES (
      new.id,
      'reward',
      signup_reward_points,
      0,  -- overridden by trg_compute_balance_after
      jsonb_build_object('reason', 'Signup Reward', 'source', 'campaign')
    );
  END IF;

  RETURN new;
END;
$$;

-- 5. Remove old notification preference columns default requirement
-- (They stay in the table for backward compat but we no longer set them in wizard)
-- No schema change needed — they already have defaults.
