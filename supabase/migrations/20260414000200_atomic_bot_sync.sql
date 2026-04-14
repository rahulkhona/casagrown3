-- ============================================================================
-- Migration: Atomic Bot Sync v2 (Race-Condition-Free)
-- Replaces the previous sync RPC with an atomic upsert + deactivation approach.
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
  v_synced_ids uuid[] := '{}';
  v_inserted_id uuid;
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
    v_county_id := NULL;
    IF (v_row->>'county_name') IS NOT NULL AND (v_row->>'county_name') != '' AND v_state_id IS NOT NULL THEN
      SELECT id INTO v_county_id 
        FROM counties 
        WHERE state_id = v_state_id AND name ILIKE '%' || (v_row->>'county_name') || '%'
        LIMIT 1;
    END IF;

    -- 3. Upsert one row per sales category
    FOR v_sales_category IN SELECT * FROM jsonb_array_elements_text(v_row->'sales_categories')
    LOOP
      -- Try to find an existing bot-created row for this exact quarantine
      SELECT id INTO v_inserted_id
        FROM quarantine_zones
        WHERE created_by_admin = false
          AND pest_name = v_row->>'pest_name'
          AND category = v_sales_category
          AND COALESCE(state_id, '00000000-0000-0000-0000-000000000000'::uuid) = 
              COALESCE(v_state_id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND COALESCE(county_id, '00000000-0000-0000-0000-000000000000'::uuid) = 
              COALESCE(v_county_id, '00000000-0000-0000-0000-000000000000'::uuid)
        LIMIT 1;

      IF v_inserted_id IS NOT NULL THEN
        -- UPDATE existing record (re-activate if deactivated, refresh metadata)
        UPDATE quarantine_zones SET
          is_active = true,
          produce_categories = ARRAY(SELECT jsonb_array_elements_text(v_row->'produce_categories')),
          keywords = ARRAY(SELECT jsonb_array_elements_text(v_row->'keywords')),
          reason = v_row->>'notes',
          starts_at = COALESCE((NULLIF(v_row->>'starts_at', ''))::timestamptz, starts_at),
          ends_at = (NULLIF(v_row->>'ends_at', ''))::timestamptz,
          data_source = COALESCE(v_row->>'data_source', 'Bot'),
          source_url = v_row->>'source_url',
          updated_at = now()
        WHERE id = v_inserted_id;
      ELSE
        -- INSERT new record
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
        )
        RETURNING id INTO v_inserted_id;
      END IF;

      -- Track this ID as "still active in the latest scrape"
      v_synced_ids := v_synced_ids || v_inserted_id;
    END LOOP;

    -- reset for next iteration
    v_state_id := NULL;
  END LOOP;

  -- 4. Deactivate bot records that were NOT in this scrape (quarantine lifted)
  UPDATE quarantine_zones
    SET is_active = false, updated_at = now()
    WHERE created_by_admin = false
      AND is_active = true
      AND id != ALL(v_synced_ids);

  -- 5. Clean up very old deactivated bot records (>90 days inactive)
  DELETE FROM quarantine_zones
    WHERE created_by_admin = false
      AND is_active = false
      AND updated_at < now() - interval '90 days';
END;
$$;
