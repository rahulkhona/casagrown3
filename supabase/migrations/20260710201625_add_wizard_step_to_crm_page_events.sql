ALTER TABLE crm_page_events ADD COLUMN IF NOT EXISTS event_data JSONB;

ALTER TABLE crm_page_events DROP CONSTRAINT IF EXISTS crm_page_events_event_type_check;
ALTER TABLE crm_page_events ADD CONSTRAINT crm_page_events_event_type_check 
  CHECK (event_type IN ('button_click', 'calculator_used', 'form_start', 'form_abandon', 'cta_clicked', 'scroll_50', 'scroll_90', 'wizard_step'));
