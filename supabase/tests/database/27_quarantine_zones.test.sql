begin;

select plan(16);

-- ============================================================================
-- Setup test data for quarantine system
-- Profile → zip_code → zip_codes(county_id) → counties
-- ============================================================================

-- Create test user
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000099', 'quarantine_seller@casagrown.local');

-- Create jurisdiction hierarchy
insert into public.countries (iso_3, name) values ('QZZ', 'QuarantineCountry') ON CONFLICT DO NOTHING;
insert into public.states (id, code, name, country_iso_3) values ('a0000000-0000-0000-0000-000000000010', 'QA', 'QuarantineState', 'QZZ');
insert into public.counties (id, fips_code, name, state_id) values ('a0000000-0000-0000-0000-000000000020', 'Q9999', 'QuarantineCounty', 'a0000000-0000-0000-0000-000000000010');
insert into public.cities (id, name, state_id) values ('a0000000-0000-0000-0000-000000000030', 'QuarantineCity', 'a0000000-0000-0000-0000-000000000010');

-- Create zip code linking city and county
insert into public.zip_codes (zip_code, country_iso_3, city_id, county_id)
values ('Q1234', 'QZZ', 'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000020');

-- Create seller profile with zip_code (county resolved via zip_codes table)
insert into public.profiles (id, email, zip_code, country_code)
values ('a0000000-0000-0000-0000-000000000099', 'quarantine_seller@casagrown.local', 'Q1234', 'QZZ')
ON CONFLICT (id) DO UPDATE SET
  zip_code = EXCLUDED.zip_code,
  country_code = EXCLUDED.country_code;

-- Create a booth and product for the seller (needed by check_quarantine_for_product)
insert into public.market_booths (id, owner_id, name)
values ('a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-000000000099', 'Test Quarantine Booth')
ON CONFLICT (owner_id) DO UPDATE SET name = EXCLUDED.name;

