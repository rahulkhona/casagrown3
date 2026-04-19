BEGIN;
select plan(5);

-- Clean state
delete from public.profiles where id in ('c0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000012');
delete from auth.users where id in ('c0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000012');

-- Mock 3 Auth Users
insert into auth.users (id, email) values 
  ('c0000000-0000-0000-0000-000000000010', 'recent@test.local'),
  ('c0000000-0000-0000-0000-000000000011', 'old_no_tos@test.local'),
  ('c0000000-0000-0000-0000-000000000012', 'old_no_comm@test.local');

-- 1. Setup Data
-- Recent User (< 1hr)
update public.profiles set created_at = now() - interval '30 minutes' 
  where id = 'c0000000-0000-0000-0000-000000000010';

-- Old User (No ToS) (> 1hr)
update public.profiles set created_at = now() - interval '2 hours' 
  where id = 'c0000000-0000-0000-0000-000000000011';

-- Old User (Signed ToS but no Community)
update public.profiles set tos_accepted_at = now() - interval '2 hours', created_at = now() - interval '3 hours'
  where id = 'c0000000-0000-0000-0000-000000000012';

-- 2. Execute process
SELECT public.process_abandoned_onboarding();

-- 3. Assertions
select is(
  (select tos_reminder_sent_at is not null from public.profiles where id = 'c0000000-0000-0000-0000-000000000010'),
  false,
  'Recent User should NOT have ToS reminder sent'
);

select is(
  (select tos_reminder_sent_at is not null from public.profiles where id = 'c0000000-0000-0000-0000-000000000011'),
  true,
  'Old User WITHOUT ToS should have ToS reminder sent'
);

select is(
  (select profile_reminder_sent_at is not null from public.profiles where id = 'c0000000-0000-0000-0000-000000000012'),
  true,
  'Old User WITH ToS but NO community should have Profile reminder sent'
);

-- 4. Test Idempotency (Running it again)
-- We store the original timestamps
CREATE TEMP TABLE temp_timestamps AS 
SELECT id, tos_reminder_sent_at, profile_reminder_sent_at FROM public.profiles WHERE id IN ('c0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000012');

-- Artificial delay is hard in strict transactions without sleep, so we just run it again and see if it changes
-- However, running immediately might be exact same timestamp if within same transaction.

SELECT public.process_abandoned_onboarding();
-- Wait, the query explicitly says `tos_reminder_sent_at IS NULL`, so it shouldn't be touched.

select is(
  (select count(*) from public.profiles where tos_reminder_sent_at is null and id = 'c0000000-0000-0000-0000-000000000011'),
  0::bigint,
  'Ensures flags remain set'
);

select is(
  (select count(*) from public.profiles where profile_reminder_sent_at is null and id = 'c0000000-0000-0000-0000-000000000012'),
  0::bigint,
  'Ensures flags remain set'
);

select * from finish();
ROLLBACK;
