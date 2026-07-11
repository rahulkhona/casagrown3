-- ============================================================================
-- Migration: Fix Page Analytics errors on staging
--
-- Two issues:
--
-- 1. MISSING COLUMNS: crm_page_events is missing target_element, value_text,
--    and value_int columns on staging. The metrics_page_analytics function
--    references e.target_element, causing "column does not exist" errors
--    (42703) and crashing the Page Analytics dashboard with an infinite spinner.
--
-- 2. OVERLOADED FUNCTION: An old 5-param version of metrics_page_analytics
--    coexists with the current 9-param version, risking PostgREST ambiguity.
--
-- 3. EVENT TYPE: The crm_page_events check constraint doesn't include 'error',
--    so the errorHotspots query can never find error events. Add 'error' to
--    the allowed event_type values.
-- ============================================================================

-- 1. Add missing columns to crm_page_events
ALTER TABLE crm_page_events ADD COLUMN IF NOT EXISTS target_element TEXT;
ALTER TABLE crm_page_events ADD COLUMN IF NOT EXISTS value_text TEXT;
ALTER TABLE crm_page_events ADD COLUMN IF NOT EXISTS value_int INT;

-- 2. Drop the old 5-param overload of metrics_page_analytics
DROP FUNCTION IF EXISTS metrics_page_analytics(DATE, DATE, TEXT, TEXT, TEXT);

-- 3. Allow 'error' event type in crm_page_events
ALTER TABLE crm_page_events DROP CONSTRAINT IF EXISTS crm_page_events_event_type_check;
ALTER TABLE crm_page_events ADD CONSTRAINT crm_page_events_event_type_check
  CHECK (event_type IN (
    'button_click', 'calculator_used', 'form_start', 'form_abandon',
    'cta_clicked', 'scroll_50', 'scroll_90', 'wizard_step', 'error'
  ));
