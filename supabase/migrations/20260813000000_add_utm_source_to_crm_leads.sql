-- Add utm_source column to crm_leads table to fix the frontend metrics query
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS utm_source TEXT;
