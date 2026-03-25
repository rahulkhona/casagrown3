-- Ensure the `feedback-screenshots` bucket exists
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('feedback-screenshots', 'feedback-screenshots', true, 2097152)
ON CONFLICT (id) DO NOTHING;

-- Drop them in case they already exist to avoid errors
DROP POLICY IF EXISTS "Users can upload feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for feedback screenshots" ON storage.objects;

-- Allow ANY user (even not logged in) to upload bug reporter screenshots
CREATE POLICY "Users can upload feedback screenshots"
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'feedback-screenshots');

-- Allow ANY user to view the uploaded screenshots (Admins mapping them in Voice Portal)
CREATE POLICY "Public read access for feedback screenshots"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'feedback-screenshots');
