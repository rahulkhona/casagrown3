-- ============================================================
-- Migration: Normalize addresses and fulfillment windows
-- 
-- 1. Add decomposed address columns to market_booths
-- 2. Create booth_fulfillment_windows table
-- 3. Migrate existing data
-- 4. Update create_booth RPC
-- ============================================================

-- ── 1. Decomposed address columns on market_booths ──

ALTER TABLE market_booths ADD COLUMN IF NOT EXISTS booth_street TEXT;
ALTER TABLE market_booths ADD COLUMN IF NOT EXISTS booth_city TEXT;
ALTER TABLE market_booths ADD COLUMN IF NOT EXISTS booth_state TEXT;
ALTER TABLE market_booths ADD COLUMN IF NOT EXISTS booth_zip TEXT;

ALTER TABLE market_booths ADD COLUMN IF NOT EXISTS pickup_street TEXT;
ALTER TABLE market_booths ADD COLUMN IF NOT EXISTS pickup_city TEXT;
ALTER TABLE market_booths ADD COLUMN IF NOT EXISTS pickup_state TEXT;
ALTER TABLE market_booths ADD COLUMN IF NOT EXISTS pickup_zip TEXT;


-- ── 2. booth_fulfillment_windows table ──

CREATE TABLE IF NOT EXISTS booth_fulfillment_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booth_id UUID NOT NULL REFERENCES market_booths(id) ON DELETE CASCADE,
  window_type TEXT NOT NULL CHECK (window_type IN ('delivery', 'pickup')),
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('mon','tue','wed','thu','fri','sat','sun')),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(booth_id, window_type, day_of_week, start_time)
);

ALTER TABLE booth_fulfillment_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read fulfillment windows"
  ON booth_fulfillment_windows FOR SELECT USING (true);

