-- Zone-based change tracking for market page polling optimization.
-- Instead of polling nearby_booths every 2 min, the frontend polls this
-- tiny table every 30s with pre-computed H3 zone IDs to detect changes.

-- 1. Zone pulse tracking table (one row per H3 zone)
CREATE TABLE IF NOT EXISTS zone_pulse (
  zone_id TEXT PRIMARY KEY,
  last_updated TIMESTAMPTZ DEFAULT now()
);

-- 2. Trigger function: upsert zone_pulse on booth/product change
CREATE OR REPLACE FUNCTION update_zone_pulse()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_zone TEXT;
BEGIN
  IF TG_TABLE_NAME = 'market_products' THEN
    SELECT b.community_h3_index INTO v_zone
    FROM booths b WHERE b.id = COALESCE(NEW.booth_id, OLD.booth_id);
  ELSE
    -- booths table: use community_h3_index directly
    v_zone := COALESCE(NEW.community_h3_index, OLD.community_h3_index);
  END IF;

  IF v_zone IS NOT NULL THEN
    INSERT INTO zone_pulse (zone_id, last_updated) VALUES (v_zone, now())
    ON CONFLICT (zone_id) DO UPDATE SET last_updated = now();
  END IF;

  RETURN COALESCE(NEW, OLD);
END; $$;

-- 3. Attach triggers
CREATE TRIGGER trg_zone_pulse_booths
  AFTER INSERT OR UPDATE OR DELETE ON booths
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
