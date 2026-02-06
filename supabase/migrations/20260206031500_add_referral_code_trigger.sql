-- Add trigger to auto-generate referral codes for new profiles
-- and populate existing profiles that are missing codes

-- Function to generate a unique 8-character alphanumeric referral code
create or replace function generate_referral_code()
returns text as $$
declare
  chars text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result text := '';
  i integer;
begin
  for i in 1..8 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  end loop;
  return result;
end;
$$ language plpgsql;

-- Trigger function to set referral code on insert if not provided
create or replace function set_referral_code_on_insert()
returns trigger as $$
declare
  new_code text;
  code_exists boolean;
begin
  -- Only generate if not already set
  if NEW.referral_code is null then
    loop
      new_code := generate_referral_code();
      -- Check if code already exists
      select exists(select 1 from profiles where referral_code = new_code) into code_exists;
      exit when not code_exists;
    end loop;
    NEW.referral_code := new_code;
  end if;
  return NEW;
end;
$$ language plpgsql;

-- Create the trigger
drop trigger if exists trigger_set_referral_code on profiles;
create trigger trigger_set_referral_code
  before insert on profiles
  for each row
  execute function set_referral_code_on_insert();

-- Populate referral codes for existing profiles that don't have one
do $$
declare
  profile_record record;
  new_code text;
  code_exists boolean;
begin
  for profile_record in select id from profiles where referral_code is null loop
    loop
      new_code := generate_referral_code();
      select exists(select 1 from profiles where referral_code = new_code) into code_exists;
      exit when not code_exists;
    end loop;
    update profiles set referral_code = new_code where id = profile_record.id;
  end loop;
end $$;