CREATE POLICY "Owner can insert fulfillment windows"
  ON booth_fulfillment_windows FOR INSERT
  WITH CHECK (booth_id IN (SELECT id FROM market_booths WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can update fulfillment windows"
  ON booth_fulfillment_windows FOR UPDATE
  USING (booth_id IN (SELECT id FROM market_booths WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can delete fulfillment windows"
  ON booth_fulfillment_windows FOR DELETE
  USING (booth_id IN (SELECT id FROM market_booths WHERE owner_id = auth.uid()));


-- ── 3. Migrate existing data ──

-- 3a. Parse booth_address into decomposed fields
-- Format varies: "Place Name, Street" or "Street, City, State ZIP"
-- Best-effort: split on commas
UPDATE market_booths
SET
  booth_street = CASE
    WHEN array_length(string_to_array(booth_address, ','), 1) >= 3 THEN
      trim(array_to_string((string_to_array(booth_address, ','))[1:array_length(string_to_array(booth_address, ','), 1) - 2], ','))
    ELSE trim(booth_address)
  END,
  booth_city = CASE
    WHEN array_length(string_to_array(booth_address, ','), 1) >= 3 THEN
      trim((string_to_array(booth_address, ','))[array_length(string_to_array(booth_address, ','), 1) - 1])
    ELSE NULL
  END,
  booth_state = CASE
    WHEN array_length(string_to_array(booth_address, ','), 1) >= 3 THEN
      trim(split_part(trim((string_to_array(booth_address, ','))[array_length(string_to_array(booth_address, ','), 1)]), ' ', 1))
    ELSE NULL
  END,
  booth_zip = CASE
    WHEN array_length(string_to_array(booth_address, ','), 1) >= 3 THEN
      trim(split_part(trim((string_to_array(booth_address, ','))[array_length(string_to_array(booth_address, ','), 1)]), ' ', 2))
    ELSE NULL
  END
WHERE booth_address IS NOT NULL AND booth_street IS NULL;

-- 3b. Parse pickup_address
UPDATE market_booths
SET
  pickup_street = CASE
    WHEN array_length(string_to_array(pickup_address, ','), 1) >= 3 THEN
      trim(array_to_string((string_to_array(pickup_address, ','))[1:array_length(string_to_array(pickup_address, ','), 1) - 2], ','))
    ELSE trim(pickup_address)
  END,
  pickup_city = CASE
    WHEN array_length(string_to_array(pickup_address, ','), 1) >= 3 THEN
      trim((string_to_array(pickup_address, ','))[array_length(string_to_array(pickup_address, ','), 1) - 1])
    ELSE NULL
  END,
  pickup_state = CASE
    WHEN array_length(string_to_array(pickup_address, ','), 1) >= 3 THEN
      trim(split_part(trim((string_to_array(pickup_address, ','))[array_length(string_to_array(pickup_address, ','), 1)]), ' ', 1))
    ELSE NULL
  END,
  pickup_zip = CASE
    WHEN array_length(string_to_array(pickup_address, ','), 1) >= 3 THEN
      trim(split_part(trim((string_to_array(pickup_address, ','))[array_length(string_to_array(pickup_address, ','), 1)]), ' ', 2))
    ELSE NULL
  END
WHERE pickup_address IS NOT NULL AND pickup_street IS NULL;


-- 3c. Migrate JSONB weekly_delivery_windows → booth_fulfillment_windows rows
DO $$
DECLARE
  r RECORD;
  day_key TEXT;
  slot TEXT;
  start_h INT;
  end_h INT;
BEGIN
  FOR r IN
    SELECT id, weekly_delivery_windows
    FROM market_booths
    WHERE weekly_delivery_windows IS NOT NULL
      AND weekly_delivery_windows != '{}'::jsonb
      AND weekly_delivery_windows != 'null'::jsonb
  LOOP
    FOR day_key IN SELECT jsonb_object_keys(r.weekly_delivery_windows)
    LOOP
      FOR slot IN SELECT jsonb_array_elements_text(r.weekly_delivery_windows->day_key)
      LOOP
        -- Parse "10-12" into start_time 10:00, end_time 12:00
        -- Also handle "custom-17:00-19:00" format
        IF slot LIKE 'custom-%' THEN
          BEGIN
            INSERT INTO booth_fulfillment_windows (booth_id, window_type, day_of_week, start_time, end_time)
            VALUES (
              r.id, 'delivery', day_key,
              split_part(replace(slot, 'custom-', ''), '-', 1)::time,
              split_part(replace(slot, 'custom-', ''), '-', 2)::time
            )
            ON CONFLICT DO NOTHING;
          EXCEPTION WHEN OTHERS THEN
            -- skip malformed custom windows
            NULL;
          END;
        ELSE
          start_h := split_part(slot, '-', 1)::int;
          end_h := split_part(slot, '-', 2)::int;
          INSERT INTO booth_fulfillment_windows (booth_id, window_type, day_of_week, start_time, end_time)
          VALUES (r.id, 'delivery', day_key, make_time(start_h, 0, 0), make_time(end_h, 0, 0))
          ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- Same for pickup
  FOR r IN
    SELECT id, weekly_pickup_windows
    FROM market_booths
    WHERE weekly_pickup_windows IS NOT NULL
      AND weekly_pickup_windows != '{}'::jsonb
      AND weekly_pickup_windows != 'null'::jsonb
  LOOP
    FOR day_key IN SELECT jsonb_object_keys(r.weekly_pickup_windows)
    LOOP
      FOR slot IN SELECT jsonb_array_elements_text(r.weekly_pickup_windows->day_key)
      LOOP
        IF slot LIKE 'custom-%' THEN
          BEGIN
            INSERT INTO booth_fulfillment_windows (booth_id, window_type, day_of_week, start_time, end_time)
            VALUES (
              r.id, 'pickup', day_key,
              split_part(replace(slot, 'custom-', ''), '-', 1)::time,
              split_part(replace(slot, 'custom-', ''), '-', 2)::time
            )
            ON CONFLICT DO NOTHING;
          EXCEPTION WHEN OTHERS THEN
            NULL;
          END;
        ELSE
          start_h := split_part(slot, '-', 1)::int;
          end_h := split_part(slot, '-', 2)::int;
          INSERT INTO booth_fulfillment_windows (booth_id, window_type, day_of_week, start_time, end_time)
          VALUES (r.id, 'pickup', day_key, make_time(start_h, 0, 0), make_time(end_h, 0, 0))
          ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;


-- ── 4. Update create_booth RPC to use decomposed fields ──

CREATE OR REPLACE FUNCTION create_booth(
  p_name TEXT,
  p_pickup_address TEXT DEFAULT NULL,
  p_offers_delivery BOOLEAN DEFAULT false,
  p_offers_pickup BOOLEAN DEFAULT true,
  p_delivery_radius_miles INTEGER DEFAULT 5,
  p_delivery_zipcodes TEXT[] DEFAULT NULL,
  p_is_default BOOLEAN DEFAULT false,
  -- New decomposed address fields
  p_booth_street TEXT DEFAULT NULL,
  p_booth_city TEXT DEFAULT NULL,
  p_booth_state TEXT DEFAULT NULL,
  p_booth_zip TEXT DEFAULT NULL,
  p_pickup_street TEXT DEFAULT NULL,
  p_pickup_city TEXT DEFAULT NULL,
  p_pickup_state TEXT DEFAULT NULL,
  p_pickup_zip TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_booth_id UUID;
BEGIN
  -- If setting as default, unset existing default
  IF p_is_default THEN
    UPDATE market_booths SET is_default = false
    WHERE owner_id = auth.uid() AND is_default = true;
  END IF;

  INSERT INTO market_booths (
    id, owner_id, name, pickup_address,
    offers_delivery, offers_pickup,
    delivery_radius_miles, delivery_zipcodes, is_default,
    booth_street, booth_city, booth_state, booth_zip,
    pickup_street, pickup_city, pickup_state, pickup_zip
  ) VALUES (
    gen_random_uuid(), auth.uid(), p_name, p_pickup_address,
    p_offers_delivery, p_offers_pickup,
    p_delivery_radius_miles, p_delivery_zipcodes, p_is_default,
    p_booth_street, p_booth_city, p_booth_state, p_booth_zip,
    p_pickup_street, p_pickup_city, p_pickup_state, p_pickup_zip
  ) RETURNING id INTO v_booth_id;

  RETURN v_booth_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 5. Seed fulfillment windows for Sam's booths ──

-- Willow Glen Farm Stand (Sam's default booth)
INSERT INTO booth_fulfillment_windows (booth_id, window_type, day_of_week, start_time, end_time)
SELECT b.id, 'delivery', d.day, d.start_t::time, d.end_t::time
FROM market_booths b,
  (VALUES ('sat', '09:00', '11:00'), ('sat', '14:00', '16:00'), ('sun', '10:00', '12:00')) AS d(day, start_t, end_t)
WHERE b.name = 'Willow Glen Farm Stand' AND b.owner_id = 'a1111111-1111-1111-1111-111111111111'
ON CONFLICT DO NOTHING;

INSERT INTO booth_fulfillment_windows (booth_id, window_type, day_of_week, start_time, end_time)
SELECT b.id, 'pickup', d.day, d.start_t::time, d.end_t::time
FROM market_booths b,
  (VALUES ('sat', '08:00', '12:00'), ('sun', '09:00', '13:00')) AS d(day, start_t, end_t)
WHERE b.name = 'Willow Glen Farm Stand' AND b.owner_id = 'a1111111-1111-1111-1111-111111111111'
ON CONFLICT DO NOTHING;

-- Sam's Saturday Market Stand
INSERT INTO booth_fulfillment_windows (booth_id, window_type, day_of_week, start_time, end_time)
SELECT b.id, 'pickup', d.day, d.start_t::time, d.end_t::time
FROM market_booths b,
  (VALUES ('sat', '09:00', '13:00')) AS d(day, start_t, end_t)
WHERE b.name = 'Sam''s Saturday Market Stand' AND b.owner_id = 'a1111111-1111-1111-1111-111111111111'
ON CONFLICT DO NOTHING;

-- Sam's Saturday Market
INSERT INTO booth_fulfillment_windows (booth_id, window_type, day_of_week, start_time, end_time)
SELECT b.id, 'pickup', d.day, d.start_t::time, d.end_t::time
FROM market_booths b,
  (VALUES ('sat', '08:00', '12:00'), ('sun', '10:00', '14:00')) AS d(day, start_t, end_t)
WHERE b.name = 'Sam''s Saturday Market' AND b.owner_id = 'a1111111-1111-1111-1111-111111111111'
ON CONFLICT DO NOTHING;


-- ── 6. Update seed data: populate decomposed address fields for all demo booths ──

-- Willow Glen Farm Stand
UPDATE market_booths SET
  booth_street = '1168 Lincoln Ave', booth_city = 'San Jose', booth_state = 'CA', booth_zip = '95125',
  pickup_street = '1168 Lincoln Ave', pickup_city = 'San Jose', pickup_state = 'CA', pickup_zip = '95125'
WHERE name = 'Willow Glen Farm Stand' AND owner_id = 'a1111111-1111-1111-1111-111111111111';

-- Sam's Saturday Market Stand
UPDATE market_booths SET
  booth_street = '1168 Lincoln Ave', booth_city = 'San Jose', booth_state = 'CA', booth_zip = '95125',
  pickup_street = '1168 Lincoln Ave', pickup_city = 'San Jose', pickup_state = 'CA', pickup_zip = '95125'
WHERE name = 'Sam''s Saturday Market Stand' AND owner_id = 'a1111111-1111-1111-1111-111111111111';

-- Sam's Saturday Market
UPDATE market_booths SET
  booth_street = 'San Jose Farmers Market, 760 W San Carlos St', booth_city = 'San Jose', booth_state = 'CA', booth_zip = '95126',
  pickup_street = 'San Jose Farmers Market, 760 W San Carlos St', pickup_city = 'San Jose', pickup_state = 'CA', pickup_zip = '95126'
WHERE name = 'Sam''s Saturday Market' AND owner_id = 'a1111111-1111-1111-1111-111111111111';

-- Maria's Garden Fresh
UPDATE market_booths SET
  booth_street = '456 Garden Way', booth_city = 'San Jose', booth_state = 'CA', booth_zip = '95112',
  pickup_street = '456 Garden Way', pickup_city = 'San Jose', pickup_state = 'CA', pickup_zip = '95112'
WHERE name = 'Maria''s Garden Fresh';

-- James' Herbs & Honey
UPDATE market_booths SET
  booth_street = '789 Honey Lane', booth_city = 'Campbell', booth_state = 'CA', booth_zip = '95008',
  pickup_street = '789 Honey Lane', pickup_city = 'Campbell', pickup_state = 'CA', pickup_zip = '95008'
WHERE name = 'Herbs & Honey by James';

-- Sofia's Kitchen Garden
UPDATE market_booths SET
  booth_street = '321 Kitchen Garden Dr', booth_city = 'Santa Clara', booth_state = 'CA', booth_zip = '95051',
  pickup_street = '321 Kitchen Garden Dr', pickup_city = 'Santa Clara', pickup_state = 'CA', pickup_zip = '95051'
WHERE name = 'Sofia''s Kitchen Garden';

-- Raj's Tropical Orchard
UPDATE market_booths SET
  booth_street = '555 Tropical Ave', booth_city = 'Sunnyvale', booth_state = 'CA', booth_zip = '94087',
  pickup_street = '555 Tropical Ave', pickup_city = 'Sunnyvale', pickup_state = 'CA', pickup_zip = '94087'
WHERE name = 'Raj''s Tropical Orchard';

-- Taylor's Garden Stand
UPDATE market_booths SET
  booth_street = '222 Blossom Hill Rd', booth_city = 'San Jose', booth_state = 'CA', booth_zip = '95123',
  pickup_street = '222 Blossom Hill Rd', pickup_city = 'San Jose', pickup_state = 'CA', pickup_zip = '95123'
WHERE name = 'Taylor''s Garden Stand';
