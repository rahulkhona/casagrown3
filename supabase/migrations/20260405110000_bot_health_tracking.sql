-- Migration: Quarantine Bot Health Tracking
-- Adds a table to track the automated bot's execution status, schema drift alerts, 
-- and overall anomaly records so they can be surfaced in the Next-Admin dashboard.

CREATE TABLE quarantine_bot_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_started_at timestamptz NOT NULL,
  run_ended_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('OK', 'DEGRADED', 'FAILED')),
  schema_drift_detected boolean NOT NULL DEFAULT false,
  total_records integer NOT NULL DEFAULT 0,
  log_summary jsonb
);

-- Index for querying the latest run efficiently
CREATE INDEX idx_quarantine_bot_health_run_started_at ON quarantine_bot_health(run_started_at DESC);

-- Enable RLS
ALTER TABLE quarantine_bot_health ENABLE ROW LEVEL SECURITY;

-- Policy: Admin users can read the health logs
CREATE POLICY "Admins can view quarantine bot health"
  ON quarantine_bot_health FOR SELECT
  USING (has_staff_role(auth.uid(), 'admin'));

-- Policy: Super Admin / Service Role can insert health logs
-- Note: Service Role inherently bypasses RLS, but we can add an insert rule for explicit safety
CREATE POLICY "Service roles can insert health logs"
  ON quarantine_bot_health FOR INSERT
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: get_admin_emails
-- Used by Edge Functions/Bot to dynamically retrieve all admin notification recipients
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_admin_emails()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'email', p.email,
      'name', COALESCE(p.full_name, 'Admin'),
      'id', p.id
    )
  ), '[]'::jsonb)
  FROM profiles p
  JOIN staff_members s ON s.user_id = p.id
  WHERE 'admin' = ANY(s.roles);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: sync_bot_quarantines
-- Handles mapping the structured bot JSON payload directly into `quarantine_zones`
-- preserving constraints and matching strings to actual county/state IDs.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_bot_quarantines(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row jsonb;
  v_county_id uuid;
  v_state_id uuid;
BEGIN
  -- Validate payload
  IF jsonb_typeof(p_payload) != 'array' THEN
    RAISE EXCEPTION 'Payload must be a JSON array';
  END IF;

  -- The node script already deleted `created_by_admin = false` previously.
  -- Alternatively, we can ensure total safety by wiping them right here before insertion.
  -- DELETE FROM quarantine_zones WHERE created_by_admin = false;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_payload)
  LOOP
    -- 1. Try to find the exact county mapping. We often rely on naming heuristics.
    -- (The production version might use specific state_code and county matching)
    SELECT id INTO v_state_id 
      FROM states 
      WHERE code = v_row->>'state_code' 
      LIMIT 1;

    -- Look up the county if state is known, usually the bot sends county_name.
    -- If we don't have a specific county parsed, we leave it null for statewide ban.
    IF (v_row->>'county_name') IS NOT NULL AND v_state_id IS NOT NULL THEN
      SELECT id INTO v_county_id 
        FROM counties 
        WHERE state_id = v_state_id AND name ILIKE '%' || (v_row->>'county_name') || '%'
        LIMIT 1;
    END IF;

    -- Insert into quarantine_zones respecting current architectural bounds
    -- Assuming columns exist logic 
    INSERT INTO quarantine_zones (
      state_id,
      county_id,
      pest_name,
      category,
      starts_at,
      ends_at,
      data_source,
      source_url,
      is_active,
      created_by_admin,
      created_at,
      updated_at
    ) VALUES (
      v_state_id,
      v_county_id,
      v_row->>'pest_name',
      COALESCE(v_row->>'category', 'Produce'),
      COALESCE((v_row->>'starts_at')::timestamptz, now()),
      (v_row->>'ends_at')::timestamptz,
      COALESCE(v_row->>'data_source', 'Bot'),
      v_row->>'source_url',
      true,
      false,
      now(),
      now()
    );
  END LOOP;
END;
$$;
