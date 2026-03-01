-- ============================================================================
-- Migration: Incentive Campaigns
-- Creates campaign management tables and adds campaign tracking to point_ledger.
-- ============================================================================

-- 1. Enum for incentivized behaviors (extensible via ALTER TYPE .. ADD VALUE)
CREATE TYPE campaign_behavior AS ENUM (
  'signup',
  'first_post',
  'first_purchase',
  'first_sale',
  'per_referral',
  'first_purchase_by_referee',
  'first_sale_by_referee'
);

-- 2. Master campaign table
CREATE TABLE IF NOT EXISTS incentive_campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_campaign_dates CHECK (ends_at > starts_at)
);

-- 3. Which H3 zones a campaign targets
CREATE TABLE IF NOT EXISTS campaign_zones (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID NOT NULL REFERENCES incentive_campaigns(id) ON DELETE CASCADE,
  community_h3_index  TEXT REFERENCES communities(h3_index),
  UNIQUE(campaign_id, community_h3_index)
);

-- 4. Point reward per behavior per campaign
CREATE TABLE IF NOT EXISTS campaign_rewards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES incentive_campaigns(id) ON DELETE CASCADE,
  behavior    campaign_behavior NOT NULL,
  points      INTEGER NOT NULL CHECK (points > 0),
  UNIQUE(campaign_id, behavior)
);

-- 5. Add campaign columns to existing point_ledger for claim tracking
ALTER TABLE point_ledger
  ADD COLUMN IF NOT EXISTS campaign_id       UUID REFERENCES incentive_campaigns(id),
  ADD COLUMN IF NOT EXISTS campaign_behavior campaign_behavior;

-- 6. Prevent double-claiming: one reward per (campaign, user, behavior)
-- For per_referral: includes reference_id so you earn once per referee
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_campaign_dedup
  ON point_ledger (campaign_id, user_id, campaign_behavior, COALESCE(reference_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE campaign_id IS NOT NULL;

-- 7. Useful indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_active
  ON incentive_campaigns (is_active, starts_at, ends_at)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_campaign_zones_h3
  ON campaign_zones (community_h3_index);
