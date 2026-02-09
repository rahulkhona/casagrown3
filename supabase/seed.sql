-- Seed Data for E2E Testing and Local Development
-- Deterministic IDs used for reliability

-- 1. Countries
insert into public.countries (iso_3, name, currency_symbol, phone_code)
values ('USA', 'United States', '$', '+1')
on conflict (iso_3) do nothing;

-- 2. States (California)
insert into public.states (id, country_iso_3, code, name)
values ('00000000-0000-0000-0000-000000000001', 'USA', 'CA', 'California')
on conflict (country_iso_3, code) do nothing;

-- 3. Cities (San Jose)
insert into public.cities (id, state_id, name)
values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'San Jose')
on conflict (state_id, name) do nothing;

-- 4. Zip Codes (95125)
insert into public.zip_codes (zip_code, country_iso_3, city_id, latitude, longitude)
values ('95125', 'USA', '00000000-0000-0000-0000-000000000002', 37.30, -121.90)
on conflict (zip_code, country_iso_3) do nothing;

-- 5. Communities (Willow Glen - H3 Index)
-- Using a representative H3 index for Willow Glen, San Jose, CA
insert into public.communities (h3_index, name, city, state, country, location)
values (
  '89283470c2fffff', 
  'Willow Glen', 
  'San Jose', 
  'California', 
  'USA',
  'POINT(-121.90 37.30)'
)
on conflict (h3_index) do nothing;

-- 6. Incentive Rules
-- (Authentication/Signup rule is already handled by migration, adding others for manual testing)
insert into public.incentive_rules (action_type, scope, points, start_date)
values 
  ('join_a_community', 'global', 100, now()),
  ('make_first_post', 'global', 25, now()),
  ('invitee_signing_up', 'global', 50, now()),
  ('invitee_making_first_transaction', 'global', 100, now());

-- 7. Sales Category Restrictions (Allow common items globally for development)
insert into public.sales_category_restrictions (category, scope, is_allowed, country_iso_3)
values 
  ('vegetables', 'global', true, 'USA'),
  ('fruits', 'global', true, 'USA');

-- 8. Storage Buckets
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Storage policies for avatars bucket
CREATE POLICY "Allow authenticated uploads" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');
CREATE POLICY "Allow public read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Allow owner updates" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Allow owner deletes" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