insert into public.market_products (id, seller_id, name, category, price_usd, unit, inventory, is_active, market_date)
values ('a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-000000000099', 'Test Mangoes', 'produce', 5.00, 'lb', 10, true, CURRENT_DATE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category;

insert into public.market_products (id, seller_id, name, category, price_usd, unit, inventory, is_active, market_date)
values ('a0000000-0000-0000-0000-0000000000c2', 'a0000000-0000-0000-0000-000000000099', 'Test Eggs', 'eggs', 4.00, 'dozen', 5, true, CURRENT_DATE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category;

-- ============================================================================
-- 1. Table exists
-- ============================================================================
select has_table('quarantine_zones', 'quarantine_zones table exists');

-- ============================================================================
-- 2. No quarantines — returns empty
-- ============================================================================
select is(
  (select count(*) from check_quarantine_for_seller('a0000000-0000-0000-0000-000000000099', 'produce'))::int,
  0,
  'No quarantine returns empty result'
);

-- ============================================================================
-- 3. County quarantine detected by check_quarantine_for_seller
-- ============================================================================
insert into quarantine_zones (id, country_iso_3, state_id, county_id, category, pest_name, starts_at, is_active, keywords)
values ('a0000000-0000-0000-0000-0000000000a1', 'QZZ', 'a0000000-0000-0000-0000-000000000010',
        'a0000000-0000-0000-0000-000000000020', 'produce', 'Test Fruit Fly', CURRENT_DATE, true,
        ARRAY['mangoes', 'citrus', 'guava']);

select is(
  (select count(*) from check_quarantine_for_seller('a0000000-0000-0000-0000-000000000099', 'produce'))::int,
  1,
  'County quarantine detected for seller in quarantined county'
);

-- ============================================================================
-- 4. Correct pest name returned
-- ============================================================================
select is(
  (select pest_name from check_quarantine_for_seller('a0000000-0000-0000-0000-000000000099', 'produce') limit 1),
  'Test Fruit Fly',
  'Correct pest_name returned from quarantine check'
);

-- ============================================================================
-- 5. Non-quarantined category returns empty
-- ============================================================================
select is(
  (select count(*) from check_quarantine_for_seller('a0000000-0000-0000-0000-000000000099', 'honey'))::int,
  0,
  'Non-quarantined category returns empty for seller in quarantined county'
);

-- ============================================================================
-- 6. ALL category blocks everything
-- ============================================================================
insert into quarantine_zones (id, country_iso_3, state_id, county_id, category, pest_name, starts_at, is_active)
values ('a0000000-0000-0000-0000-0000000000a2', 'QZZ', 'a0000000-0000-0000-0000-000000000010',
        'a0000000-0000-0000-0000-000000000020', 'ALL', 'Total Quarantine', CURRENT_DATE, true);

select is(
  (select count(*) from check_quarantine_for_seller('a0000000-0000-0000-0000-000000000099', 'honey'))::int,
  1,
  'ALL category quarantine blocks any category'
);

-- ============================================================================
-- 7. Inactive quarantine not returned
-- ============================================================================
update quarantine_zones set is_active = false where id = 'a0000000-0000-0000-0000-0000000000a1';
update quarantine_zones set is_active = false where id = 'a0000000-0000-0000-0000-0000000000a2';

select is(
  (select count(*) from check_quarantine_for_seller('a0000000-0000-0000-0000-000000000099', 'produce'))::int,
  0,
  'Inactive quarantine is not detected'
);

-- ============================================================================
-- 8. Expired quarantine not returned
-- ============================================================================
update quarantine_zones set is_active = true, ends_at = CURRENT_DATE - interval '1 day' where id = 'a0000000-0000-0000-0000-0000000000a1';

select is(
  (select count(*) from check_quarantine_for_seller('a0000000-0000-0000-0000-000000000099', 'produce'))::int,
  0,
  'Expired quarantine (ends_at in past) is not detected'
);

-- ============================================================================
-- 9. STATE-level quarantine NOT returned (county-only enforcement)
-- ============================================================================
-- Reset county quarantine
update quarantine_zones set is_active = false where id = 'a0000000-0000-0000-0000-0000000000a1';

-- Insert state-level quarantine (no county_id)
insert into quarantine_zones (id, country_iso_3, state_id, county_id, category, pest_name, starts_at, is_active)
values ('a0000000-0000-0000-0000-0000000000a3', 'QZZ', 'a0000000-0000-0000-0000-000000000010',
        NULL, 'produce', 'State Level Pest', CURRENT_DATE, true);

select is(
  (select count(*) from check_quarantine_for_seller('a0000000-0000-0000-0000-000000000099', 'produce'))::int,
  0,
  'State-level quarantine NOT returned by check_quarantine_for_seller (county-only)'
);

-- ============================================================================
-- 10. NATIONAL quarantine NOT returned (county-only enforcement)
-- ============================================================================
insert into quarantine_zones (id, country_iso_3, state_id, county_id, category, pest_name, starts_at, is_active)
values ('a0000000-0000-0000-0000-0000000000a4', 'QZZ', NULL,
        NULL, 'produce', 'National Pest', CURRENT_DATE, true);

select is(
  (select count(*) from check_quarantine_for_seller('a0000000-0000-0000-0000-000000000099', 'produce'))::int,
  0,
  'National quarantine NOT returned by check_quarantine_for_seller (county-only)'
);

-- ============================================================================
-- 11. check_quarantine_for_product: produce product IS quarantined
-- ============================================================================
-- Re-activate county quarantine
update quarantine_zones set is_active = true, ends_at = NULL where id = 'a0000000-0000-0000-0000-0000000000a1';

select is(
  (select count(*) from check_quarantine_for_product('a0000000-0000-0000-0000-0000000000c1'))::int,
  1,
  'check_quarantine_for_product returns quarantine for produce product from quarantined seller'
);

-- ============================================================================
-- 12. check_quarantine_for_product: eggs product NOT quarantined
-- ============================================================================
select is(
  (select count(*) from check_quarantine_for_product('a0000000-0000-0000-0000-0000000000c2'))::int,
  0,
  'check_quarantine_for_product returns empty for eggs (non-quarantined category)'
);

-- ============================================================================
-- 13. check_quarantine_for_product: returns correct pest name
-- ============================================================================
select is(
  (select pest_name from check_quarantine_for_product('a0000000-0000-0000-0000-0000000000c1') limit 1),
  'Test Fruit Fly',
  'check_quarantine_for_product returns correct pest_name'
);

-- ============================================================================
-- 14. get_quarantines_for_user: returns ONLY county-level
-- ============================================================================
-- We have: county active (a1), state active (a3), national active (a4)
select is(
  (select count(*) from get_quarantines_for_user('a0000000-0000-0000-0000-000000000099'))::int,
  1,
  'get_quarantines_for_user returns ONLY county-level quarantine (not state/national)'
);

-- ============================================================================
-- 15. get_quarantines_for_user: scope is county
-- ============================================================================
select is(
  (select scope from get_quarantines_for_user('a0000000-0000-0000-0000-000000000099') limit 1),
  'county',
  'get_quarantines_for_user scope is county'
);

-- ============================================================================
-- 16. ZIP+4 support: seller with only zip_plus4 still quarantine-checked
-- ============================================================================
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000098', 'zip4_seller@casagrown.local');
insert into public.profiles (id, email, zip_code, zip_plus4, country_code)
values ('a0000000-0000-0000-0000-000000000098', 'zip4_seller@casagrown.local', NULL, 'Q1234-5678', 'QZZ')
ON CONFLICT (id) DO UPDATE SET
  zip_code = NULL,
  zip_plus4 = EXCLUDED.zip_plus4,
  country_code = EXCLUDED.country_code;

select is(
  (select count(*) from check_quarantine_for_seller('a0000000-0000-0000-0000-000000000098', 'produce'))::int,
  1,
  'ZIP+4 seller correctly detected in quarantine zone via COALESCE'
);

select * from finish();
rollback;
