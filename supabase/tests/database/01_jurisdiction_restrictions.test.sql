begin;

select plan(10);

-- 1. Setup Test Data
-- Create a test user
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'test_jurisdiction@casagrown.local');

-- Create country, state and county
insert into public.countries (iso_3, name) values ('XXX', 'TestCountry') ON CONFLICT DO NOTHING;
insert into public.states (id, code, name, country_iso_3) values ('00000000-0000-0000-0000-000000000002', 'XX', 'TestState', 'XXX');
insert into public.counties (id, fips_code, name, state_id) values ('00000000-0000-0000-0000-000000000003', '99999', 'TestCounty', '00000000-0000-0000-0000-000000000002');
insert into public.cities (id, name, state_id) values ('00000000-0000-0000-0000-000000000004', 'TestCity', '00000000-0000-0000-0000-000000000002');

-- Create zip code
insert into public.zip_codes (zip_code, country_iso_3, city_id, county_id)
values ('12345', 'XXX', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003');

-- Create community
insert into public.communities (h3_index, name, city, state, country)
values ('89283082803ffff', 'Test Community', 'TestCity', 'TestState', 'XXX');

-- Create profile
insert into public.profiles (id, email, home_community_h3_index, zip_plus4, zip_code, country_code)
values ('00000000-0000-0000-0000-000000000001', 'test_jurisdiction@casagrown.local', '89283082803ffff', '12345-6789', '12345', 'XXX')
ON CONFLICT (id) DO UPDATE SET
  home_community_h3_index = EXCLUDED.home_community_h3_index,
  zip_plus4 = EXCLUDED.zip_plus4,
  zip_code = EXCLUDED.zip_code,
  country_code = EXCLUDED.country_code;

-- Create Post
insert into public.posts (id, author_id, type, reach, content, community_h3_index, status)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', 'want_to_sell', 'community', 'Test Content', '89283082803ffff', 'available')
ON CONFLICT (id) DO NOTHING;

-- 2. Test get_user_jurisdiction()
select results_eq(
    $$ select country_iso_3, state_id, county_id, city_id from public.get_user_jurisdiction('00000000-0000-0000-0000-000000000001') $$,
    $$ values ('XXX'::text, '00000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000004'::uuid) $$,
    'get_user_jurisdiction returns correct hierarchy of UUIDs'
);

-- 3. Test category restrictions logic via create_order
-- First verify default (no restrictions = allowed)
select lives_ok(
    $$ select public.create_order_atomic(
        '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 1, 100, 100, 'produce', 'Apple', '2030-01-01', null
    ) $$,
    'fruits is allowed by default (does not raise)'
);

-- Add state-level restriction (blocked categories)
insert into public.category_restrictions (category_name, state_id, reason)
values ('produce', '00000000-0000-0000-0000-000000000002', 'State law restricted');

select throws_ok(
    $$ select public.create_order_atomic(
        '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 1, 100, 100, 'produce', 'Apple', '2030-01-01', null
    ) $$,
    'CATEGORY_RESTRICTED:This category is restricted in your area',
    'fruits is blocked by state restriction table'
);

-- Note: In the new system we only have 'blocked_categories' entries represented as rows in `category_restrictions`.
-- There is no concept of "allow list" overriding a "block list". The logic is purely "if bounded constraint matches, block it".

-- Clear state restriction
delete from public.category_restrictions where category_name = 'produce';

-- Add county-level restriction
insert into public.category_restrictions (category_name, county_id)
values ('produce', '00000000-0000-0000-0000-000000000003');

select throws_ok(
    $$ select public.create_order_atomic(
        '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 1, 100, 100, 'produce', 'Apple', '2030-01-01', null
     ) $$,
    'CATEGORY_RESTRICTED:This category is restricted in your area',
    'fruits is restricted by county override'
);

-- Clear county restriction
delete from public.category_restrictions;

-- Add city-level restriction
insert into public.category_restrictions (category_name, city_id)
values ('produce', '00000000-0000-0000-0000-000000000004');

select throws_ok(
    $$ select public.create_order_atomic(
        '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 1, 100, 100, 'produce', 'Apple', '2030-01-01', null
     ) $$,
    'CATEGORY_RESTRICTED:This category is restricted in your area',
    'fruits is restricted by city override'
);

-- Clear city restriction
delete from public.category_restrictions;

-- Add country-level restriction
insert into public.category_restrictions (category_name, country_iso_3)
values ('produce', 'XXX');

select throws_ok(
    $$ select public.create_order_atomic(
        '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 1, 100, 100, 'produce', 'Apple', '2030-01-01', null
     ) $$,
    'CATEGORY_RESTRICTED:This category is restricted in your area',
    'fruits is restricted by country override'
);


-- 4. Test blocked_products logic via create_order
-- Verify default
select lives_ok(
    $$ select public.create_order_atomic(
        '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 1, 100, 100, 'nuts', 'Almond', '2030-01-01', null
    ) $$,
    'product Almond is allowed by default'
);

-- Add state-level product block
insert into public.blocked_products (product_name, state_id, reason) 
values ('Almond', '00000000-0000-0000-0000-000000000002', 'State almond ban');

select throws_ok(
    $$ select public.create_order_atomic(
        '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 1, 100, 100, 'nuts', 'Almond', '2030-01-01', null
    ) $$,
    'PRODUCT_RESTRICTED:State almond ban',
    'product Almond is blocked by state'
);

-- Add nationwide product block
insert into public.blocked_products (product_name, country_iso_3) 
values ('Peanut', 'XXX');

select throws_ok(
    $$ select public.create_order_atomic(
        '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 1, 100, 100, 'nuts', 'Peanut', '2030-01-01', null
    ) $$,
    'PRODUCT_RESTRICTED:This product is restricted in your area',
    'product Peanut is blocked by country'
);

-- Ensure user outside of blocked area succeeds.
-- Move user to a random other state for a distinct test
insert into public.states (id, code, name, country_iso_3) values ('00000000-0000-0000-0000-000000000009', 'YY', 'OtherState', 'XXX');
insert into public.counties (id, fips_code, name, state_id) values ('00000000-0000-0000-0000-000000000008', '88888', 'OtherCounty', '00000000-0000-0000-0000-000000000009');
insert into public.cities (id, name, state_id) values ('00000000-0000-0000-0000-000000000007', 'OtherCity', '00000000-0000-0000-0000-000000000009');
insert into public.zip_codes (zip_code, country_iso_3, city_id, county_id)
values ('54321', 'XXX', '00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000008');

update public.profiles set zip_code = '54321' where id = '00000000-0000-0000-0000-000000000001';

-- Now user is in YY instead of XX state. They should not hit the Almond constraint any longer
select lives_ok(
    $$ select public.create_order_atomic(
        '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 1, 100, 100, 'nuts', 'Almond', '2030-01-01', null
    ) $$,
    'product Almond restriction is scoped correctly, different user jurisdiction succeeds'
);

select * from finish();
rollback;
