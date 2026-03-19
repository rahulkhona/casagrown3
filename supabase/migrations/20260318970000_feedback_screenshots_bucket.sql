-- Create storage bucket for bug report screenshots
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('feedback-screenshots', 'feedback-screenshots', true, 2097152)  -- 2MB limit
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload screenshots
CREATE POLICY "Users can upload feedback screenshots"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'feedback-screenshots');

-- Allow public read access to screenshots (so admins can view them)
CREATE POLICY "Public read access for feedback screenshots"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'feedback-screenshots');
