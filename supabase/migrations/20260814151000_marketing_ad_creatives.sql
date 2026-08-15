-- Migration: 20260814151000_marketing_ad_creatives.sql
-- Description: Table for storing modular multi-scene ad creatives, MAB variants, and approval workflows.

CREATE TABLE IF NOT EXISTS marketing_ad_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  
  -- Context Classification
  context_type TEXT NOT NULL CHECK (context_type IN (
    'seller_single_produce', 
    'seller_multi_produce', 
    'buyer_single_produce', 
    'buyer_multi_produce', 
    'seller_demand',
    'buyer_wishlist',
    'game_promo',
    'custom_post'
  )),
  
  -- Catalog Associations
  produce_ids TEXT[] DEFAULT '{}',
  game_id TEXT,
  
  -- MAB Format & Variant
  mab_format_id TEXT NOT NULL,
  mab_format_name TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL DEFAULT '9:16' CHECK (aspect_ratio IN ('9:16', '1:1', '16:9')),
  
  -- Media Paths (Storage bucket)
  video_storage_path TEXT,
  thumbnail_storage_path TEXT,
  preview_video_url TEXT,
  duration_seconds NUMERIC(5,2) DEFAULT 14.0,
  
  -- Script & Storyboard Data
  storyboard_payload JSONB NOT NULL,
  headline TEXT,
  primary_copy TEXT,
  target_zip_codes TEXT[] DEFAULT '{}',
  
  -- Review & Approval Workflow
  approval_status TEXT NOT NULL DEFAULT 'draft_generated' 
    CHECK (approval_status IN ('draft_generated', 'needs_revision', 'approved', 'rejected', 'posted')),
  admin_feedback TEXT,
  qa_validation_log JSONB DEFAULT '{}',
  
  -- Performance Metrics
  meta_ad_id TEXT,
  impressions INT DEFAULT 0,
  clicks INT DEFAULT 0,
  conversions INT DEFAULT 0,
  spend NUMERIC(10,2) DEFAULT 0.00,
  bandit_weight NUMERIC(5,4) DEFAULT 1.0000,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schema documentation comments (Audience AI query builder context)
COMMENT ON TABLE marketing_ad_creatives IS 'Modular multi-scene video ad creatives, MAB format variants, and human approval workflow data';
COMMENT ON COLUMN marketing_ad_creatives.context_type IS 'Target context: seller_single_produce, seller_multi_produce, buyer_single_produce, buyer_multi_produce, game_promo';
COMMENT ON COLUMN marketing_ad_creatives.produce_ids IS 'Canonical produce item IDs from interests catalog (e.g. meyer_lemon, hass_avocado)';
COMMENT ON COLUMN marketing_ad_creatives.game_id IS 'Canonical game ID from gamesCatalog (e.g. garden_spell, jigsaw, queens, math_equation, garden_memory, anagram)';
COMMENT ON COLUMN marketing_ad_creatives.mab_format_id IS 'Multi-Armed Bandit variant identifier (MAB-1 to MAB-5)';
COMMENT ON COLUMN marketing_ad_creatives.storyboard_payload IS 'JSONB — Multi-scene storyboard definition. Schema: { scenes: [ { scene_number: number, name: string, duration_seconds: number, visual_description: string, narrator_voiceover: string, onscreen_text: string, media_type: string } ], cta: { button_text: string, destination_url: string, voiceover: string } }';
COMMENT ON COLUMN marketing_ad_creatives.qa_validation_log IS 'JSONB — Automated self-verification check results. Schema: { passed: boolean, checks: [ { name: string, pass: boolean, note: string } ], evaluated_at: string }';

CREATE INDEX IF NOT EXISTS idx_ad_creative_lookup 
  ON marketing_ad_creatives (context_type, approval_status);

-- RLS Policies
ALTER TABLE marketing_ad_creatives ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'marketing_ad_creatives_staff_all' AND tablename = 'marketing_ad_creatives') THEN
    CREATE POLICY marketing_ad_creatives_staff_all ON marketing_ad_creatives
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM staff_members
          WHERE staff_members.user_id = auth.uid()
        )
        OR auth.role() = 'service_role'
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM staff_members
          WHERE staff_members.user_id = auth.uid()
        )
        OR auth.role() = 'service_role'
      );
  END IF;
END $$;
