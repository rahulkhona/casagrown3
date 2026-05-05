-- Create 'media' storage bucket for CRM campaign images
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read images (public bucket for email rendering)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'media_public_read' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "media_public_read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'media');
  END IF;
END $$;

-- Admin (anon key) and authenticated users can upload to the crm/ folder
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'media_crm_insert' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "media_crm_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'media' AND (storage.foldername(name))[1] = 'crm');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'media_crm_update' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "media_crm_update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'media' AND (storage.foldername(name))[1] = 'crm');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'media_crm_delete' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "media_crm_delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'media' AND (storage.foldername(name))[1] = 'crm');
  END IF;
END $$;
