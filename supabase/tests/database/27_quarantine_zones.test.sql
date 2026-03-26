begin;

select plan(8);

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
-- 3. County quarantine detected
-- ============================================================================
insert into quarantine_zones (id, country_iso_3, state_id, county_id, category, pest_name, starts_at, is_active)
values ('a0000000-0000-0000-0000-0000000000a1', 'QZZ', 'a0000000-0000-0000-0000-000000000010',
        'a0000000-0000-0000-0000-000000000020', 'produce', 'Test Fruit Fly', CURRENT_DATE, true);

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

select * from finish();
rollback;
