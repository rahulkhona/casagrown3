-- Add utm_source column to crm_leads table to fix the frontend metrics query
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS utm_source TEXT;
COMMENT ON COLUMN public.crm_leads.utm_source IS 'UTM source parameter for lead tracking attribution';
