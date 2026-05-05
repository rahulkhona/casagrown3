-- ============================================================
-- Add utm_term to crm_page_visits and crm_leads
-- Supports Google Ads paid keyword tracking
-- ============================================================

ALTER TABLE crm_page_visits
  ADD COLUMN IF NOT EXISTS utm_term TEXT;

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS utm_term TEXT;

CREATE INDEX IF NOT EXISTS idx_crm_page_visits_utm_term
  ON crm_page_visits (utm_term)
  WHERE utm_term IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_utm_term
  ON crm_leads (utm_term)
  WHERE utm_term IS NOT NULL;

-- Add a label to crm_short_links for URL builder (admin-facing description)
ALTER TABLE crm_short_links
  ADD COLUMN IF NOT EXISTS label TEXT;
