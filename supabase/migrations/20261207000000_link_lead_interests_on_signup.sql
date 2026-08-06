-- Migration: Link lead produce interests to user account on signup
--
-- When a new user signs up, if they previously submitted produce interests
-- as a lead (via /sell or /check-nutrition-loss forms), those interests
-- have user_id = NULL and are linked only by lead_id → crm_leads.email.
-- This migration updates handle_new_user() to backfill user_id on those
-- interest records so they appear in the user's account.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  signup_reward_points integer;
  matched_lead_id uuid;
BEGIN
  -- 1. Create Profile
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );

  -- 2. Link any existing lead produce interests to this new account.
  --    Find the crm_leads record matching this email and backfill user_id
  --    on crm_produce_interests that were saved without an account.
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
  END IF;

  -- 3. Check for Active Signup Reward (Global Scope)
  SELECT cr.points INTO signup_reward_points
  FROM campaign_rewards cr
  JOIN incentive_campaigns ic ON ic.id = cr.campaign_id
  WHERE cr.behavior = 'signup'
    AND ic.is_active = true
    AND ic.starts_at <= now()
    AND ic.ends_at > now()
  ORDER BY ic.starts_at DESC
  LIMIT 1;

  -- 4. Award Points if Rule Exists
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

COMMENT ON FUNCTION public.handle_new_user IS 'Creates profile on signup and links any pre-existing lead produce interests (from /sell or /check-nutrition-loss wizards) to the new account by backfilling user_id on crm_produce_interests.';
