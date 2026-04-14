-- ============================================================================
-- Migration: Fix Bot Sync Empty Dates
-- The sync_bot_quarantines RPC was failing silently because records from 
-- APHIS/state sources without dates produced empty strings '' which caused
-- ''::timestamptz to throw a Postgres exception, rolling back the entire
-- RPC transaction. This meant the DELETE ran but the INSERT never committed,
-- leaving the quarantine_zones table empty.
--
-- Fix: Use NULLIF(value, '') to convert empty strings to NULL before casting.
-- Also: Insert the bot's 'notes' field into the 'reason' column.
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_bot_quarantines(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row jsonb;
  v_county_id uuid;
  v_state_id uuid;
  v_sales_category text;
BEGIN
  -- Validate payload
  IF jsonb_typeof(p_payload) != 'array' THEN
    RAISE EXCEPTION 'Payload must be a JSON array';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_payload)
  LOOP
    -- 1. Resolve state by code
    SELECT id INTO v_state_id 
      FROM states 
      WHERE code = v_row->>'state_code' 
      LIMIT 1;

    -- 2. Resolve county by name within state
    IF (v_row->>'county_name') IS NOT NULL AND v_state_id IS NOT NULL THEN
      SELECT id INTO v_county_id 
        FROM counties 
        WHERE state_id = v_state_id AND name ILIKE '%' || (v_row->>'county_name') || '%'
        LIMIT 1;
    END IF;

    -- 3. Insert one row per sales category
    FOR v_sales_category IN SELECT * FROM jsonb_array_elements_text(v_row->'sales_categories')
    LOOP
      INSERT INTO quarantine_zones (
        state_id,
        county_id,
        pest_name,
        category,
        produce_categories,
        keywords,
        reason,
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
        v_sales_category,
        ARRAY(SELECT jsonb_array_elements_text(v_row->'produce_categories')),
        ARRAY(SELECT jsonb_array_elements_text(v_row->'keywords')),
        v_row->>'notes',
        COALESCE((NULLIF(v_row->>'starts_at', ''))::timestamptz, now()),
        (NULLIF(v_row->>'ends_at', ''))::timestamptz,
        COALESCE(v_row->>'data_source', 'Bot'),
        v_row->>'source_url',
        true,
        false,
        now(),
        now()
      );
    END LOOP;
    
    -- reset ids for next iteration
    v_county_id := NULL;
    v_state_id := NULL;
  END LOOP;
END;
$$;
