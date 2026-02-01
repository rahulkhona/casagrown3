-- Migration: Auth Triggers & Signup Rewards

-- 1. Create a function to handle new user signup
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

  -- 2. Check for Active Signup Reward (Global Scope)
  select points into signup_reward_points
  from incentive_rules
  where action_type = 'signup'
    and scope = 'global'
    and (end_date is null or end_date > now())
  limit 1;

  -- 3. Award Points if Rule Exists
  if signup_reward_points is not null and signup_reward_points > 0 then
    insert into public.point_ledger (
      user_id,
      type,
      amount,
      balance_after, -- logic below simplifies this, ideally we calculate rolling balance
      metadata
    )
    values (
      new.id,
      'reward',
      signup_reward_points,
      signup_reward_points, -- For the very first transaction, balance = amount. WARNING: If concurrent, this is risky.
      jsonb_build_object('reason', 'Signup Reward', 'rule', 'global_signup')
    );
  end if;

  return new;
end;
$$;

-- 2. Create Trigger
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. Seed Default Signup Reward (Idempotent)
insert into incentive_rules (action_type, scope, points, start_date)
values ('signup', 'global', 50, now())
on conflict (action_type, scope, country_iso_3, state_id, city_id, zip_code, community_id, start_date)
do nothing;
