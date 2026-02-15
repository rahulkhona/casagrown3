-- Always create a baseline point_ledger entry on signup (balance = 0),
-- then award signup reward on top of it if an incentive rule exists.
-- This ensures usePointsBalance always finds at least one row.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  signup_reward_points integer;
begin
  -- 1. Create Profile
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );

  -- 2. Create baseline point_ledger entry (0 points)
  -- balance_after is auto-computed by trg_compute_balance_after
  insert into public.point_ledger (
    user_id, type, amount, balance_after, metadata
  )
  values (
    new.id,
    'reward',
    0,
    0, -- overridden by trigger
    jsonb_build_object('reason', 'Account Created')
  );

  -- 3. Check for Active Signup Reward (Global Scope)
  select points into signup_reward_points
  from incentive_rules
  where action_type = 'signup'
    and scope = 'global'
    and (end_date is null or end_date > now())
  limit 1;

  -- 4. Award Points if Rule Exists
  if signup_reward_points is not null and signup_reward_points > 0 then
    insert into public.point_ledger (
      user_id, type, amount, balance_after, metadata
    )
    values (
      new.id,
      'reward',
      signup_reward_points,
      0, -- overridden by trigger
      jsonb_build_object('reason', 'Signup Reward', 'rule', 'global_signup')
    );
  end if;

  return new;
end;
$$;
