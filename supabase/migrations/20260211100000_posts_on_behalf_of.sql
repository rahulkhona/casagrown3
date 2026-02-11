-- Add on_behalf_of column to posts table
-- When a delegate creates a post, author_id = delegate (who manages the post),
-- on_behalf_of = delegator (who owns the produce/interest).

alter table posts
  add column if not exists on_behalf_of uuid references profiles(id);

-- Index for efficient lookups (e.g., "show me posts created on my behalf")
create index if not exists posts_on_behalf_of_idx on posts(on_behalf_of)
  where on_behalf_of is not null;
