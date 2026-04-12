-- ============================================================================
-- Migration: Referral Attribution & Multi-Touch Tracking
-- Adds attribution columns to profiles and creates referral_touches table
-- for full multi-touch attribution history.
-- ============================================================================

-- 1. Add attribution columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS signup_source TEXT,
  ADD COLUMN IF NOT EXISTS signup_referrer_id UUID
    REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_touch_source TEXT,
  ADD COLUMN IF NOT EXISTS first_touch_referrer_id UUID
    REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

-- 2. Create referral_touches table for full touchpoint history
CREATE TABLE IF NOT EXISTS referral_touches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  referrer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  landing_url TEXT,
  touched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_touches_user ON referral_touches(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_touches_referrer ON referral_touches(referrer_id);

-- 3. RLS for referral_touches
ALTER TABLE referral_touches ENABLE ROW LEVEL SECURITY;

-- Users can insert their own touches
CREATE POLICY referral_touches_insert ON referral_touches
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own touches
CREATE POLICY referral_touches_select ON referral_touches
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Service role can read all (for admin/metrics)
CREATE POLICY referral_touches_service_select ON referral_touches
  FOR SELECT TO service_role
  USING (true);

-- 4. Update handle_new_user to populate attribution from signup metadata
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

  -- 1. Create Profile (with attribution)
  INSERT INTO public.profiles (
    id, email, full_name, avatar_url, email_verified,
    signup_source, signup_referrer_id,
    first_touch_source, first_touch_referrer_id,
    utm_source, utm_medium, utm_campaign
  )
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    v_email_verified,
    new.raw_user_meta_data->>'signup_source',
    NULLIF(new.raw_user_meta_data->>'signup_referrer_id', '')::UUID,
    new.raw_user_meta_data->>'first_touch_source',
    NULLIF(new.raw_user_meta_data->>'first_touch_referrer_id', '')::UUID,
    new.raw_user_meta_data->>'utm_source',
    new.raw_user_meta_data->>'utm_medium',
    new.raw_user_meta_data->>'utm_campaign'
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
