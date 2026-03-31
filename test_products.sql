-- Test products with varied fulfillment window configurations
-- Run: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f /tmp/test_products.sql

DO $$
DECLARE
  today_str text := to_char(now(), 'YYYY-MM-DD');
  tomorrow_str text := to_char(now() + interval '1 day', 'YYYY-MM-DD');
  expire_tomorrow timestamptz := (now() + interval '1 day')::date + interval '20 hours';
  expire_today timestamptz := now()::date + interval '20 hours';
BEGIN

-- Product 1: Delivery + Pickup on BOTH days
INSERT INTO market_products (seller_id, name, description, category, price_usd, unit, inventory, photos, is_active, is_draft, market_date, expires_at, window_dates, product_delivery_windows, product_pickup_windows)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Fresh Tomatoes (Delivery+Pickup Both Days)',
  'Vine-ripened heirloom tomatoes, available for delivery and pickup today and tomorrow.',
  'produce', 5.00, 'bunch', 20, '[]'::jsonb, true, false,
  today_str, expire_tomorrow,
  jsonb_build_array(today_str, tomorrow_str),
  jsonb_build_object(
    today_str, '[{"id":"10-12","start":"10:00","end":"12:00"},{"id":"14-16","start":"14:00","end":"16:00"}]'::jsonb,
    tomorrow_str, '[{"id":"8-10","start":"8:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb
  ),
  jsonb_build_object(
    today_str, '[{"id":"12-14","start":"12:00","end":"14:00"}]'::jsonb,
    tomorrow_str, '[{"id":"10-12","start":"10:00","end":"12:00"},{"id":"14-16","start":"14:00","end":"16:00"}]'::jsonb
  )
);

-- Product 2: Delivery Only Today
INSERT INTO market_products (seller_id, name, description, category, price_usd, unit, inventory, photos, is_active, is_draft, market_date, expires_at, window_dates, product_delivery_windows, product_pickup_windows)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'Mango Basket (Delivery Only Today)',
  'Fresh alphonso mangoes, delivery available today only.',
  'produce', 12.00, 'basket', 8, '[]'::jsonb, true, false,
  today_str, expire_today,
  jsonb_build_array(today_str),
  jsonb_build_object(today_str, '[{"id":"10-12","start":"10:00","end":"12:00"},{"id":"16-18","start":"16:00","end":"18:00"}]'::jsonb),
  null
);

-- Product 3: Pickup Only Tomorrow
INSERT INTO market_products (seller_id, name, description, category, price_usd, unit, inventory, photos, is_active, is_draft, market_date, expires_at, window_dates, product_delivery_windows, product_pickup_windows)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  'Organic Eggs (Pickup Only Tomorrow)',
  'Farm-fresh organic eggs, available for pickup tomorrow.',
  'eggs', 8.00, 'dozen', 15, '[]'::jsonb, true, false,
  tomorrow_str, expire_tomorrow,
  jsonb_build_array(tomorrow_str),
  null,
  jsonb_build_object(tomorrow_str, '[{"id":"8-10","start":"8:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"},{"id":"14-16","start":"14:00","end":"16:00"}]'::jsonb)
);

-- Product 4: Delivery Today + Pickup Tomorrow (mixed)
INSERT INTO market_products (seller_id, name, description, category, price_usd, unit, inventory, photos, is_active, is_draft, market_date, expires_at, window_dates, product_delivery_windows, product_pickup_windows)
VALUES (
  '44444444-4444-4444-4444-444444444444',
  'Herb Bundle (Delivery Today, Pickup Tomorrow)',
  'Mixed herb bundle — we deliver today, or pick up from us tomorrow.',
  'produce', 4.50, 'bunch', 30, '[]'::jsonb, true, false,
  today_str, expire_tomorrow,
  jsonb_build_array(today_str, tomorrow_str),
  jsonb_build_object(today_str, '[{"id":"10-12","start":"10:00","end":"12:00"},{"id":"14-16","start":"14:00","end":"16:00"}]'::jsonb),
  jsonb_build_object(tomorrow_str, '[{"id":"8-10","start":"8:00","end":"10:00"},{"id":"12-14","start":"12:00","end":"14:00"}]'::jsonb)
);

-- Product 5: Free, Delivery Only Both Days
INSERT INTO market_products (seller_id, name, description, category, price_usd, unit, inventory, photos, is_active, is_draft, market_date, expires_at, window_dates, product_delivery_windows, product_pickup_windows)
VALUES (
  '55555555-5555-5555-5555-555555555555',
  'Free Zucchini (Delivery Only Both Days)',
  'Surplus zucchini from the garden — free to a good home! Delivery only.',
  'produce', 0, 'each', 50, '[]'::jsonb, true, false,
  today_str, expire_tomorrow,
  jsonb_build_array(today_str, tomorrow_str),
  jsonb_build_object(
    today_str, '[{"id":"12-14","start":"12:00","end":"14:00"},{"id":"18-20","start":"18:00","end":"20:00"}]'::jsonb,
    tomorrow_str, '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb
  ),
  null
);

RAISE NOTICE 'Inserted 5 test products with varied fulfillment configs';
END $$;
