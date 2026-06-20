-- Add test_emails and test_phones columns to crm_sequences for testing manual trigger sequences
ALTER TABLE public.crm_sequences ADD COLUMN IF NOT EXISTS test_emails TEXT[] DEFAULT '{}';
ALTER TABLE public.crm_sequences ADD COLUMN IF NOT EXISTS test_phones TEXT[] DEFAULT '{}';
