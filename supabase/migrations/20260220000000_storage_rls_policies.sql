-- =============================================================================
-- Storage RLS Policies for all buckets
-- =============================================================================
-- Buckets: avatars (public), post-media (public), chat-media (private),
--          delivery-proofs (private), dispute-proofs (private)
-- =============================================================================

-- ─── Avatars (public bucket) ─────────────────────────────────────────────────
-- Anyone can view avatars (public bucket)
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Authenticated users can upload their own avatar (path starts with their uid)
create policy "avatars_auth_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update/overwrite their own avatar
create policy "avatars_auth_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own avatar
create policy "avatars_auth_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── Post Media (public bucket) ─────────────────────────────────────────────
-- Anyone can view post media (public bucket)
create policy "post_media_public_read"
  on storage.objects for select
  using (bucket_id = 'post-media');

-- Authenticated users can upload media under their own folder
create policy "post_media_auth_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update their own post media
create policy "post_media_auth_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own post media
create policy "post_media_auth_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── Chat Media (private bucket) ────────────────────────────────────────────
-- Authenticated users can read chat media (access controlled at app level)
create policy "chat_media_auth_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'chat-media');

-- Authenticated users can upload to chat-media under their own folder
create policy "chat_media_auth_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── Delivery Proofs (private bucket) ───────────────────────────────────────
-- Authenticated users can read delivery proofs (for order participants)
create policy "delivery_proofs_auth_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'delivery-proofs');

-- Authenticated users can upload delivery proofs under their own folder
create policy "delivery_proofs_auth_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'delivery-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── Dispute Proofs (private bucket) ────────────────────────────────────────
-- Authenticated users can read dispute proofs
create policy "dispute_proofs_auth_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'dispute-proofs');

-- Authenticated users can upload dispute proofs under their own folder
create policy "dispute_proofs_auth_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'dispute-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
