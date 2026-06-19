-- Enforce unique constraint on email in crm_leads table
ALTER TABLE public.crm_leads ADD CONSTRAINT crm_leads_email_key UNIQUE (email);

-- Trigger function to handle merging fields and appending ingestion history timeline on conflicts
CREATE OR REPLACE FUNCTION public.handle_crm_lead_upsert()
RETURNS TRIGGER AS $$
DECLARE
  v_source TEXT;
  v_history JSONB;
  v_entry JSONB;
BEGIN
  -- 1. Determine current ingestion source
  v_source := COALESCE(
    NEW.metadata->>'ingested_from', 
    NEW.source_platform, 
    'landing_page'
  );

  -- 2. Build the history entry
  v_entry := jsonb_build_object(
    'source', v_source,
    'timestamp', timezone('utc', now())::text
  );

  IF TG_OP = 'INSERT' THEN
    -- Initialize the ingestion timeline history list
    v_history := jsonb_build_array(v_entry);
    NEW.metadata := jsonb_set(NEW.metadata, '{ingestion_history}', v_history);
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Merge metadata keys (keeping old keys if not provided in new)
    NEW.metadata := OLD.metadata || NEW.metadata;

    -- Get/initialize history timeline
    v_history := COALESCE(OLD.metadata->'ingestion_history', jsonb_build_array());
    
    -- Append new entry if the last entry's source is different
    IF jsonb_array_length(v_history) = 0 OR (v_history->(jsonb_array_length(v_history) - 1)->>'source') != v_source THEN
      v_history := v_history || v_entry;
    END IF;
    
    NEW.metadata := jsonb_set(NEW.metadata, '{ingestion_history}', v_history);

    -- Preserve existing columns if the new update has NULL/blank values
    NEW.phone := COALESCE(NEW.phone, OLD.phone);
    NEW.zipcode := COALESCE(NEW.zipcode, OLD.zipcode);
    NEW.source_platform := COALESCE(OLD.source_platform, NEW.source_platform);
    NEW.utm_medium := COALESCE(OLD.utm_medium, NEW.utm_medium);
    NEW.utm_campaign := COALESCE(OLD.utm_campaign, NEW.utm_campaign);
    NEW.utm_content := COALESCE(OLD.utm_content, NEW.utm_content);
    NEW.utm_term := COALESCE(OLD.utm_term, NEW.utm_term);
    NEW.landing_page_id := COALESCE(OLD.landing_page_id, NEW.landing_page_id);
    NEW.referring_user_id := COALESCE(OLD.referring_user_id, NEW.referring_user_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Bind the BEFORE INSERT OR UPDATE trigger
CREATE OR REPLACE TRIGGER trg_crm_leads_upsert
  BEFORE INSERT OR UPDATE ON public.crm_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_crm_lead_upsert();
