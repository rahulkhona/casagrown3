-- ============================================================
-- Migration: community_produce_catalog
-- Enforces:
--   1. Mandatory COMMENT ON for table and columns
--   2. Explicit Data API grants and RLS public read policies
--   3. Fast 1-to-1 lookup for custom community produce/garden items
-- ============================================================

SET search_path TO public, extensions;

CREATE TABLE IF NOT EXISTS community_produce_catalog (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'produce',
  image       TEXT NOT NULL DEFAULT '/images/produce_placeholder.jpg',
  use_count   INT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE community_produce_catalog IS 'Catalog of custom community-added produce, plants, seeds, flowers, eggs, honey, and garden items';
COMMENT ON COLUMN community_produce_catalog.id IS 'Normalized slug identifier (e.g. chickoo)';
COMMENT ON COLUMN community_produce_catalog.name IS 'Display name of the custom item (e.g. Chickoo)';
COMMENT ON COLUMN community_produce_catalog.category IS 'Category of the custom item (produce, flowers, herbs, plants, seeds, etc.)';
COMMENT ON COLUMN community_produce_catalog.image IS 'Resolved stock photo URL or placeholder graphic';
COMMENT ON COLUMN community_produce_catalog.use_count IS 'Total number of users who have requested or listed this item';

CREATE INDEX IF NOT EXISTS idx_community_produce_catalog_name ON community_produce_catalog (lower(name));

ALTER TABLE community_produce_catalog ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY community_produce_catalog_read ON community_produce_catalog
    FOR SELECT TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY community_produce_catalog_insert ON community_produce_catalog
    FOR INSERT TO anon, authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY community_produce_catalog_update ON community_produce_catalog
    FOR UPDATE TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE ON community_produce_catalog TO anon, authenticated, service_role;
