-- Migration: Campaign Lead Interest Sync

SET search_path TO public, extensions;

-- Add unique constraint to allow ON CONFLICT DO NOTHING
ALTER TABLE crm_produce_interests
  DROP CONSTRAINT IF EXISTS crm_produce_interests_lead_dedup_key;
ALTER TABLE crm_produce_interests
  ADD CONSTRAINT crm_produce_interests_lead_dedup_key UNIQUE (lead_id, interest_type, produce_name);

CREATE OR REPLACE FUNCTION sync_lead_produce_interests()
RETURNS TRIGGER AS $$
DECLARE
  p_name TEXT;
BEGIN
  IF NEW.produce_interests IS NOT NULL AND NEW.produce_interests <> '' THEN
    FOR p_name IN SELECT unnest(string_to_array(NEW.produce_interests, ',')) LOOP
      p_name := trim(p_name);
      IF p_name <> '' THEN
        INSERT INTO crm_produce_interests (
          lead_id,
          interest_type,
          produce_name,
          zipcodes
        ) VALUES (
          NEW.id,
          COALESCE(NEW.metadata->>'interest_type', 'sell'),
          p_name,
          CASE WHEN NEW.zipcode IS NOT NULL THEN ARRAY[NEW.zipcode] ELSE '{}'::TEXT[] END
        )
        ON CONFLICT (lead_id, interest_type, produce_name) DO NOTHING;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_lead_produce_interests ON crm_leads;
CREATE TRIGGER trigger_sync_lead_produce_interests
AFTER INSERT OR UPDATE OF produce_interests ON crm_leads
FOR EACH ROW
EXECUTE FUNCTION sync_lead_produce_interests();

COMMENT ON FUNCTION sync_lead_produce_interests IS 'Parses comma-separated produce_interests on crm_leads and creates structured crm_produce_interests rows.';
COMMENT ON TRIGGER trigger_sync_lead_produce_interests ON crm_leads IS 'Fires on insert/update of produce_interests to sync to crm_produce_interests.';
