-- ============================================================
-- CRM Sequences (DAG-based drip campaigns)
-- ============================================================

-- ─── 1. crm_sequences ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_sequences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft' 
                  CHECK (status IN ('draft', 'active', 'archived')),
  trigger_event   TEXT,                  -- 'manual', 'lead_captured', etc.
  definition      JSONB NOT NULL DEFAULT '{"nodes": [], "edges": [], "startNodeId": ""}',
  created_by      UUID REFERENCES profiles (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_sequences_status ON crm_sequences (status);

ALTER TABLE crm_sequences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY crm_sequences_staff_all ON crm_sequences
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. crm_sequence_enrollments ──────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_sequence_enrollments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id         UUID NOT NULL REFERENCES crm_sequences (id) ON DELETE CASCADE,
  recipient_type      TEXT NOT NULL CHECK (recipient_type IN ('lead', 'user')),
  recipient_id        UUID NOT NULL,      -- crm_leads.id or profiles.id
  current_node_id     TEXT,
  next_evaluation_at  TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'active' 
                      CHECK (status IN ('active', 'completed', 'unsubscribed', 'failed', 'paused')),
  enrolled_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sequence_id, recipient_type, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_sequence_enrollments_evaluation ON crm_sequence_enrollments (next_evaluation_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_crm_sequence_enrollments_seq ON crm_sequence_enrollments (sequence_id);

ALTER TABLE crm_sequence_enrollments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY crm_sequence_enrollments_staff_all ON crm_sequence_enrollments
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. Modify crm_campaign_sends ──────────────────────────────────
-- We need to allow sequence_sends to be logged here for analytics unification.
-- Since campaign_id was previously NOT NULL, we must make it nullable.
ALTER TABLE crm_campaign_sends ALTER COLUMN campaign_id DROP NOT NULL;

-- Add the new columns
ALTER TABLE crm_campaign_sends ADD COLUMN IF NOT EXISTS sequence_id UUID REFERENCES crm_sequences (id) ON DELETE CASCADE;
ALTER TABLE crm_campaign_sends ADD COLUMN IF NOT EXISTS node_id TEXT;

-- Ensure it points to exactly one of campaign or sequence
-- To prevent breaking existing rows before constraint, check existing data or just add NOT VALID and validate later.
-- For a fresh deploy or clean state, just adding it is fine.
ALTER TABLE crm_campaign_sends ADD CONSTRAINT chk_campaign_or_sequence CHECK (
  (campaign_id IS NOT NULL AND sequence_id IS NULL) OR 
  (campaign_id IS NULL AND sequence_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_crm_sends_sequence ON crm_campaign_sends (sequence_id);

-- Update short links as well to support sequence tracking
ALTER TABLE crm_short_links ADD COLUMN IF NOT EXISTS sequence_id UUID REFERENCES crm_sequences (id) ON DELETE CASCADE;
ALTER TABLE crm_short_links ADD COLUMN IF NOT EXISTS node_id TEXT;

-- Add privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_sequences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_sequence_enrollments TO authenticated;
