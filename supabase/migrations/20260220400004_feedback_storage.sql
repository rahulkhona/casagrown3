-- Create a storage bucket for feedback-related media (comment attachments, screenshots)
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-media', 'feedback-media', true);

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload feedback media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'feedback-media');

-- Allow everyone to read
CREATE POLICY "Feedback media publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'feedback-media');

-- Allow owners to delete
CREATE POLICY "Users can delete own feedback media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'feedback-media' AND (storage.foldername(name))[1] = auth.uid()::text);
