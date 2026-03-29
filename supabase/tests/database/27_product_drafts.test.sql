BEGIN;
SELECT plan(3);

-- Mock settings
INSERT INTO market_settings (id, products_never_expire, demo_booth_min_total)
VALUES (true, false, 0)
ON CONFLICT (id) DO UPDATE SET products_never_expire = false, demo_booth_min_total = 0;

-- Mock user (seller)
INSERT INTO auth.users (id, email) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'seller@draft.test');

INSERT INTO public.profiles (id, email, full_name, role) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'seller@draft.test', 'Test Seller', 'seller');

-- Mock booth (open)
INSERT INTO market_booths (owner_id, name, is_open, offers_pickup, pickup_location)
VALUES ('a1111111-1111-1111-1111-111111111111', 'Draft Booth', true, true, ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326));

-- 1. Insert an active, non-draft product
INSERT INTO market_products (
  seller_id, name, description, category, price_usd, unit, inventory, is_active, is_draft, market_date, expires_at
) VALUES (
  'a1111111-1111-1111-1111-111111111111', 'Active Honey', 'Standard product', 'honey', 10, 'jar', 5, true, false, CURRENT_DATE, now() + interval '30 days'
);

-- 2. Insert a DRAFT product (is_active true but is_draft true)
INSERT INTO market_products (
  seller_id, name, description, category, price_usd, unit, inventory, is_active, is_draft, market_date, expires_at
) VALUES (
  'a1111111-1111-1111-1111-111111111111', 'Draft Carrots', 'Should be hidden', 'produce', 5, 'bunch', 10, true, true, CURRENT_DATE, now() + interval '30 days'
);

-- TEST 1: Check `is_draft` default column properties constraint
SELECT has_column('public', 'market_products', 'is_draft', 'market_products table should have is_draft column');
SELECT column_default_is('public', 'market_products', 'is_draft', 'false', 'is_draft should default to false');

-- TEST 2: nearby_booths strictly explicitly ignores drafts
SELECT results_eq(
  $$
    SELECT (matched_products->0->>'name')::text
    FROM nearby_booths(37.7749, -122.4194, 10, 'all', NULL, NULL, NULL, NULL, NULL, false)
    WHERE owner_id = 'a1111111-1111-1111-1111-111111111111'
  $$,
  $$ VALUES ('Active Honey'::text) $$,
  'nearby_booths must exclusively return non-draft products and hide Draft Carrots'
);

ROLLBACK;
