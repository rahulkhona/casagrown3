-- Migration: Fix auth handle_new_user trigger, eliminate stale incentive_rules references, and grant safe public profile RLS

SET search_path TO public, extensions;

-- 1. Update handle_new_user() to eliminate stale incentive_rules references
--    Combines robust OAuth full_name fallbacks, lead produce interest linking, and campaign_rewards signup incentives
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  signup_reward_points INTEGER;
  v_provider TEXT;
  v_tos_accepted_at TIMESTAMPTZ;
  v_full_name TEXT;
  matched_lead_id UUID;
BEGIN
  -- Determine auth provider
  v_provider := new.raw_app_meta_data->>'provider';

  -- Set ToS accepted at if passed in metadata
  v_tos_accepted_at := CASE
    WHEN (new.raw_user_meta_data->>'tos_accepted')::BOOLEAN = true THEN now()
    ELSE NULL
  END;

  -- Extract full_name with robust fallback across Google, Apple, and Email metadata formats
  v_full_name := COALESCE(
    NULLIF(trim(new.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(new.raw_user_meta_data->>'name'), ''),
    NULLIF(trim(concat_ws(' ', new.raw_user_meta_data->>'given_name', new.raw_user_meta_data->>'family_name')), ''),
    split_part(new.email, '@', 1)
  );

  -- 1. Create Profile (with attribution and promo metadata)
  INSERT INTO public.profiles (
    id, email, full_name, avatar_url, email_verified,
    signup_source, signup_referrer_id,
    first_touch_source, first_touch_referrer_id,
    utm_source, utm_medium, utm_campaign,
    street_address, phone_number, sms_enabled, tos_accepted_at, profile_completed_at
  )
  VALUES (
    new.id,
    new.email,
    v_full_name,
    new.raw_user_meta_data->>'avatar_url',
    true,  -- All supported providers (email, google, apple) verify email
    new.raw_user_meta_data->>'signup_source',
    NULLIF(new.raw_user_meta_data->>'signup_referrer_id', '')::UUID,
    new.raw_user_meta_data->>'first_touch_source',
    NULLIF(new.raw_user_meta_data->>'first_touch_referrer_id', '')::UUID,
    new.raw_user_meta_data->>'utm_source',
    new.raw_user_meta_data->>'utm_medium',
    new.raw_user_meta_data->>'utm_campaign',
    new.raw_user_meta_data->>'street_address',
    new.raw_user_meta_data->>'phone',
    COALESCE((new.raw_user_meta_data->>'sms_consent')::BOOLEAN, false),
    v_tos_accepted_at,
    CASE WHEN v_full_name IS NOT NULL AND new.raw_user_meta_data->>'street_address' IS NOT NULL THEN now() ELSE NULL END
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(profiles.full_name, ''), EXCLUDED.full_name),
    avatar_url = COALESCE(profiles.avatar_url, EXCLUDED.avatar_url),
    email_verified = true,
    updated_at = now();

  -- 2. Link any existing lead produce interests to this new account
  SELECT id INTO matched_lead_id
  FROM public.crm_leads
  WHERE lower(email) = lower(new.email)
  LIMIT 1;

  IF matched_lead_id IS NOT NULL THEN
    UPDATE public.crm_produce_interests
    SET user_id = new.id,
        updated_at = now()
    WHERE lead_id = matched_lead_id
      AND user_id IS NULL;

    UPDATE public.crm_leads
    SET status = 'converted',
        updated_at = now()
    WHERE id = matched_lead_id;
  END IF;

  -- 3. Check for Active Signup Reward in campaign_rewards (never incentive_rules)
  SELECT cr.points INTO signup_reward_points
  FROM campaign_rewards cr
  JOIN incentive_campaigns ic ON ic.id = cr.campaign_id
  WHERE cr.behavior = 'signup'
    AND ic.is_active = true
    AND ic.starts_at <= now()
    AND ic.ends_at > now()
  ORDER BY ic.starts_at DESC
  LIMIT 1;

  -- 4. Award Reward Points if Rule Exists
  IF signup_reward_points IS NOT NULL AND signup_reward_points > 0 THEN
    INSERT INTO public.point_ledger (
      user_id,
      type,
      amount,
      balance_after,
      metadata
    )
    VALUES (
      new.id,
      'reward',
      signup_reward_points,
      signup_reward_points,
      jsonb_build_object('reason', 'Signup Reward', 'rule', 'global_signup')
    );
  END IF;

  RETURN new;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user IS 'Creates profile on signup, links pre-existing lead produce interests to the new account, and awards signup reward points if an active campaign exists.';

-- 2. Safe Public Profiles Select Grants & Policy (fixes 42501 permission denied)
GRANT SELECT (id, full_name, avatar_url, referral_code, created_at, updated_at) ON public.profiles TO anon, authenticated;

DO $$ BEGIN
  CREATE POLICY profiles_public_read_safe ON public.profiles
    FOR SELECT TO anon, authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
