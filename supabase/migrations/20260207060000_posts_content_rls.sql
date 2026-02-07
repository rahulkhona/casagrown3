-- Posts & Content RLS Policies
-- Principle: Public reads, owner-only writes
-- Posts are community content visible to all authenticated users.
-- Only the author/creator can insert, update, or delete their own entries.

-- ============================================================
-- posts
-- ============================================================
alter table posts enable row level security;

create policy "Posts are readable by all authenticated users"
  on posts for select to authenticated using (true);

create policy "Authors can create their own posts"
  on posts for insert to authenticated
  with check (author_id = auth.uid());

create policy "Authors can update their own posts"
  on posts for update to authenticated
  using (author_id = auth.uid());

create policy "Authors can delete their own posts"
  on posts for delete to authenticated
  using (author_id = auth.uid());

-- ============================================================
-- post_likes
-- ============================================================
alter table post_likes enable row level security;

create policy "Post likes are readable by all authenticated users"
  on post_likes for select to authenticated using (true);

create policy "Users can like posts"
  on post_likes for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can remove their own likes"
  on post_likes for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- post_comments
-- ============================================================
alter table post_comments enable row level security;

create policy "Post comments are readable by all authenticated users"
  on post_comments for select to authenticated using (true);

create policy "Users can create their own comments"
  on post_comments for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update their own comments"
  on post_comments for update to authenticated
  using (user_id = auth.uid());

create policy "Users can delete their own comments"
  on post_comments for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- post_flags
-- ============================================================
alter table post_flags enable row level security;

create policy "Post flags are readable by all authenticated users"
  on post_flags for select to authenticated using (true);

create policy "Users can flag posts"
  on post_flags for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can remove their own flags"
  on post_flags for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- post_media
-- ============================================================
alter table post_media enable row level security;

create policy "Post media is readable by all authenticated users"
  on post_media for select to authenticated using (true);

-- Insert/delete for post_media is controlled through post ownership:
-- Only the post author should be able to attach/detach media.
create policy "Post authors can attach media"
  on post_media for insert to authenticated
  with check (
    post_id in (select id from posts where author_id = auth.uid())
  );

create policy "Post authors can detach media"
  on post_media for delete to authenticated
  using (
    post_id in (select id from posts where author_id = auth.uid())
  );
