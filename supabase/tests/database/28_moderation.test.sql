BEGIN;
SELECT plan(1);
INSERT INTO auth.users (id, email) VALUES
  ('c8888888-8888-8888-8888-888888888888', 'm@draft.test')
ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, email, full_name) VALUES
  ('c8888888-8888-8888-8888-888888888888', 'm@draft.test', 'Moderator')
ON CONFLICT DO NOTHING;
INSERT INTO market_booths (owner_id, name, is_open, offers_pickup, pickup_location)
VALUES ('c8888888-8888-8888-8888-888888888888', 'Test Booth', true, true, ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326));

INSERT INTO market_products (
  seller_id, name, description, category, price_usd, unit, inventory, is_active, is_draft, moderation_status, market_date, expires_at
) VALUES (
  'c8888888-8888-8888-8888-888888888888', 'Pending Oranges', 'Not approved', 'produce', 6, 'bag', 10, true, false, 'pending', CURRENT_DATE, now() + interval '30 days'
);

SELECT results_eq(
  $$ SELECT (p->>'name')::text FROM nearby_booths(37.7749, -122.4194, 10), jsonb_array_elements(matched_products) AS p WHERE owner_id='c8888888-8888-8888-8888-888888888888' $$,
  $$ VALUES (NULL::text) $$,
  'Check if pending oranges returns'
);
ROLLBACK;
