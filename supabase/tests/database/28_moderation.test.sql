BEGIN;
SELECT plan(1);
INSERT INTO auth.users (id, email) VALUES
  ('c8888888-8888-8888-8888-888888888888', 'm@draft.test')
ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, email, full_name) VALUES
  ('c8888888-8888-8888-8888-888888888888', 'm@draft.test', 'Moderator')
ON CONFLICT DO NOTHING;
DELETE FROM market_booths WHERE owner_id = 'c8888888-8888-8888-8888-888888888888';
INSERT INTO market_booths (owner_id, name, is_open, offers_pickup, pickup_location)
VALUES ('c8888888-8888-8888-8888-888888888888', 'Test Booth', true, true, ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326));

INSERT INTO market_products (
  seller_id, name, description, category, price_usd, unit, inventory, is_active, is_draft, moderation_status, market_date, expires_at
) VALUES (
  'c8888888-8888-8888-8888-888888888888', 'Pending Oranges', 'Not approved', 'produce', 6, 'bag', 10, true, false, 'pending', CURRENT_DATE, now() + interval '30 days'
);

SELECT is_empty(
  $$ SELECT (p->>'name')::text FROM nearby_booths(user_lat := 37.7749::float8, user_lng := -122.4194::float8, max_miles := 10::float8, p_limit := 100), jsonb_array_elements(matched_products) AS p WHERE owner_id='c8888888-8888-8888-8888-888888888888' $$,
  'Pending oranges are excluded from nearby_booths (moderation_status != approved)'
);
ROLLBACK;
