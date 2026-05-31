BEGIN;
select plan(4);

-- Test 1: Verify the trigger exists on the seller_subscriptions table
select has_trigger('public', 'seller_subscriptions', 'on_subscription_changed', 'on_subscription_changed trigger should exist');

-- Setup: Create a test profile
insert into auth.users (id, email) values ('d9999999-9999-9999-9999-999999999999', 'trigger_test@example.com');
insert into public.profiles (id, email, full_name) values ('d9999999-9999-9999-9999-999999999999', 'trigger_test@example.com', 'Trigger Seller') on conflict (id) do update set full_name = 'Trigger Seller';

-- Test 2: Inserting an active subscription triggers the welcome flow (should succeed without crashing)
insert into public.seller_subscriptions (user_id, plan, status, stripe_customer_id, stripe_subscription_id)
values ('d9999999-9999-9999-9999-999999999999', 'pro', 'trialing', 'cus_pgtap_test', 'sub_pgtap_test');
select pass('Inserting trialing subscription succeeds without crashing trigger function');

-- Test 3: Updating the plan (Upgrade Pro -> Elite) fires the trigger and succeeds
update public.seller_subscriptions
set plan = 'elite'
where user_id = 'd9999999-9999-9999-9999-999999999999';
select pass('Upgrading subscription plan succeeds without crashing');

-- Test 4: Downgrading and Canceling fires the trigger and succeeds
update public.seller_subscriptions
set status = 'canceled'
where user_id = 'd9999999-9999-9999-9999-999999999999';
select pass('Canceling subscription plan succeeds without crashing');

select * from finish();
ROLLBACK;
