-- Storage bucket for product photos

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-photos', 'product-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: anyone can view product photos
CREATE POLICY "Public read access for product photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'product-photos');

-- RLS: authenticated users can upload to their own folder
CREATE POLICY "Authenticated users can upload product photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- RLS: users can update their own uploads
CREATE POLICY "Users can update own product photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- RLS: users can delete their own uploads
CREATE POLICY "Users can delete own product photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
