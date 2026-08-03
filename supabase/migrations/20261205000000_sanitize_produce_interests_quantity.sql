-- Migration: Sanitize produce names in lead interest sync & cleanup existing (x1) duplicates
SET search_path TO public, extensions;

-- 1. Update trigger function to strip quantity parentheticals e.g. "Tomatoes (x1)" -> "Tomatoes"
CREATE OR REPLACE FUNCTION sync_lead_produce_interests()
RETURNS TRIGGER AS $$
DECLARE
  p_name TEXT;
BEGIN
  IF NEW.produce_interests IS NOT NULL AND NEW.produce_interests <> '' THEN
    FOR p_name IN SELECT unnest(string_to_array(NEW.produce_interests, ',')) LOOP
      -- Strip quantity parentheses e.g. "Tomatoes (x1)" -> "Tomatoes", "Lemons (x2)" -> "Lemons"
      p_name := trim(regexp_replace(p_name, '\s*\([xX]?\d+\)', '', 'g'));
      
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

COMMENT ON FUNCTION sync_lead_produce_interests IS 'Parses produce_interests on crm_leads, strips (xN) quantity parentheticals, and syncs to crm_produce_interests.';

-- 2. Deduplicate existing rows that would conflict when produce_name is sanitized
DELETE FROM crm_produce_interests a
USING crm_produce_interests b
WHERE a.id > b.id
  AND a.lead_id IS NOT DISTINCT FROM b.lead_id
  AND a.interest_type = b.interest_type
  AND lower(trim(regexp_replace(a.produce_name, '\s*\([xX]?\d+\)', '', 'g'))) = lower(trim(regexp_replace(b.produce_name, '\s*\([xX]?\d+\)', '', 'g')));

-- 3. Normalize any remaining existing rows in crm_produce_interests with (x1) in their produce_name
UPDATE crm_produce_interests
SET produce_name = trim(regexp_replace(produce_name, '\s*\([xX]?\d+\)', '', 'g'))
WHERE produce_name ~* '\([xX]?\d+\)';
