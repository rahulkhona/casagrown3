BEGIN;
SELECT plan(3);

-- Mock settings
INSERT INTO market_settings (id, products_never_expire, demo_booth_min_total)
VALUES (true, false, 0)
ON CONFLICT (id) DO UPDATE SET products_never_expire = false, demo_booth_min_total = 0;

-- Mock user (seller)
INSERT INTO auth.users (id, email) VALUES
  ('b7777777-7777-7777-7777-777777777777', 'seller@draft.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (id, email, full_name) VALUES
  ('b7777777-7777-7777-7777-777777777777', 'seller@draft.test', 'Test Seller')
ON CONFLICT DO NOTHING;

-- Mock booth (open) — delete auto-created booth from trigger first
DELETE FROM market_booths WHERE owner_id = 'b7777777-7777-7777-7777-777777777777';
INSERT INTO market_booths (owner_id, name, is_open, offers_pickup, pickup_location)
VALUES ('b7777777-7777-7777-7777-777777777777', 'Draft Booth', true, true, ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326));

-- 1. Insert an active, non-draft, APPROVED product
INSERT INTO market_products (
  seller_id, name, description, category, price_usd, unit, inventory, is_active, is_draft, moderation_status, market_date, expires_at
) VALUES (
  'b7777777-7777-7777-7777-777777777777', 'Active Honey', 'Standard product', 'honey', 10, 'jar', 5, true, false, 'approved', CURRENT_DATE, now() + interval '30 days'
);

-- 2. Insert a DRAFT product (is_active true but is_draft true)
INSERT INTO market_products (
  seller_id, name, description, category, price_usd, unit, inventory, is_active, is_draft, moderation_status, market_date, expires_at
) VALUES (
  'b7777777-7777-7777-7777-777777777777', 'Draft Carrots', 'Should be hidden', 'produce', 5, 'bunch', 10, true, true, 'pending', CURRENT_DATE, now() + interval '30 days'
);

-- 3. Insert a PENDING product (is_active true, is_draft false, but moderation_status='pending')
INSERT INTO market_products (
  seller_id, name, description, category, price_usd, unit, inventory, is_active, is_draft, moderation_status, market_date, expires_at
) VALUES (
  'b7777777-7777-7777-7777-777777777777', 'Pending Apples', 'Not approved yet', 'produce', 6, 'bag', 10, true, false, 'pending', CURRENT_DATE, now() + interval '30 days'
);

-- 4. Insert a FLAGGED product (moderation_status='flagged')
INSERT INTO market_products (
  seller_id, name, description, category, price_usd, unit, inventory, is_active, is_draft, moderation_status, market_date, expires_at
) VALUES (
  'b7777777-7777-7777-7777-777777777777', 'Flagged Weed', 'Banned item', 'produce', 100, 'gram', 1, false, false, 'flagged', CURRENT_DATE, now() + interval '30 days'
);

-- TEST 1: Check `is_draft` default column properties constraint
SELECT has_column('public', 'market_products', 'is_draft', 'market_products table should have is_draft column');
SELECT col_default_is('public', 'market_products', 'is_draft', 'false', 'is_draft should default to false');

-- TEST 2: nearby_booths strictly explicitly ignores drafts, pending, and flagged items
SELECT results_eq(
  $$
    SELECT (p->>'name')::text
    FROM nearby_booths(37.7749, -122.4194, 10, 'all', NULL, NULL, NULL, NULL, NULL, false),
    jsonb_array_elements(matched_products) AS p
    WHERE owner_id = 'b7777777-7777-7777-7777-777777777777'
  $$,
  $$ VALUES ('Active Honey'::text) $$,
  'nearby_booths must exclusively return APPROVED non-draft products, ignoring drafts, pending, and flagged listings'
);

ROLLBACK;
