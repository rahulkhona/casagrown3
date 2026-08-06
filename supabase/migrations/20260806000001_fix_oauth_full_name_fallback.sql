-- Migration: Fix OAuth Full Name Fallback in handle_new_user Trigger
-- Resolves NULL full_name values for Google / Apple OAuth signups

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  signup_reward_points INTEGER;
  v_provider TEXT;
  v_tos_accepted_at TIMESTAMPTZ;
  v_full_name TEXT;
BEGIN
  -- Determine auth provider
  v_provider := new.raw_app_meta_data->>'provider';

  -- Set ToS accepted at if passed in metadata (e.g. from promotional landing page)
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

  IF signup_reward_points IS NOT NULL AND signup_reward_points > 0 THEN
    INSERT INTO public.point_ledger (
      user_id, type, amount, balance_after, metadata
    )
    VALUES (
      new.id,
      'reward',
      signup_reward_points,
      0, -- overridden by trigger
      jsonb_build_object('reason', 'Signup Bonus')
    );
  END IF;

  RETURN new;
END;
$$;

-- 2. Backfill null full_names from auth.users metadata
UPDATE public.profiles p
SET full_name = COALESCE(
  NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
  NULLIF(trim(u.raw_user_meta_data->>'name'), ''),
  NULLIF(trim(concat_ws(' ', u.raw_user_meta_data->>'given_name', u.raw_user_meta_data->>'family_name')), ''),
  split_part(p.email, '@', 1)
)
FROM auth.users u
WHERE u.id = p.id
  AND (p.full_name IS NULL OR trim(p.full_name) = '');

COMMENT ON FUNCTION public.handle_new_user() IS 'Auth user creation trigger populating profiles with robust full_name fallbacks across Google, Apple, and Email providers.';
