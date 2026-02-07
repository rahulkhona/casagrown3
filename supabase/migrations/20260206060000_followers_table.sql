-- Create followers table for user-to-user follow relationships
create table followers (
  follower_id uuid references profiles(id) on delete cascade,
  followed_id uuid references profiles(id) on delete cascade,
  created_at  timestamptz default now(),
  primary key (follower_id, followed_id),
  constraint no_self_follow check (follower_id != followed_id)
);

-- Index for efficient lookup of who a user follows and who follows a user
create index idx_followers_follower on followers (follower_id);
create index idx_followers_followed on followers (followed_id);

-- RLS policies
alter table followers enable row level security;

-- Users can see their own follow relationships (as follower or followed)
create policy "Users can view own follows"
  on followers for select
  using (auth.uid() in (follower_id, followed_id));

-- Users can follow others (only insert as themselves)
create policy "Users can follow others"
  on followers for insert
  with check (auth.uid() = follower_id);

-- Users can unfollow (only delete their own follows)
create policy "Users can unfollow"
  on followers for delete
  using (auth.uid() = follower_id);
