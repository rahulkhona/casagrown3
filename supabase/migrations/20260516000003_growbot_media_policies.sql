-- Allow anyone (including guests) to upload to chat-media/growbot/ for poll images
-- The bucket is already public for reads, this just enables guest uploads to the growbot folder.
CREATE POLICY "chat_media_growbot_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] = 'growbot'
  );

-- Allow public reads on chat-media for shared poll images (the bucket is public but needs a SELECT policy)
CREATE POLICY "chat_media_public_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] = 'growbot'
  );
