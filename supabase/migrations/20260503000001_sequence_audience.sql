-- Migration: Add sequence_id to crm_campaigns for Snapshot Drips
-- This allows one-off broadcasts to automatically enroll users into a drip sequence upon send.

DO $$ BEGIN
  ALTER TABLE crm_campaigns ADD COLUMN sequence_id UUID REFERENCES crm_sequences(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
