-- Auto-compute balance_after on every point_ledger insert.
-- This replaces manual balance computation in edge functions and triggers.
-- Uses advisory lock per user to prevent race conditions.

create or replace function public.compute_balance_after()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  last_balance integer;
begin
  -- Advisory lock on user_id to serialize concurrent inserts for the same user
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));

  -- Compute running balance as SUM of all existing amounts
  -- This is order-independent — no issues with same-timestamp entries or negative amounts
  select coalesce(sum(amount), 0) into last_balance
  from point_ledger
  where user_id = new.user_id;

  -- If no previous entry, start from 0
  if last_balance is null then
    last_balance := 0;
  end if;

  -- Compute the new running balance
  new.balance_after := last_balance + new.amount;

  return new;
end;
$$;

-- Trigger fires BEFORE INSERT so we can modify NEW.balance_after
create trigger trg_compute_balance_after
  before insert on point_ledger
  for each row
  execute function public.compute_balance_after();
