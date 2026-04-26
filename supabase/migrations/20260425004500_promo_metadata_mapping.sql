-- Updates handle_new_user() to map promotional metadata fields into profiles

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  signup_reward_points INTEGER;
  v_provider TEXT;
  v_email_verified BOOLEAN;
  v_tos_accepted_at TIMESTAMPTZ;
BEGIN
  -- Determine auth provider and email verification status
  v_provider := new.raw_app_meta_data->>'provider';
  -- OTP (email) logins prove email ownership; social logins need verification
  v_email_verified := CASE
    WHEN v_provider = 'email' THEN true
    ELSE false
  END;

  -- Set ToS accepted at if passed in metadata (e.g. from promotional landing page)
  v_tos_accepted_at := CASE
    WHEN (new.raw_user_meta_data->>'tos_accepted')::BOOLEAN = true THEN now()
    ELSE NULL
  END;

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
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    v_email_verified,
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
    CASE WHEN new.raw_user_meta_data->>'full_name' IS NOT NULL AND new.raw_user_meta_data->>'street_address' IS NOT NULL THEN now() ELSE NULL END
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
