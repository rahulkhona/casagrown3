-- ============================================================
-- Migration: interest_image_overrides
-- Stores admin-uploaded image overrides for catalog items.
-- Also adds storage policies for community and admin uploads.
-- ============================================================

SET search_path TO public, extensions;

-- Table to store admin-uploaded image overrides for catalog items
CREATE TABLE IF NOT EXISTS interest_image_overrides (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id      text NOT NULL UNIQUE,   -- matches ProduceItem.id (e.g. 'lemons', 'cilantro')
  image_url    text NOT NULL,           -- public storage URL
  uploaded_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE interest_image_overrides IS '@audience:no Admin-uploaded image overrides for interest catalog items. Stored in interest-images/catalog/ bucket prefix.';
COMMENT ON COLUMN interest_image_overrides.item_id IS 'Catalog item slug matching ProduceItem.id (e.g. lemons, cilantro, tomato_seedling)';
COMMENT ON COLUMN interest_image_overrides.image_url IS 'Public Supabase storage URL for the uploaded image (interest-images/catalog/{item_id}.jpg)';

ALTER TABLE interest_image_overrides ENABLE ROW LEVEL SECURITY;

-- Admins can read all overrides
DO $$ BEGIN
  CREATE POLICY interest_image_overrides_read ON interest_image_overrides
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only service_role can insert/update (done via admin app which uses anon key but
-- the storage upload is the real action; DB write is from a server API route)
DO $$ BEGIN
  CREATE POLICY interest_image_overrides_write ON interest_image_overrides
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT ON interest_image_overrides TO anon, authenticated;
GRANT ALL ON interest_image_overrides TO service_role;

-- ── Storage Policies ────────────────────────────────────────────────────────

-- Allow authenticated users to upload their own community images
DO $$ BEGIN
  CREATE POLICY "community_interest_upload"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'interest-images'
      AND name LIKE 'community/' || auth.uid()::text || '/%'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Allow authenticated users to update (upsert) their own community images
DO $$ BEGIN
  CREATE POLICY "community_interest_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'interest-images'
      AND name LIKE 'community/' || auth.uid()::text || '/%'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Allow authenticated users to upload to catalog/ (admin action, gated in app layer)
DO $$ BEGIN
  CREATE POLICY "catalog_image_upload"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'interest-images'
      AND name LIKE 'catalog/%'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "catalog_image_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'interest-images'
      AND name LIKE 'catalog/%'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
