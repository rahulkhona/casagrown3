-- Zone-based change tracking for market page polling optimization.
-- Instead of polling nearby_booths every 2 min, the frontend polls this
-- tiny table every 30s with pre-computed H3 zone IDs to detect changes.

-- 1. Zone pulse tracking table (one row per H3 zone)
CREATE TABLE IF NOT EXISTS zone_pulse (
  zone_id TEXT PRIMARY KEY,
  last_updated TIMESTAMPTZ DEFAULT now()
);

-- 2. Helper: convert any H3 cell index to its resolution-5 parent.
--    Profiles store resolution-9 indices; the client polls with resolution-5
--    zone IDs (computed via h3-js). Pure bit manipulation, no extension needed.
CREATE OR REPLACE FUNCTION h3_to_r5(h3_index TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  val BIGINT;
  res INT;
  r5_val BIGINT;
  -- 10 unused child digits (res 6–15) × 3 bits = 30 bits, all set to 1
  unused_bits CONSTANT BIGINT := (1::bigint << 30) - 1;
BEGIN
  val := ('x' || lpad(h3_index, 16, '0'))::bit(64)::bigint;
  res := ((val >> 52) & 15)::int;
  IF res <= 5 THEN RETURN h3_index; END IF;

  r5_val := val & ~(15::bigint << 52);   -- clear resolution bits
  r5_val := r5_val | (5::bigint << 52);  -- set resolution to 5
  r5_val := r5_val | unused_bits;        -- fill child digits 6-15 with 7

  RETURN lower(to_hex(r5_val));
END;
$$;

-- 3. Trigger function: upsert zone_pulse on booth/product change.
--    Derives the H3 zone from the seller's profile, then converts to
--    resolution 5 so it matches the client-side h3-js zone IDs.
CREATE OR REPLACE FUNCTION update_zone_pulse()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_zone TEXT;
BEGIN
  IF TG_TABLE_NAME = 'market_products' THEN
    SELECT h3_to_r5(pr.home_community_h3_index) INTO v_zone
    FROM profiles pr WHERE pr.id = COALESCE(NEW.seller_id, OLD.seller_id);
  ELSE
    SELECT h3_to_r5(pr.home_community_h3_index) INTO v_zone
    FROM profiles pr WHERE pr.id = COALESCE(NEW.owner_id, OLD.owner_id);
  END IF;

  IF v_zone IS NOT NULL THEN
    INSERT INTO zone_pulse (zone_id, last_updated) VALUES (v_zone, now())
    ON CONFLICT (zone_id) DO UPDATE SET last_updated = now();
  END IF;

  RETURN COALESCE(NEW, OLD);
END; $$;

-- 4. Attach triggers to actual table names
CREATE TRIGGER trg_zone_pulse_booths
  AFTER INSERT OR UPDATE OR DELETE ON market_booths
  FOR EACH ROW EXECUTE FUNCTION update_zone_pulse();

CREATE TRIGGER trg_zone_pulse_products
  AFTER INSERT OR UPDATE OR DELETE ON market_products
  FOR EACH ROW EXECUTE FUNCTION update_zone_pulse();

-- 4. Lightweight RPC for frontend polling
CREATE OR REPLACE FUNCTION check_zone_pulse(p_zone_ids TEXT[])
RETURNS TIMESTAMPTZ
LANGUAGE SQL STABLE
SECURITY INVOKER
AS $$
  SELECT COALESCE(MAX(last_updated), '1970-01-01'::timestamptz)
  FROM zone_pulse
  WHERE zone_id = ANY(p_zone_ids);
$$;

-- 5. Grant access
GRANT SELECT ON zone_pulse TO authenticated, anon;
GRANT EXECUTE ON FUNCTION check_zone_pulse TO authenticated, anon;

-- 6. RLS — public read, trigger-managed writes
ALTER TABLE zone_pulse ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON zone_pulse FOR SELECT USING (true);
