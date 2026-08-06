-- Create permanent public storage bucket for master produce catalog images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'produce-images',
  'produce-images',
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760;

-- Public read access policy
CREATE POLICY "Public Read Access for produce-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'produce-images');

-- Service role & authenticated upload policy
CREATE POLICY "Authenticated Upload Access for produce-images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'produce-images');

COMMENT ON TABLE storage.objects IS 'Storage objects repository; produce-images bucket stores permanent master catalog photos without expiration.';
