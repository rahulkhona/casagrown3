-- RLS policies for post detail tables
-- Allows post authors to manage their own detail records

-- =============================================================================
-- want_to_sell_details
-- =============================================================================

-- Enable RLS
alter table want_to_sell_details enable row level security;

-- Anyone authenticated can read sell details (needed to display posts)
create policy "Sell details are viewable by authenticated users"
  on want_to_sell_details for select
  to authenticated
  using (true);

-- Only the post author can insert sell details
create policy "Users can insert sell details for their own posts"
  on want_to_sell_details for insert
  to authenticated
  with check (
    exists (
      select 1 from posts
      where posts.id = want_to_sell_details.post_id
        and posts.author_id = auth.uid()
    )
  );

-- Only the post author can update sell details
create policy "Users can update sell details for their own posts"
  on want_to_sell_details for update
  to authenticated
  using (
    exists (
      select 1 from posts
      where posts.id = want_to_sell_details.post_id
        and posts.author_id = auth.uid()
    )
  );

-- Only the post author can delete sell details
create policy "Users can delete sell details for their own posts"
  on want_to_sell_details for delete
  to authenticated
  using (
    exists (
      select 1 from posts
      where posts.id = want_to_sell_details.post_id
        and posts.author_id = auth.uid()
    )
  );

-- =============================================================================
-- want_to_buy_details
-- =============================================================================

-- Enable RLS
alter table want_to_buy_details enable row level security;

-- Anyone authenticated can read buy details
create policy "Buy details are viewable by authenticated users"
  on want_to_buy_details for select
  to authenticated
  using (true);

-- Only the post author can insert buy details
create policy "Users can insert buy details for their own posts"
  on want_to_buy_details for insert
  to authenticated
  with check (
    exists (
      select 1 from posts
      where posts.id = want_to_buy_details.post_id
        and posts.author_id = auth.uid()
    )
  );

-- Only the post author can update buy details
create policy "Users can update buy details for their own posts"
  on want_to_buy_details for update
  to authenticated
  using (
    exists (
      select 1 from posts
      where posts.id = want_to_buy_details.post_id
        and posts.author_id = auth.uid()
    )
  );

-- Only the post author can delete buy details
create policy "Users can delete buy details for their own posts"
  on want_to_buy_details for delete
  to authenticated
  using (
    exists (
      select 1 from posts
      where posts.id = want_to_buy_details.post_id
        and posts.author_id = auth.uid()
    )
  );

-- =============================================================================
-- delivery_dates
-- =============================================================================

-- Enable RLS
alter table delivery_dates enable row level security;

-- Anyone authenticated can read delivery dates
create policy "Delivery dates are viewable by authenticated users"
  on delivery_dates for select
  to authenticated
  using (true);

-- Only the post author can insert delivery dates
create policy "Users can insert delivery dates for their own posts"
  on delivery_dates for insert
  to authenticated
  with check (
    exists (
      select 1 from posts
      where posts.id = delivery_dates.post_id
        and posts.author_id = auth.uid()
    )
  );

-- Only the post author can update delivery dates
create policy "Users can update delivery dates for their own posts"
  on delivery_dates for update
  to authenticated
  using (
    exists (
      select 1 from posts
      where posts.id = delivery_dates.post_id
        and posts.author_id = auth.uid()
    )
  );

-- Only the post author can delete delivery dates
create policy "Users can delete delivery dates for their own posts"
  on delivery_dates for delete
  to authenticated
  using (
    exists (
      select 1 from posts
      where posts.id = delivery_dates.post_id
        and posts.author_id = auth.uid()
    )
  );
