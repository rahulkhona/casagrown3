-- Migration: Add crm_message_variants for step-level and campaign-level MAB variants
-- Purely additive DDL, zero downtime.

CREATE TABLE IF NOT EXISTS crm_message_variants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id       UUID REFERENCES crm_sequences(id) ON DELETE CASCADE,
  campaign_id       UUID REFERENCES crm_campaigns(id) ON DELETE CASCADE,
  node_id           TEXT,               -- NULL for campaign-level variants
  variant_name      TEXT NOT NULL DEFAULT 'Variant A',
  subject           TEXT,               -- Email subject line
  content_html      TEXT,               -- Email HTML body
  content_text      TEXT,               -- Email text / SMS body
  is_active         BOOLEAN NOT NULL DEFAULT true,
  prior_alpha       INTEGER NOT NULL DEFAULT 1,
  prior_beta        INTEGER NOT NULL DEFAULT 9,
  sends_count       INTEGER NOT NULL DEFAULT 0,
  opens_count       INTEGER NOT NULL DEFAULT 0,
  clicks_count      INTEGER NOT NULL DEFAULT 0,
  conversions_count INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_variant_context CHECK (
    (sequence_id IS NOT NULL AND campaign_id IS NULL)
    OR (campaign_id IS NOT NULL AND sequence_id IS NULL)
  )
);

COMMENT ON TABLE crm_message_variants IS 'Stores A/B test message variants for Thompson Sampling in sequences and campaigns.';
COMMENT ON COLUMN crm_message_variants.id IS 'Unique identifier for the variant.';
COMMENT ON COLUMN crm_message_variants.sequence_id IS 'Associated sequence ID, if this variant is part of a sequence node.';
COMMENT ON COLUMN crm_message_variants.campaign_id IS 'Associated campaign ID, if this variant is part of a broadcast campaign.';
COMMENT ON COLUMN crm_message_variants.node_id IS 'The React Flow node ID this variant belongs to, if part of a sequence.';
COMMENT ON COLUMN crm_message_variants.variant_name IS 'Internal label for the variant (e.g., Variant A).';
COMMENT ON COLUMN crm_message_variants.subject IS 'The subject line (for email variants).';
COMMENT ON COLUMN crm_message_variants.content_html IS 'The HTML content body (for email).';
COMMENT ON COLUMN crm_message_variants.content_text IS 'The plaintext content body (for email or SMS).';
COMMENT ON COLUMN crm_message_variants.is_active IS 'Whether the variant is currently active in the sampling pool.';
COMMENT ON COLUMN crm_message_variants.prior_alpha IS 'The Alpha prior for the Beta distribution used in Thompson Sampling.';
COMMENT ON COLUMN crm_message_variants.prior_beta IS 'The Beta prior for the Beta distribution used in Thompson Sampling.';
COMMENT ON COLUMN crm_message_variants.sends_count IS 'Total number of times this variant has been sent.';
COMMENT ON COLUMN crm_message_variants.opens_count IS 'Total number of times this variant has been opened.';
COMMENT ON COLUMN crm_message_variants.clicks_count IS 'Total number of times links in this variant have been clicked.';
COMMENT ON COLUMN crm_message_variants.conversions_count IS 'Total number of downstream conversions attributed to this variant.';
COMMENT ON COLUMN crm_message_variants.created_at IS 'Creation timestamp.';
COMMENT ON COLUMN crm_message_variants.updated_at IS 'Last update timestamp.';

CREATE INDEX IF NOT EXISTS idx_crm_message_variants_sequence_node
  ON crm_message_variants(sequence_id, node_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_crm_message_variants_campaign
  ON crm_message_variants(campaign_id) WHERE is_active = true;

-- Add tracking columns to other tables
ALTER TABLE crm_campaign_sends
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES crm_message_variants(id) ON DELETE SET NULL;

ALTER TABLE crm_short_links
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES crm_message_variants(id) ON DELETE SET NULL;

ALTER TABLE crm_page_visits
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES crm_message_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sequence_id UUID REFERENCES crm_sequences(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS node_id TEXT;

-- RLS Enablement
ALTER TABLE crm_message_variants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY crm_message_variants_staff_all ON crm_message_variants
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table privileges for PostgREST
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_message_variants TO authenticated;
GRANT SELECT ON public.crm_message_variants TO anon;
