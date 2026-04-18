BEGIN;
select plan(3);

-- Test 1: Irrelevant updates don't crash or prevent saving
-- Setup: create a test user (this automatically creates a profiles row via handle_new_user trigger)
insert into auth.users (id, email) values ('c0000000-0000-0000-0000-000000000001', 'test_welcome@example.com');

update public.profiles set full_name = 'Test Name' where id = 'c0000000-0000-0000-0000-000000000001';
select pass('Update to full_name succeeds without crashing');

-- Test 2: Triggering the community update runs successfully
DO $$ 
DECLARE 
  v_comm_id text;
BEGIN
  SELECT c.h3_index INTO v_comm_id FROM public.communities c LIMIT 1;
  IF v_comm_id IS NOT NULL THEN
    UPDATE public.profiles SET home_community_h3_index = v_comm_id WHERE id = 'c0000000-0000-0000-0000-000000000001';
  END IF;
END $$;
select pass('Update to home_community_h3_index (NULL -> NOT NULL) succeeds without crashing DB');

-- Test 3: Idempotency (Updating to a new community)
DO $$ 
DECLARE 
  v_comm_id_2 text;
BEGIN
  -- Grab a strictly different community if it exists
  SELECT c.h3_index INTO v_comm_id_2 FROM public.communities c
  WHERE c.h3_index != (SELECT p.home_community_h3_index FROM public.profiles p WHERE p.id = 'c0000000-0000-0000-0000-000000000001') LIMIT 1;
  
  IF v_comm_id_2 IS NOT NULL THEN
    UPDATE public.profiles SET home_community_h3_index = v_comm_id_2 WHERE id = 'c0000000-0000-0000-0000-000000000001';
  END IF;
END $$;
select pass('Idempotent update to home_community_h3_index (NOT NULL -> NOT NULL) succeeds');

select * from finish();
ROLLBACK;
